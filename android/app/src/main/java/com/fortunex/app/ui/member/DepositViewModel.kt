package com.fortunex.app.ui.member

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.member.MemberRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.Deposit
import com.fortunex.app.data.remote.GatewayStatus
import com.fortunex.app.ui.common.UiMessage
import com.fortunex.app.ui.common.toMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.util.UUID
import javax.inject.Inject

data class DepositUiState(
    val loading: Boolean = true,
    val gateway: GatewayStatus = GatewayStatus(),
    val history: List<Deposit> = emptyList(),
    val amount: String = "",
    val submitting: Boolean = false,
    val error: UiMessage? = null,
) {
    val amountValid: Boolean
        get() = runCatching { BigDecimal(amount).signum() == 1 }.getOrDefault(false)

    val canSubmit: Boolean get() = amountValid && gateway.canCharge && !submitting
}

@HiltViewModel
class DepositViewModel @Inject constructor(
    private val member: MemberRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(DepositUiState())
    val state: StateFlow<DepositUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    /** Emits the checkout URL for the screen to open in a browser. */
    private val _openCheckout = Channel<String>(Channel.BUFFERED)
    val openCheckout = _openCheckout.receiveAsFlow()

    // One key per submission — see the note in InvestViewModel.
    private var idempotencyKey: String? = null

    init { load() }

    fun load() {
        viewModelScope.launch {
            val status = member.gatewayStatus()
            val history = member.deposits()
            _state.value = _state.value.copy(
                loading = false,
                gateway = (status as? ApiResult.Ok)?.value ?: GatewayStatus(),
                history = (history as? ApiResult.Ok)?.value ?: _state.value.history,
                error = if (status is ApiResult.Err && _state.value.history.isEmpty())
                    status.error.toMessage() else null,
            )
        }
    }

    fun onAmount(v: String) {
        // Digits and a single separator only. A stray letter would otherwise
        // fail server-side validation with a message about a regex.
        val cleaned = v.filter { it.isDigit() || it == '.' }.let { s ->
            val i = s.indexOf('.')
            if (i < 0) s else s.substring(0, i + 1) + s.substring(i + 1).replace(".", "")
        }
        _state.value = _state.value.copy(amount = cleaned.take(12))
    }

    fun submit() {
        val s = _state.value
        if (!s.canSubmit) return
        val key = idempotencyKey ?: UUID.randomUUID().toString().also { idempotencyKey = it }
        _state.value = s.copy(submitting = true)

        viewModelScope.launch {
            when (val res = member.startDeposit(s.amount, key)) {
                is ApiResult.Ok -> {
                    idempotencyKey = null
                    _state.value = _state.value.copy(submitting = false, amount = "")
                    val url = res.value.paymentUrl
                    if (url.isNullOrBlank()) {
                        /* An invoice with no URL is nothing the member can pay.
                           Saying so beats opening a blank browser tab. */
                        _messages.send(UiMessage(literal = "The checkout link did not come back. Try again."))
                    } else {
                        _openCheckout.send(url)
                    }
                    load()
                }
                is ApiResult.Err -> {
                    // Key kept: the request may have succeeded without us hearing.
                    _state.value = _state.value.copy(submitting = false)
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }
}
