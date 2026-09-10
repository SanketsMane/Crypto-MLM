package com.fortunex.app.ui.member

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.auth.AuthRepository
import com.fortunex.app.data.member.MemberRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.AppError
import com.fortunex.app.data.remote.Dashboard
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

data class HomeUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val data: Dashboard? = null,
    /** Set only when there is nothing to show; a refresh failure keeps the old data. */
    val error: UiMessage? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val member: MemberRepository,
    private val auth: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun load(isRefresh: Boolean = false) {
        _state.value = _state.value.copy(
            loading = !isRefresh && _state.value.data == null,
            refreshing = isRefresh,
        )
        viewModelScope.launch {
            when (val res = member.dashboard()) {
                is ApiResult.Ok ->
                    _state.value = HomeUiState(loading = false, refreshing = false, data = res.value)

                is ApiResult.Err -> {
                    /**
                     * A failed refresh must not blank the screen.
                     *
                     * Replacing good figures with an error because the train went
                     * into a tunnel is worse than showing them a minute stale —
                     * so the error only takes over when there is nothing behind
                     * it, and otherwise arrives as a message over the top.
                     */
                    val hasData = _state.value.data != null
                    _state.value = _state.value.copy(
                        loading = false,
                        refreshing = false,
                        error = if (hasData) null else res.error.toMessage(),
                    )
                    if (hasData) _messages.send(res.error.toMessage())

                    // The Authenticator already tried to renew and gave up, so a
                    // 401 here means the session is genuinely finished. Clearing
                    // it is what flips the top-level gate back to sign-in.
                    if (res.error is AppError.Unauthorized) auth.signOut()
                }
            }
        }
    }

    fun signOut() {
        viewModelScope.launch { auth.signOut() }
    }
}
