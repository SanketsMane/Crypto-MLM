package com.fortunex.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.auth.AuthRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.ui.common.UiMessage
import com.fortunex.app.ui.common.toMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Ask for a code, then use it. Two steps, one screen. */
enum class ResetStep { REQUEST, CONFIRM }

data class ResetUiState(
    val step: ResetStep = ResetStep.REQUEST,
    val email: String = "",
    val challengeId: String? = null,
    val code: String = "",
    val newPassword: String = "",
    val submitting: Boolean = false,
) {
    val emailValid: Boolean get() = email.contains("@") && email.contains(".")
    val canRequest: Boolean get() = emailValid && !submitting
    val canConfirm: Boolean
        get() = code.trim().length >= 6 && newPassword.length >= 8 && !submitting
}

@HiltViewModel
class ResetPasswordViewModel @Inject constructor(
    private val repo: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ResetUiState())
    val state: StateFlow<ResetUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    private val _done = Channel<Unit>(Channel.BUFFERED)
    val done = _done.receiveAsFlow()

    fun onEmail(v: String) { _state.value = _state.value.copy(email = v.trim().take(160)) }
    fun onCode(v: String) { _state.value = _state.value.copy(code = v.filter { it.isDigit() }.take(6)) }
    fun onNewPassword(v: String) { _state.value = _state.value.copy(newPassword = v) }

    fun requestCode() {
        val s = _state.value
        if (!s.canRequest) return
        _state.value = s.copy(submitting = true)

        viewModelScope.launch {
            when (val res = repo.forgotPassword(s.email)) {
                is ApiResult.Ok -> {
                    /* Always advance, whatever comes back. The server refuses to
                       reveal whether an address is registered — telling the
                       caller "no such account" would turn this into a way to
                       enumerate members — so an unknown address and a real one
                       look identical here, by design. */
                    _state.value = _state.value.copy(
                        submitting = false,
                        step = ResetStep.CONFIRM,
                        challengeId = res.value.challengeId,
                    )
                }
                is ApiResult.Err -> {
                    _state.value = _state.value.copy(submitting = false)
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }

    fun confirm() {
        val s = _state.value
        if (!s.canConfirm) return
        val challenge = s.challengeId
        if (challenge == null) {
            // No challenge id means the request step never really succeeded;
            // sending a code without one would fail with a confusing message.
            viewModelScope.launch {
                _messages.send(UiMessage(literal = "Start again — that request has expired."))
                _state.value = _state.value.copy(step = ResetStep.REQUEST)
            }
            return
        }
        _state.value = s.copy(submitting = true)

        viewModelScope.launch {
            when (val res = repo.resetPassword(challenge, s.code, s.newPassword)) {
                is ApiResult.Ok -> {
                    _state.value = ResetUiState()
                    _done.send(Unit)
                }
                is ApiResult.Err -> {
                    _state.value = _state.value.copy(submitting = false, code = "")
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }
}
