package com.fortunex.app.ui.auth

import androidx.lifecycle.SavedStateHandle
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

/** One state object, not a pile of booleans — the screen renders exactly this. */
data class LoginUiState(
    val identifier: String = "",
    val password: String = "",
    val submitting: Boolean = false,
    val identifierError: Int? = null,
    val passwordError: Int? = null,
) {
    val canSubmit: Boolean
        get() = identifier.isNotBlank() && password.isNotBlank() && !submitting
}

sealed interface LoginEvent {
    data object SignedIn : LoginEvent
    data class NeedsTwoFactor(val challengeToken: String) : LoginEvent
}

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val repo: AuthRepository,
    private val saved: SavedStateHandle,
) : ViewModel() {

    /**
     * The identifier survives process death; the password deliberately does not.
     * Android can kill this app while the member is in their password manager,
     * and restoring a typed password from disk is not a trade worth making.
     */
    private val _state = MutableStateFlow(
        LoginUiState(identifier = saved.get<String>(KEY_ID).orEmpty()),
    )
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    /** One-shot, so a snackbar is not re-shown after a rotation. */
    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    private val _events = Channel<LoginEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun onIdentifier(v: String) {
        saved[KEY_ID] = v
        _state.value = _state.value.copy(identifier = v, identifierError = null)
    }

    fun onPassword(v: String) {
        _state.value = _state.value.copy(password = v, passwordError = null)
    }

    fun submit() {
        val s = _state.value
        if (!s.canSubmit) return
        _state.value = s.copy(submitting = true)

        viewModelScope.launch {
            when (val res = repo.login(s.identifier, s.password)) {
                is ApiResult.Ok -> {
                    _state.value = _state.value.copy(submitting = false, password = "")
                    val body = res.value
                    if (body.twoFactorRequired && body.challengeToken != null) {
                        _events.send(LoginEvent.NeedsTwoFactor(body.challengeToken))
                    } else {
                        _events.send(LoginEvent.SignedIn)
                    }
                }
                is ApiResult.Err -> {
                    // The password is cleared on a refused credential so a
                    // shoulder-surfer cannot read a wrong guess off the screen,
                    // but kept when the network failed — retyping it after a
                    // tunnel is pure annoyance.
                    val credentialRefused = res.error is com.fortunex.app.data.remote.AppError.Unauthorized
                    _state.value = _state.value.copy(
                        submitting = false,
                        password = if (credentialRefused) "" else _state.value.password,
                    )
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }

    private companion object { const val KEY_ID = "identifier" }
}
