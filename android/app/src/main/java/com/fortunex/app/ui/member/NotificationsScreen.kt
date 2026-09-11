package com.fortunex.app.ui.member

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fortunex.app.R
import com.fortunex.app.data.remote.Notification
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(vm: NotificationsViewModel = hiltViewModel()) {
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
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.notifications)) },
                actions = {
                    // Only offered when it would do something.
                    if (state.unread > 0) {
                        TextButton(onClick = vm::markAllRead) {
                            Text(stringResource(R.string.mark_all_read))
                        }
                    }
                },
            )
        },
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

            state.rows.isEmpty() -> Box(
                Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(R.string.no_notifications),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            else -> LazyColumn(Modifier.fillMaxSize().padding(padding)) {
                items(state.rows, key = { it.id }) { n ->
                    NotificationRow(n) { vm.markRead(n.id) }
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(n: Notification, onRead: () -> Unit) {
    val unread = n.readAt == null
    ListItem(
        modifier = Modifier.clickable(onClick = onRead),
        leadingContent = {
            // A dot rather than bold-everything: it survives at any font scale
            // and does not fight the title for attention.
            Box(
                Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(
                        if (unread) MaterialTheme.colorScheme.primary else Color.Transparent,
                    ),
            )
        },
        headlineContent = {
            Text(n.title, fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal)
        },
        supportingContent = {
            Column {
                Text(n.body, style = MaterialTheme.typography.bodySmall)
                n.createdAt?.take(10)?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
    )
}
