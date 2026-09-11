package com.fortunex.app.ui.member

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.member.MemberRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.RankProgress
import com.fortunex.app.data.remote.TeamSummary
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

data class NetworkUiState(
    val loading: Boolean = true,
    val team: TeamSummary = TeamSummary(),
    val ranks: List<RankProgress> = emptyList(),
    val error: UiMessage? = null,
) {
    /** The rung being worked towards: the first not yet achieved. */
    val nextRank: RankProgress? get() = ranks.firstOrNull { !it.achieved }

    val currentRank: RankProgress? get() = ranks.lastOrNull { it.achieved }
}

@HiltViewModel
class NetworkViewModel @Inject constructor(
    private val member: MemberRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(NetworkUiState())
    val state: StateFlow<NetworkUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(loading = _state.value.ranks.isEmpty())
        viewModelScope.launch {
            val team = member.team()
            val ranks = member.rank()

            if (team is ApiResult.Ok && ranks is ApiResult.Ok) {
                _state.value = NetworkUiState(loading = false, team = team.value, ranks = ranks.value)
                return@launch
            }
            val err = (team as? ApiResult.Err)?.error ?: (ranks as ApiResult.Err).error
            val hadData = _state.value.ranks.isNotEmpty()
            _state.value = _state.value.copy(
                loading = false,
                error = if (hadData) null else err.toMessage(),
            )
            if (hadData) _messages.send(err.toMessage())
        }
    }
}
