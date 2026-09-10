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

data class TwoFactorUiState(
    val code: String = "",
    val submitting: Boolean = false,
) {
    /** Six digits, or a recovery code. Both are accepted by the same endpoint. */
    val canSubmit: Boolean get() = code.trim().length >= 6 && !submitting
}

@HiltViewModel
class TwoFactorViewModel @Inject constructor(
    private val repo: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(TwoFactorUiState())
    val state: StateFlow<TwoFactorUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    private val _signedIn = Channel<Unit>(Channel.BUFFERED)
    val signedIn = _signedIn.receiveAsFlow()

    fun onCode(v: String) {
        // Digits only, capped at the length of a recovery code. Stops a paste
        // of "123 456" failing for a reason the member cannot see.
        val cleaned = v.filter { it.isDigit() || it.isLetter() }.take(12)
        _state.value = _state.value.copy(code = cleaned)
    }

    fun submit(challengeToken: String) {
        val s = _state.value
        if (!s.canSubmit) return
        _state.value = s.copy(submitting = true)

        viewModelScope.launch {
            when (val res = repo.completeTwoFactor(challengeToken, s.code)) {
                is ApiResult.Ok -> {
                    _state.value = _state.value.copy(submitting = false, code = "")
                    _signedIn.send(Unit)
                }
                is ApiResult.Err -> {
                    // Cleared on a wrong code so the next attempt starts fresh —
                    // a six-digit field with a stale wrong code in it invites
                    // the member to press Verify again on the same value.
                    _state.value = _state.value.copy(submitting = false, code = "")
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }
}
