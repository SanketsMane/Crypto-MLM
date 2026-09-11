package com.fortunex.app.ui.member

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.member.MemberRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.SupportTicket
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

data class SupportUiState(
    val loading: Boolean = true,
    val tickets: List<SupportTicket> = emptyList(),
    /** Null when the list is showing; set when a ticket is open. */
    val openTicketId: String? = null,
    val composing: Boolean = false,
    val subject: String = "",
    val body: String = "",
    val reply: String = "",
    val submitting: Boolean = false,
    val error: UiMessage? = null,
) {
    val openTicket: SupportTicket? get() = tickets.firstOrNull { it.id == openTicketId }
    val canCreate: Boolean get() = subject.trim().length >= 3 && body.trim().length >= 5 && !submitting
    val canReply: Boolean get() = reply.trim().length >= 2 && !submitting
}

@HiltViewModel
class SupportViewModel @Inject constructor(
    private val member: MemberRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SupportUiState())
    val state: StateFlow<SupportUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(loading = _state.value.tickets.isEmpty())
        viewModelScope.launch {
            when (val res = member.tickets()) {
                is ApiResult.Ok -> _state.value = _state.value.copy(
                    loading = false, tickets = res.value, error = null,
                )
                is ApiResult.Err -> {
                    val had = _state.value.tickets.isNotEmpty()
                    _state.value = _state.value.copy(
                        loading = false,
                        error = if (had) null else res.error.toMessage(),
                    )
                    if (had) _messages.send(res.error.toMessage())
                }
            }
        }
    }

    fun openTicket(id: String?) { _state.value = _state.value.copy(openTicketId = id, reply = "") }
    fun startCompose() { _state.value = _state.value.copy(composing = true, subject = "", body = "") }
    fun cancelCompose() { _state.value = _state.value.copy(composing = false) }

    fun onSubject(v: String) { _state.value = _state.value.copy(subject = v.take(150)) }
    fun onBody(v: String) { _state.value = _state.value.copy(body = v.take(4000)) }
    fun onReply(v: String) { _state.value = _state.value.copy(reply = v.take(4000)) }

    fun create() {
        val s = _state.value
        if (!s.canCreate) return
        _state.value = s.copy(submitting = true)
        viewModelScope.launch {
            when (val res = member.createTicket(s.subject.trim(), s.body.trim(), null)) {
                is ApiResult.Ok -> {
                    _state.value = _state.value.copy(
                        submitting = false, composing = false, subject = "", body = "",
                    )
                    load()
                }
                is ApiResult.Err -> {
                    // The typed text is kept — losing a long message to a failed
                    // send is worse than the failure itself.
                    _state.value = _state.value.copy(submitting = false)
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }

    fun sendReply() {
        val s = _state.value
        val id = s.openTicketId ?: return
        if (!s.canReply) return
        _state.value = s.copy(submitting = true)
        viewModelScope.launch {
            when (val res = member.replyToTicket(id, s.reply.trim())) {
                is ApiResult.Ok -> {
                    _state.value = _state.value.copy(submitting = false, reply = "")
                    load()
                }
                is ApiResult.Err -> {
                    _state.value = _state.value.copy(submitting = false)
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }
}
