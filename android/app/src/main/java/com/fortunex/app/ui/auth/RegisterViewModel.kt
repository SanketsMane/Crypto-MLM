package com.fortunex.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.auth.AuthRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.RegisterRequest
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
import javax.inject.Inject

/** What we know about a typed sponsor code. */
sealed interface SponsorState {
    data object Empty : SponsorState
    data object Checking : SponsorState
    data class Found(val name: String) : SponsorState
    data object NotFound : SponsorState
}

data class RegisterUiState(
    val firstName: String = "",
    val lastName: String = "",
    val email: String = "",
    val phone: String = "",
    val password: String = "",
    val sponsorCode: String = "",
    val sponsor: SponsorState = SponsorState.Empty,
    val submitting: Boolean = false,
) {
    val emailValid: Boolean get() = email.contains("@") && email.contains(".")
    val passwordValid: Boolean get() = password.length >= 8

    /**
     * A sponsor code that was typed but does not resolve blocks submission.
     *
     * Leaving it blank is fine — that places the member at the root. Getting it
     * WRONG is not, because placement is permanent and every commission
     * afterwards depends on where they sit.
     */
    val canSubmit: Boolean
        get() = firstName.trim().length >= 2 &&
            emailValid &&
            passwordValid &&
            sponsor !is SponsorState.NotFound &&
            sponsor !is SponsorState.Checking &&
            !submitting
}

@HiltViewModel
class RegisterViewModel @Inject constructor(
    private val repo: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(RegisterUiState())
    val state: StateFlow<RegisterUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    private val _registered = Channel<Unit>(Channel.BUFFERED)
    val registered = _registered.receiveAsFlow()

    private var sponsorJob: Job? = null

    fun onFirstName(v: String) { _state.value = _state.value.copy(firstName = v.take(70)) }
    fun onLastName(v: String) { _state.value = _state.value.copy(lastName = v.take(70)) }
    fun onEmail(v: String) { _state.value = _state.value.copy(email = v.trim().take(160)) }
    fun onPhone(v: String) { _state.value = _state.value.copy(phone = v.take(20)) }
    fun onPassword(v: String) { _state.value = _state.value.copy(password = v) }

    fun onSponsorCode(v: String) {
        val code = v.trim().uppercase().take(20)
        _state.value = _state.value.copy(
            sponsorCode = code,
            sponsor = if (code.isBlank()) SponsorState.Empty else SponsorState.Checking,
        )
        sponsorJob?.cancel()
        if (code.length < 3) {
            _state.value = _state.value.copy(sponsor = if (code.isBlank()) SponsorState.Empty else SponsorState.Checking)
            return
        }
        // Debounced: one lookup for the code they settle on, not one per letter.
        sponsorJob = viewModelScope.launch {
            delay(450)
            when (val res = repo.lookupSponsor(code)) {
                is ApiResult.Ok -> _state.value = _state.value.copy(sponsor = SponsorState.Found(res.value.name))
                is ApiResult.Err -> _state.value = _state.value.copy(sponsor = SponsorState.NotFound)
            }
        }
    }

    fun submit() {
        val s = _state.value
        if (!s.canSubmit) return
        _state.value = s.copy(submitting = true)

        viewModelScope.launch {
            val body = RegisterRequest(
                firstName = s.firstName.trim(),
                lastName = s.lastName.trim().ifBlank { null },
                email = s.email.trim(),
                phone = s.phone.trim().ifBlank { null },
                password = s.password,
                sponsorCode = s.sponsorCode.trim().ifBlank { null },
            )
            when (val res = repo.register(body)) {
                is ApiResult.Ok -> {
                    // The password is dropped the moment it is no longer needed.
                    _state.value = _state.value.copy(submitting = false, password = "")
                    _registered.send(Unit)
                }
                is ApiResult.Err -> {
                    _state.value = _state.value.copy(submitting = false)
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }
}
