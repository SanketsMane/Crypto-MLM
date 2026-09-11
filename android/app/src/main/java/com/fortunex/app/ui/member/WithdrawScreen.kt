package com.fortunex.app.ui.member

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fortunex.app.R
import com.fortunex.app.data.remote.Withdrawal
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WithdrawScreen(
    onVerifyIdentity: () -> Unit = {},
    vm: WithdrawViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbars = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        vm.messages.collectLatest { m ->
            val body = m.literal ?: m.text?.let(context::getString).orEmpty()
            snackbars.showSnackbar(body.ifBlank { context.getString(R.string.err_unexpected) })
        }
    }
    LaunchedEffect(Unit) {
        vm.submitted.collectLatest { snackbars.showSnackbar(context.getString(R.string.withdraw_submitted)) }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = { TopAppBar(title = { Text(stringResource(R.string.nav_withdraw)) }) },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        OutlinedTextField(
                            value = state.amount,
                            onValueChange = vm::onAmount,
                            label = { Text(stringResource(R.string.amount)) },
                            prefix = { Text("$") },
                            singleLine = true,
                            enabled = !state.submitting,
                            modifier = Modifier.fillMaxWidth(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = state.address,
                            onValueChange = vm::onAddress,
                            label = { Text(stringResource(R.string.payout_address)) },
                            placeholder = { Text("0x…") },
                            singleLine = true,
                            enabled = !state.submitting,
                            isError = state.address.isNotBlank() && !state.addressValid,
                            supportingText = {
                                Text(
                                    if (state.address.isNotBlank() && !state.addressValid)
                                        stringResource(R.string.address_invalid)
                                    else stringResource(R.string.address_help),
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            },
                            modifier = Modifier.fillMaxWidth(),
                        )

                        /* The quote comes from the server, so the figure the
                           member agrees to is the figure that settles. */
                        state.quote?.let { q ->
                            Spacer(Modifier.height(12.dp))
                            QuoteLine(stringResource(R.string.you_requested), usd(q.amount))
                            QuoteLine(stringResource(R.string.fee_pct, q.feePercent.toString()), "− " + usd(q.fee))
                            if (q.taxPercent > 0.0) {
                                QuoteLine(stringResource(R.string.tax_pct, q.taxPercent.toString()), "− " + usd(q.tax))
                            }
                            HorizontalDivider(Modifier.padding(vertical = 6.dp))
                            QuoteLine(stringResource(R.string.you_receive), usd(q.net), bold = true)
                        }
                        if (state.quoting) {
                            Spacer(Modifier.height(8.dp))
                            LinearProgressIndicator(Modifier.fillMaxWidth())
                        }

                        Spacer(Modifier.height(14.dp))
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
                                Text(stringResource(R.string.request_withdrawal))
                            }
                        }
                    }
                }
            }

            item {
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.withdraw_history), style = MaterialTheme.typography.titleSmall)
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
                items(state.history, key = { it.id }) { WithdrawalRow(it) }
            }
        }
    }

    when (val block = state.block) {
        is WithdrawBlock.NeedsStepUp -> StepUpDialog(
            requireTotp = block.requireTotp,
            message = block.message,
            submitting = state.submitting,
            onConfirm = { pw, code -> vm.confirmStepUp(pw, code) },
            onDismiss = vm::dismissBlock,
        )

        is WithdrawBlock.NeedsKyc -> AlertDialog(
            onDismissRequest = vm::dismissBlock,
            title = { Text(stringResource(if (block.pending) R.string.kyc_pending_title else R.string.kyc_required_title)) },
            text = { Text(block.message.ifBlank { stringResource(R.string.kyc_required_title) }) },
            confirmButton = {
                // Nothing to do but wait while a submission is under review, so
                // the only button offered is the one that dismisses it.
                if (block.pending) {
                    TextButton(onClick = vm::dismissBlock) { Text(stringResource(R.string.ok)) }
                } else {
                    TextButton(onClick = { vm.dismissBlock(); onVerifyIdentity() }) {
                        Text(stringResource(R.string.verify_identity))
                    }
                }
            },
            dismissButton = if (block.pending) null else {
                { TextButton(onClick = vm::dismissBlock) { Text(stringResource(R.string.cancel)) } }
            },
        )

        is WithdrawBlock.AddressHold -> AlertDialog(
            onDismissRequest = vm::dismissBlock,
            title = { Text(stringResource(R.string.address_hold_title)) },
            text = { Text(block.message) },
            confirmButton = { TextButton(onClick = vm::dismissBlock) { Text(stringResource(R.string.ok)) } },
        )

        null -> Unit
    }
}

@Composable
private fun StepUpDialog(
    requireTotp: Boolean,
    message: String,
    submitting: Boolean,
    onConfirm: (password: String?, code: String?) -> Unit,
    onDismiss: () -> Unit,
) {
    var value by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!submitting) onDismiss() },
        title = { Text(stringResource(R.string.confirm_its_you)) },
        text = {
            Column {
                Text(message.ifBlank { stringResource(R.string.confirm_its_you) })
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    singleLine = true,
                    enabled = !submitting,
                    label = {
                        Text(stringResource(if (requireTotp) R.string.auth_code else R.string.password))
                    },
                    visualTransformation =
                        if (requireTotp) androidx.compose.ui.text.input.VisualTransformation.None
                        else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = if (requireTotp) KeyboardType.NumberPassword else KeyboardType.Password,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = value.isNotBlank() && !submitting,
                // Which field was filled decides which credential is sent; the
                // server refuses a code from an account with no authenticator.
                onClick = { if (requireTotp) onConfirm(null, value) else onConfirm(value, null) },
            ) {
                if (submitting) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                else Text(stringResource(R.string.confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !submitting) { Text(stringResource(R.string.cancel)) }
        },
    )
}

@Composable
private fun QuoteLine(label: String, value: String, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 1.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun WithdrawalRow(w: Withdrawal) {
    ListItem(
        headlineContent = { Text(usd(w.amount)) },
        supportingContent = {
            Text(
                listOfNotNull(
                    w.reference,
                    w.createdAt?.take(10),
                    w.rejectReason,
                ).joinToString("  ·  "),
                style = MaterialTheme.typography.bodySmall,
            )
        },
        trailingContent = {
            Column(horizontalAlignment = Alignment.End) {
                Text(w.status, style = MaterialTheme.typography.labelMedium)
                Text(
                    stringResource(R.string.net_is, usd(w.netAmount)),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
    )
}
