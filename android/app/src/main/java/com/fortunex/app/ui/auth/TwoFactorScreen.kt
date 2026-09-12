package com.fortunex.app.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fortunex.app.R
import kotlinx.coroutines.flow.collectLatest

/**
 * The second factor.
 *
 * The challenge token arrives as a navigation argument rather than being held
 * in the ViewModel: it is worthless after five minutes and authorises exactly
 * one exchange, so there is nothing here worth persisting across process death.
 */
@Composable
fun TwoFactorScreen(
    challengeToken: String,
    onSignedIn: () -> Unit = {},
    vm: TwoFactorViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbars = remember { SnackbarHostState() }
    val keyboard = LocalSoftwareKeyboardController.current
    val focus = remember { FocusRequester() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        vm.messages.collectLatest { m ->
            val body = m.literal ?: m.text?.let(context::getString).orEmpty()
            snackbars.showSnackbar(
                listOfNotNull(
                    body.ifBlank { null },
                    m.reference?.let { context.getString(R.string.reference_is, it) },
                ).joinToString("  ·  ").ifBlank { context.getString(R.string.err_unexpected) },
            )
        }
    }

    LaunchedEffect(Unit) { vm.signedIn.collectLatest { onSignedIn() } }

    // The code field is the only thing on screen, so it takes focus at once
    // rather than making the member tap it.
    LaunchedEffect(Unit) { focus.requestFocus() }

    Scaffold(snackbarHost = { SnackbarHost(snackbars) }) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.two_factor_title),
                style = MaterialTheme.typography.headlineSmall,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.two_factor_body),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = state.code,
                onValueChange = vm::onCode,
                singleLine = true,
                enabled = !state.submitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.NumberPassword,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(
                    onDone = {
                        keyboard?.hide()
                        vm.submit(challengeToken)
                    },
                ),
            )

            Spacer(Modifier.height(20.dp))
            Button(
                onClick = { keyboard?.hide(); vm.submit(challengeToken) },
                enabled = state.canSubmit,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.submitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text(stringResource(R.string.verify))
                }
            }
        }
    }
}
