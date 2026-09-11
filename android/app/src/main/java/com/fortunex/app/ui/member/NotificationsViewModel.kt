package com.fortunex.app.ui.member

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.member.MemberRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.Notification
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

data class NotificationsUiState(
    val loading: Boolean = true,
    val rows: List<Notification> = emptyList(),
    val error: UiMessage? = null,
) {
    val unread: Int get() = rows.count { it.readAt == null }
}

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val member: MemberRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(loading = _state.value.rows.isEmpty())
        viewModelScope.launch {
            when (val res = member.notifications()) {
                is ApiResult.Ok -> _state.value = NotificationsUiState(loading = false, rows = res.value.rows)
                is ApiResult.Err -> {
                    val had = _state.value.rows.isNotEmpty()
                    _state.value = _state.value.copy(
                        loading = false,
                        error = if (had) null else res.error.toMessage(),
                    )
                    if (had) _messages.send(res.error.toMessage())
                }
            }
        }
    }

    /**
     * Marked read locally first, then on the server.
     *
     * Tapping an unread item and watching it stay bold for a round trip reads
     * as a broken tap. If the call fails the row is put back, so the list never
     * claims something was read that the server still thinks is unread.
     */
    fun markRead(id: String) {
        val before = _state.value.rows
        if (before.firstOrNull { it.id == id }?.readAt != null) return

        _state.value = _state.value.copy(
            rows = before.map { if (it.id == id) it.copy(readAt = "now") else it },
        )
        viewModelScope.launch {
            if (member.markRead(listOf(id)) is ApiResult.Err) {
                _state.value = _state.value.copy(rows = before)
            }
        }
    }

    fun markAllRead() {
        val before = _state.value.rows
        _state.value = _state.value.copy(
            rows = before.map { if (it.readAt == null) it.copy(readAt = "now") else it },
        )
        viewModelScope.launch {
            if (member.markAllRead() is ApiResult.Err) {
                _state.value = _state.value.copy(rows = before)
            } else {
                load()
            }
        }
    }
}
