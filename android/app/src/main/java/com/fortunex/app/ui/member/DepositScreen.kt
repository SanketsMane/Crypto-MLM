package com.fortunex.app.ui.member

import android.content.Intent
import androidx.core.net.toUri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fortunex.app.R
import com.fortunex.app.data.remote.Deposit
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DepositScreen(vm: DepositViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbars = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        vm.messages.collectLatest { m ->
            val body = m.literal ?: m.text?.let(context::getString).orEmpty()
            snackbars.showSnackbar(body.ifBlank { context.getString(R.string.err_unexpected) })
        }
    }

    /**
     * Checkout opens in the browser, not a WebView.
     *
     * The member is about to authenticate with a payment provider and possibly
     * a wallet app. A WebView hides the address bar and the padlock, which are
     * the only things letting them confirm who they are paying — and it is
     * exactly the pattern a phishing app would use.
     */
    LaunchedEffect(Unit) {
        vm.openCheckout.collectLatest { url ->
            runCatching {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, url.toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }.onFailure { snackbars.showSnackbar(context.getString(R.string.no_browser)) }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = { TopAppBar(title = { Text(stringResource(R.string.nav_deposit)) }) },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                if (!state.gateway.canCharge) {
                    // Told plainly rather than shown a button that always fails.
                    Card(Modifier.fillMaxWidth()) {
                        Text(
                            stringResource(R.string.deposits_unavailable),
                            Modifier.padding(16.dp),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                } else {
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text(stringResource(R.string.deposit_amount), style = MaterialTheme.typography.labelLarge)
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = state.amount,
                                onValueChange = vm::onAmount,
                                singleLine = true,
                                enabled = !state.submitting,
                                prefix = { Text("$") },
                                modifier = Modifier.fillMaxWidth(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            )
                            /* Shown only when the choice is real. One provider,
                               or an operator pin, leaves nothing to decide and
                               a one-button segmented row is just furniture. */
                            if (state.gateway.chooseable && state.gateway.providers.size > 1) {
                                Spacer(Modifier.height(12.dp))
                                Text(
                                    stringResource(R.string.payment_method),
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                Spacer(Modifier.height(6.dp))
                                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                                    state.gateway.providers.forEachIndexed { i, p ->
                                        SegmentedButton(
                                            selected = state.provider == p.id,
                                            onClick = { vm.onProvider(p.id) },
                                            enabled = !state.submitting,
                                            shape = SegmentedButtonDefaults.itemShape(
                                                index = i,
                                                count = state.gateway.providers.size,
                                            ),
                                        ) { Text(p.label) }
                                    }
                                }
                                if (state.needsChoice) {
                                    Spacer(Modifier.height(6.dp))
                                    Text(
                                        stringResource(R.string.choose_payment_method),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            Button(
                                onClick = vm::submit,
                                enabled = state.canSubmit,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                if (state.submitting) {
                                    CircularProgressIndicator(
                                        Modifier.size(18.dp), strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                    )
                                } else {
                                    Text(stringResource(R.string.continue_to_payment))
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                            Text(
                                stringResource(R.string.deposit_help),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            item {
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.deposit_history), style = MaterialTheme.typography.titleSmall)
            }

            if (state.history.isEmpty()) {
                item {
                    Text(
                        stringResource(R.string.no_activity),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                items(state.history, key = { it.id }) { DepositRow(it, context) }
            }
        }
    }
}

@Composable
private fun DepositRow(d: Deposit, context: android.content.Context) {
    ListItem(
        headlineContent = { Text(usd(d.amount)) },
        supportingContent = {
            Text(
                listOfNotNull(d.reference, d.createdAt?.take(10)).joinToString("  ·  "),
                style = MaterialTheme.typography.bodySmall,
            )
        },
        trailingContent = {
            Column(horizontalAlignment = Alignment.End) {
                Text(d.status, style = MaterialTheme.typography.labelMedium)
                // A pending deposit keeps its checkout link, so a member who
                // closed the tab can get back to it instead of starting over
                // and leaving a second unpaid invoice behind.
                if (d.status == "PENDING" && !d.paymentUrl.isNullOrBlank()) {
                    TextButton(onClick = {
                        runCatching {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, d.paymentUrl.toUri())
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                            )
                        }
                    }) { Text(stringResource(R.string.pay_now)) }
                }
            }
        },
    )
}
