package com.fortunex.app.ui.member

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
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
import com.fortunex.app.data.remote.SupportTicket
import com.fortunex.app.data.remote.TicketMessage
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupportScreen(vm: SupportViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbars = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        vm.messages.collectLatest { m ->
            val body = m.literal ?: m.text?.let(context::getString).orEmpty()
            snackbars.showSnackbar(body.ifBlank { context.getString(R.string.err_unexpected) })
        }
    }

    // Back closes the open ticket before it leaves the screen entirely.
    BackHandler(enabled = state.openTicketId != null) { vm.openTicket(null) }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = {
            TopAppBar(
                title = {
                    Text(state.openTicket?.subject ?: stringResource(R.string.support))
                },
                navigationIcon = {
                    if (state.openTicketId != null) {
                        TextButton(onClick = { vm.openTicket(null) }) {
                            Text(stringResource(R.string.back))
                        }
                    }
                },
                actions = {
                    if (state.openTicketId == null) {
                        TextButton(onClick = vm::startCompose) { Text(stringResource(R.string.new_ticket)) }
                    }
                },
            )
        },
    ) { padding ->
        val open = state.openTicket
        when {
            state.loading -> Box(
                Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            open != null -> TicketThread(
                ticket = open,
                reply = state.reply,
                onReply = vm::onReply,
                canSend = state.canReply,
                sending = state.submitting,
                onSend = vm::sendReply,
                modifier = Modifier.fillMaxSize().padding(padding),
            )

            state.tickets.isEmpty() -> Column(
                Modifier.fillMaxSize().padding(padding).padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    stringResource(R.string.no_tickets),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                Button(onClick = vm::startCompose) { Text(stringResource(R.string.new_ticket)) }
            }

            else -> LazyColumn(Modifier.fillMaxSize().padding(padding)) {
                items(state.tickets, key = { it.id }) { t ->
                    ListItem(
                        modifier = Modifier.clickable { vm.openTicket(t.id) },
                        headlineContent = { Text(t.subject, fontWeight = FontWeight.Medium) },
                        supportingContent = {
                            Text(
                                listOfNotNull(
                                    t.messages.lastOrNull()?.body?.take(80),
                                    t.updatedAt?.take(10),
                                ).joinToString("  ·  "),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        },
                        trailingContent = { Text(t.status, style = MaterialTheme.typography.labelMedium) },
                    )
                    HorizontalDivider()
                }
            }
        }
    }

    if (state.composing) {
        AlertDialog(
            onDismissRequest = { if (!state.submitting) vm.cancelCompose() },
            title = { Text(stringResource(R.string.new_ticket)) },
            text = {
                Column {
                    OutlinedTextField(
                        value = state.subject, onValueChange = vm::onSubject,
                        label = { Text(stringResource(R.string.subject)) },
                        singleLine = true, enabled = !state.submitting,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = state.body, onValueChange = vm::onBody,
                        label = { Text(stringResource(R.string.how_can_we_help)) },
                        minLines = 4, enabled = !state.submitting,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = vm::create, enabled = state.canCreate) {
                    if (state.submitting) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    else Text(stringResource(R.string.send))
                }
            },
            dismissButton = {
                TextButton(onClick = vm::cancelCompose, enabled = !state.submitting) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

@Composable
private fun TicketThread(
    ticket: SupportTicket,
    reply: String,
    onReply: (String) -> Unit,
    canSend: Boolean,
    sending: Boolean,
    onSend: () -> Unit,
    modifier: Modifier,
) {
    Column(modifier) {
        LazyColumn(
            Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(ticket.messages, key = { it.id }) { MessageBubble(it) }
        }

        // Only an open ticket can be replied to; a resolved one says so rather
        // than accepting a message nobody will read.
        if (ticket.status == "CLOSED" || ticket.status == "RESOLVED") {
            Text(
                stringResource(R.string.ticket_closed),
                Modifier.fillMaxWidth().padding(16.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Row(
                Modifier.fillMaxWidth().padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = reply, onValueChange = onReply,
                    placeholder = { Text(stringResource(R.string.write_a_reply)) },
                    enabled = !sending,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Button(onClick = onSend, enabled = canSend) {
                    if (sending) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    else Text(stringResource(R.string.send))
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(m: TicketMessage) {
    // Support on the left, the member on the right — the usual reading of a
    // conversation, so who said what needs no label.
    val fromSupport = m.fromAdmin
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (fromSupport) Arrangement.Start else Arrangement.End,
    ) {
        Surface(
            color = if (fromSupport) MaterialTheme.colorScheme.surfaceVariant
                    else MaterialTheme.colorScheme.primaryContainer,
            shape = MaterialTheme.shapes.medium,
            modifier = Modifier.widthIn(max = 300.dp),
        ) {
            Column(Modifier.padding(12.dp)) {
                Text(m.body, style = MaterialTheme.typography.bodyMedium)
                m.createdAt?.take(10)?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
