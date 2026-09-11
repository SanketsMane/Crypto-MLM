package com.fortunex.app.ui.member

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fortunex.app.R
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountScreen(
    onVerifyIdentity: () -> Unit = {},
    vm: AccountViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbars = remember { SnackbarHostState() }
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var confirmSignOut by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        vm.messages.collectLatest { m ->
            val body = m.literal ?: m.text?.let(context::getString).orEmpty()
            snackbars.showSnackbar(body.ifBlank { context.getString(R.string.err_unexpected) })
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = { TopAppBar(title = { Text(stringResource(R.string.nav_account)) }) },
    ) { padding ->
        if (state.loading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            val p = state.profile
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        listOfNotNull(p?.firstName, p?.lastName).joinToString(" ").ifBlank { "—" },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        p?.email.orEmpty(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(
                                stringResource(R.string.your_referral_code),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(p?.userCode.orEmpty(), fontWeight = FontWeight.Medium)
                        }
                        // The code is meant to be shared, so make sharing it one
                        // tap rather than a select-and-hold on a phone keyboard.
                        TextButton(onClick = {
                            clipboard.setText(AnnotatedString(p?.userCode.orEmpty()))
                        }) { Text(stringResource(R.string.copy)) }
                    }
                }
            }

            StatRow(
                stringResource(R.string.total_invested) to usd(p?.totalInvested),
                stringResource(R.string.total_earned) to usd(p?.totalEarned),
            )

            ListItem(
                headlineContent = { Text(stringResource(R.string.verify_identity)) },
                supportingContent = {
                    Text(
                        when (state.kyc.status) {
                            "APPROVED" -> stringResource(R.string.kyc_approved)
                            "PENDING" -> stringResource(R.string.kyc_under_review)
                            "REJECTED" -> stringResource(R.string.kyc_rejected)
                            else -> stringResource(R.string.kyc_not_started)
                        },
                        style = MaterialTheme.typography.bodySmall,
                    )
                },
                trailingContent = {
                    // Nothing useful to offer once it is approved or in review.
                    if (state.kyc.status != "APPROVED" && state.kyc.status != "PENDING") {
                        TextButton(onClick = onVerifyIdentity) { Text(stringResource(R.string.start)) }
                    }
                },
            )

            ListItem(
                headlineContent = { Text(stringResource(R.string.two_factor)) },
                supportingContent = {
                    Text(
                        if (p?.twoFactorEnabled == true) stringResource(R.string.enabled)
                        else stringResource(R.string.manage_on_web),
                        style = MaterialTheme.typography.bodySmall,
                    )
                },
            )

            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = { confirmSignOut = true },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.sign_out)) }
        }
    }

    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text(stringResource(R.string.sign_out)) },
            text = { Text(stringResource(R.string.sign_out_body)) },
            confirmButton = {
                TextButton(onClick = { confirmSignOut = false; vm.signOut() }) {
                    Text(stringResource(R.string.sign_out))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmSignOut = false }) { Text(stringResource(R.string.cancel)) }
            },
        )
    }
}
