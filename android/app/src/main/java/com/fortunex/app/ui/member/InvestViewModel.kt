package com.fortunex.app.ui.member

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.member.MemberRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.Investment
import com.fortunex.app.data.remote.PackagePlan
import com.fortunex.app.ui.common.UiMessage
import com.fortunex.app.ui.common.toMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class InvestUiState(
    val loading: Boolean = true,
    val plans: List<PackagePlan> = emptyList(),
    val holdings: List<Investment> = emptyList(),
    /** The plan awaiting confirmation. Null when no sheet is open. */
    val confirming: PackagePlan? = null,
    val submitting: Boolean = false,
    val error: UiMessage? = null,
)

@HiltViewModel
class InvestViewModel @Inject constructor(
    private val member: MemberRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(InvestUiState())
    val state: StateFlow<InvestUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    private val _purchased = Channel<Unit>(Channel.BUFFERED)
    val purchased = _purchased.receiveAsFlow()

    /**
     * One key per submission, minted when the sheet opens rather than when the
     * request is sent.
     *
     * Generating it at send time would give every retry a fresh key, which the
     * server reads as a separate intent — so a member who taps Confirm, loses
     * signal, and taps again buys the plan twice. Held here so every attempt at
     * THIS purchase carries the same key, and cleared once it settles.
     */
    private var idempotencyKey: String? = null

    init { load() }

    fun load() {
        _state.value = _state.value.copy(loading = _state.value.plans.isEmpty())
        viewModelScope.launch {
            val plans = member.packages()
            val mine = member.investments()

            if (plans is ApiResult.Ok && mine is ApiResult.Ok) {
                _state.value = InvestUiState(
                    loading = false,
                    plans = plans.value.filter { it.isActive },
                    holdings = mine.value,
                )
                return@launch
            }
            val err = (plans as? ApiResult.Err)?.error ?: (mine as ApiResult.Err).error
            val hadData = _state.value.plans.isNotEmpty()
            _state.value = _state.value.copy(
                loading = false,
                error = if (hadData) null else err.toMessage(),
            )
            if (hadData) _messages.send(err.toMessage())
        }
    }

    fun askToConfirm(plan: PackagePlan) {
        idempotencyKey = UUID.randomUUID().toString()
        _state.value = _state.value.copy(confirming = plan)
    }

    fun dismissConfirm() {
        idempotencyKey = null
        _state.value = _state.value.copy(confirming = null)
    }

    fun confirmPurchase() {
        val plan = _state.value.confirming ?: return
        val key = idempotencyKey ?: return
        if (_state.value.submitting) return
        _state.value = _state.value.copy(submitting = true)

        viewModelScope.launch {
            when (val res = member.purchase(plan.id, key)) {
                is ApiResult.Ok -> {
                    idempotencyKey = null
                    _state.value = _state.value.copy(submitting = false, confirming = null)
                    _purchased.send(Unit)
                    load()
                }
                is ApiResult.Err -> {
                    /* The key is deliberately KEPT. The server refused, or the
                       answer never arrived — and if it was the latter the
                       purchase may well have succeeded. Reusing the same key on
                       the next attempt is what makes that safe to find out. */
                    _state.value = _state.value.copy(submitting = false)
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }
}
