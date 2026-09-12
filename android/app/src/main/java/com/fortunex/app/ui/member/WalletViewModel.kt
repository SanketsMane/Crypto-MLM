package com.fortunex.app.ui.member

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.member.MemberRepository
import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.Capping
import com.fortunex.app.data.remote.LedgerEntry
import com.fortunex.app.data.remote.WalletBalance
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

private const val PAGE = 30

data class WalletUiState(
    val loading: Boolean = true,
    val wallets: List<WalletBalance> = emptyList(),
    val capping: Capping = Capping(),
    val entries: List<LedgerEntry> = emptyList(),
    val total: Int = 0,
    val loadingMore: Boolean = false,
    val error: UiMessage? = null,
) {
    val canLoadMore: Boolean get() = entries.size < total && !loadingMore
}

@HiltViewModel
class WalletViewModel @Inject constructor(
    private val member: MemberRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(WalletUiState())
    val state: StateFlow<WalletUiState> = _state.asStateFlow()

    private val _messages = Channel<UiMessage>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(loading = _state.value.entries.isEmpty())
        viewModelScope.launch {
            // Balances and the first page together — two round trips shown as
            // one screen, so a half-rendered wallet never appears.
            val balances = member.wallets()
            val page = member.ledger(take = PAGE, skip = 0)

            if (balances is ApiResult.Ok && page is ApiResult.Ok) {
                _state.value = WalletUiState(
                    loading = false,
                    wallets = balances.value.wallets,
                    capping = balances.value.capping,
                    entries = page.value.entries,
                    total = page.value.total,
                )
                return@launch
            }

            val err = (balances as? ApiResult.Err)?.error ?: (page as ApiResult.Err).error
            val hadData = _state.value.entries.isNotEmpty()
            _state.value = _state.value.copy(
                loading = false,
                error = if (hadData) null else err.toMessage(),
            )
            if (hadData) _messages.send(err.toMessage())
        }
    }

    /**
     * Appends the next page.
     *
     * Skips by what is already held rather than by a page counter: if a new
     * entry lands between two requests a counter would silently skip a row,
     * and a member checking a missing payment is exactly who would notice.
     */
    fun loadMore() {
        val s = _state.value
        if (!s.canLoadMore) return
        _state.value = s.copy(loadingMore = true)
        viewModelScope.launch {
            when (val res = member.ledger(take = PAGE, skip = s.entries.size)) {
                is ApiResult.Ok -> _state.value = _state.value.copy(
                    loadingMore = false,
                    entries = _state.value.entries + res.value.entries,
                    total = res.value.total,
                )
                is ApiResult.Err -> {
                    _state.value = _state.value.copy(loadingMore = false)
                    _messages.send(res.error.toMessage())
                }
            }
        }
    }
}
