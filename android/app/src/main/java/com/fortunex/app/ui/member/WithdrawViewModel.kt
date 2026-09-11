package com.fortunex.app.ui.member

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.member.MemberRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.AppError
import com.fortunex.app.data.remote.Withdrawal
import com.fortunex.app.data.remote.WithdrawalQuote
import com.fortunex.app.ui.common.UiMessage
import com.fortunex.app.ui.common.toMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.util.UUID
import javax.inject.Inject

/**
 * What is standing between the member and a payout.
 *
 * The server enforces four independent gates and names each one in the error
 * code. Collapsing them into "something went wrong" is what turns a solvable
 * situation into a dead end — a member told only that it failed has no idea
 * they need to verify their identity, or wait out an address hold.
 */
sealed interface WithdrawBlock {
    data class NeedsStepUp(val requireTotp: Boolean, val message: String) : WithdrawBlock
    data class NeedsKyc(val pending: Boolean, val message: String) : WithdrawBlock
    data class AddressHold(val message: String) : WithdrawBlock
}

data class WithdrawUiState(
    val loading: Boolean = true,
    val amount: String = "",
    val address: String = "",
    val quote: WithdrawalQuote? = null,
    val quoting: Boolean = false,
    val history: List<Withdrawal> = emptyList(),
    val submitting: Boolean = false,
    val block: WithdrawBlock? = null,
    val error: UiMessage? = null,
) {
    val amountValid: Boolean
        get() = runCatching { BigDecimal(amount).signum() == 1 }.getOrDefault(false)

    /** EIP-55 shape only. The server re-checks the checksum and refuses a typo. */
    val addressValid: Boolean get() = Regex("^0x[a-fA-F0-9]{40}$").matches(address.trim())

    val canSubmit: Boolean get() = amountValid && addressValid && !submitting
}

@HiltViewModel
class WithdrawViewModel @Inject constructor(
    private val member: MemberRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(WithdrawUiState())
    val state: StateFlow<WithdrawUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    private val _submitted = Channel<Unit>(Channel.BUFFERED)
    val submitted = _submitted.receiveAsFlow()

    private var quoteJob: Job? = null
    private var idempotencyKey: String? = null

    init { load() }

    fun load() {
        viewModelScope.launch {
            when (val res = member.withdrawals()) {
                is ApiResult.Ok -> _state.value = _state.value.copy(loading = false, history = res.value)
                is ApiResult.Err -> _state.value = _state.value.copy(
                    loading = false,
                    error = if (_state.value.history.isEmpty()) res.error.toMessage() else null,
                )
            }
        }
    }

    fun onAmount(v: String) {
        val cleaned = v.filter { it.isDigit() || it == '.' }.take(12)
        _state.value = _state.value.copy(amount = cleaned, quote = null)
        requestQuote(cleaned)
    }

    fun onAddress(v: String) {
        _state.value = _state.value.copy(address = v.trim().take(42))
    }

    /**
     * Quote after a pause, not on every keystroke.
     *
     * The figure that matters is fee-and-withholding, which the server computes.
     * Asking on each character would be a request per digit; cancelling the
     * previous job means only the amount the member settled on is priced.
     */
    private fun requestQuote(amount: String) {
        quoteJob?.cancel()
        if (runCatching { BigDecimal(amount).signum() != 1 }.getOrDefault(true)) return
        quoteJob = viewModelScope.launch {
            delay(400)
            _state.value = _state.value.copy(quoting = true)
            when (val res = member.withdrawalQuote(amount)) {
                is ApiResult.Ok -> _state.value = _state.value.copy(quoting = false, quote = res.value)
                is ApiResult.Err -> _state.value = _state.value.copy(quoting = false, quote = null)
            }
        }
    }

    /** First attempt: no ticket yet. The server tells us which gate applies. */
    fun submit() {
        if (!_state.value.canSubmit) return
        attempt(stepUpToken = null)
    }

    /** Called after the member supplies a password or authenticator code. */
    fun confirmStepUp(password: String?, code: String?) {
        viewModelScope.launch {
            _state.value = _state.value.copy(submitting = true)
            when (val ticket = member.stepUp(password, code)) {
                is ApiResult.Ok -> {
                    _state.value = _state.value.copy(block = null)
                    attempt(stepUpToken = ticket.value.token)
                }
                is ApiResult.Err -> {
                    _state.value = _state.value.copy(submitting = false)
                    _messages.send(ticket.error.toMessage())
                }
            }
        }
    }

    fun dismissBlock() {
        _state.value = _state.value.copy(block = null)
    }

    private fun attempt(stepUpToken: String?) {
        val s = _state.value
        /* One key for this payout, reused across every attempt including the
           retry that follows a step-up prompt — otherwise re-authenticating
           would turn one intent into a second, separate withdrawal. */
        val key = idempotencyKey ?: UUID.randomUUID().toString().also { idempotencyKey = it }
        _state.value = s.copy(submitting = true)

        viewModelScope.launch {
            val res = member.requestWithdrawal(
                amount = s.amount,
                walletAddress = s.address.trim(),
                // An empty ticket is what triggers STEP_UP_REQUIRED, which is
                // exactly the answer we want on the first attempt.
                stepUpToken = stepUpToken.orEmpty(),
                idempotencyKey = key,
            )
            when (res) {
                is ApiResult.Ok -> {
                    idempotencyKey = null
                    _state.value = _state.value.copy(
                        submitting = false, amount = "", quote = null, block = null,
                    )
                    _submitted.send(Unit)
                    load()
                }
                is ApiResult.Err -> {
                    val block = blockFor(res.error)
                    _state.value = _state.value.copy(submitting = false, block = block)
                    if (block == null) _messages.send(res.error.toMessage())
                }
            }
        }
    }

    /** Maps the server's named refusals onto something the member can act on. */
    private fun blockFor(err: AppError): WithdrawBlock? {
        val api = err as? AppError.Api ?: return null
        val msg = api.message.orEmpty()
        return when (api.code) {
            // The server says "authenticator" when the amount is over the
            // threshold a password alone no longer covers.
            "STEP_UP_REQUIRED" -> WithdrawBlock.NeedsStepUp(
                requireTotp = msg.contains("authenticator", ignoreCase = true),
                message = msg,
            )
            "KYC_REQUIRED" -> WithdrawBlock.NeedsKyc(pending = false, message = msg)
            "KYC_PENDING" -> WithdrawBlock.NeedsKyc(pending = true, message = msg)
            "PAYOUT_ADDRESS_HOLD" -> WithdrawBlock.AddressHold(message = msg)
            else -> null
        }
    }
}
