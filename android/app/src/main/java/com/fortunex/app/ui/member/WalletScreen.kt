package com.fortunex.app.ui.member

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fortunex.app.R
import com.fortunex.app.data.remote.LedgerEntry
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletScreen(vm: WalletViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbars = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        vm.messages.collectLatest { m ->
            val body = m.literal ?: m.text?.let(context::getString).orEmpty()
            snackbars.showSnackbar(body.ifBlank { context.getString(R.string.err_unexpected) })
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = { TopAppBar(title = { Text(stringResource(R.string.nav_wallet)) }) },
    ) { padding ->
        when {
            state.loading -> Box(
                Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            state.error != null -> Column(
                Modifier.fillMaxSize().padding(padding).padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    state.error?.literal
                        ?: state.error?.text?.let { stringResource(it) }
                        ?: stringResource(R.string.err_unexpected),
                )
                Spacer(Modifier.height(12.dp))
                Button(onClick = vm::load) { Text(stringResource(R.string.retry)) }
            }

            else -> LazyColumn(
                Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(state.wallets, key = { it.type }) { w ->
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text(walletLabel(w.type), style = MaterialTheme.typography.labelLarge)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                usd(w.available),
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }

                item {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        stringResource(R.string.recent_activity),
                        style = MaterialTheme.typography.titleSmall,
                    )
                }

                if (state.entries.isEmpty()) {
                    item {
                        Text(
                            stringResource(R.string.no_activity),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    items(state.entries, key = { it.id }) { EntryRow(it) }
                }

                if (state.canLoadMore) {
                    item {
                        // Explicit rather than infinite-scroll: a passbook is
                        // something people scan deliberately, and a list that
                        // grows under the thumb makes losing your place easy.
                        OutlinedButton(
                            onClick = vm::loadMore,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !state.loadingMore,
                        ) { Text("Load more (${state.entries.size} of ${state.total})") }
                    }
                }
            }
        }
    }
}

@Composable
private fun EntryRow(e: LedgerEntry) {
    val credit = e.direction.equals("CREDIT", ignoreCase = true)
    ListItem(
        headlineContent = {
            Text(e.category.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() })
        },
        supportingContent = {
            val detail = e.description ?: e.createdAt?.take(10)
            if (detail != null) Text(detail, style = MaterialTheme.typography.bodySmall)
        },
        trailingContent = {
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    (if (credit) "+" else "−") + usd(e.amount),
                    fontWeight = FontWeight.SemiBold,
                    color = if (credit) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.error,
                )
                Text(
                    usd(e.balanceAfter),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
    )
}
