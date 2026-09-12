package com.fortunex.app.ui.member

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.auth.AuthRepository
import com.fortunex.app.data.member.MemberRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.KycState
import com.fortunex.app.data.remote.MemberProfile
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

data class AccountUiState(
    val loading: Boolean = true,
    val profile: MemberProfile? = null,
    val kyc: KycState = KycState(),
    val error: UiMessage? = null,
)

@HiltViewModel
class AccountViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val member: MemberRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AccountUiState())
    val state: StateFlow<AccountUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            val me = auth.me()
            val kyc = member.kyc()
            _state.value = AccountUiState(
                loading = false,
                profile = (me as? ApiResult.Ok)?.value,
                kyc = (kyc as? ApiResult.Ok)?.value ?: KycState(),
                error = (me as? ApiResult.Err)?.error?.toMessage(),
            )
        }
    }

    /**
     * Ends the session on the server as well as the device.
     *
     * The top-level gate observes the token store, so clearing it is what
     * returns the app to sign-in — there is no navigation to perform here.
     */
    fun signOut() {
        viewModelScope.launch { auth.signOut() }
    }
}
