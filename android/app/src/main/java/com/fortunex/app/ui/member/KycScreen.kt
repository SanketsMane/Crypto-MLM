package com.fortunex.app.ui.member

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.capitalize
import androidx.compose.ui.text.intl.Locale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fortunex.app.R
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KycScreen(
    onDone: () -> Unit = {},
    vm: KycViewModel = hiltViewModel(),
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
        vm.submitted.collectLatest {
            snackbars.showSnackbar(context.getString(R.string.kyc_submitted))
            onDone()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = { TopAppBar(title = { Text(stringResource(R.string.verify_identity)) }) },
    ) { padding ->
        if (state.loading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            StatusBanner(state.server.status, state.server.submission?.rejectionReason)

            if (state.readOnly) return@Column

            OutlinedTextField(
                value = state.fullName, onValueChange = vm::onFullName,
                label = { Text(stringResource(R.string.full_name)) },
                singleLine = true, enabled = !state.submitting,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.documentNo, onValueChange = vm::onDocumentNo,
                label = { Text(stringResource(R.string.document_number)) },
                singleLine = true, enabled = !state.submitting,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.countryCode, onValueChange = vm::onCountry,
                label = { Text(stringResource(R.string.country_code)) },
                placeholder = { Text("IN") },
                singleLine = true, enabled = !state.submitting,
                supportingText = { Text(stringResource(R.string.country_help)) },
                modifier = Modifier.fillMaxWidth(),
            )

            Text(stringResource(R.string.documents), style = MaterialTheme.typography.titleSmall)
            KYC_DOC_TYPES.forEach { type ->
                DocRow(
                    type = type,
                    picked = state.docs.firstOrNull { it.type == type },
                    enabled = !state.submitting,
                    onPick = { uri -> vm.addDoc(type, uri) },
                    onRemove = { vm.removeDoc(type) },
                )
            }

            Text(
                stringResource(R.string.kyc_privacy),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

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
                    Text(stringResource(R.string.submit_for_review))
                }
            }
        }
    }
}

@Composable
private fun StatusBanner(status: String, rejectionReason: String?) {
    val (text, tone) = when (status) {
        "APPROVED" -> stringResource(R.string.kyc_approved) to MaterialTheme.colorScheme.primaryContainer
        "PENDING" -> stringResource(R.string.kyc_under_review) to MaterialTheme.colorScheme.secondaryContainer
        "REJECTED" -> (rejectionReason?.let { stringResource(R.string.kyc_rejected_because, it) }
            ?: stringResource(R.string.kyc_rejected)) to MaterialTheme.colorScheme.errorContainer
        else -> stringResource(R.string.kyc_intro) to MaterialTheme.colorScheme.surfaceVariant
    }
    Card(colors = CardDefaults.cardColors(containerColor = tone), modifier = Modifier.fillMaxWidth()) {
        Text(text, Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun DocRow(
    type: String,
    picked: PickedDoc?,
    enabled: Boolean,
    onPick: (android.net.Uri) -> Unit,
    onRemove: () -> Unit,
) {
    /* GetContent rather than the camera: it covers both the gallery and, on
       every current Android build, the camera through the system picker —
       without this app holding the CAMERA permission it would otherwise have
       to justify on the store listing. */
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri -> uri?.let(onPick) }

    OutlinedCard(Modifier.fillMaxWidth()) {
        Row(
            Modifier.padding(14.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    type.replace('_', ' ').lowercase().capitalize(Locale.current),
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (picked != null) {
                    Text(
                        stringResource(R.string.attached_kb, (picked.sizeBytes / 1024).toString()),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (picked == null) {
                TextButton(onClick = { launcher.launch("*/*") }, enabled = enabled) {
                    Text(stringResource(R.string.choose))
                }
            } else {
                TextButton(onClick = onRemove, enabled = enabled) {
                    Text(stringResource(R.string.remove))
                }
            }
        }
    }
}
