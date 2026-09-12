package com.fortunex.app.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fortunex.app.R
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegisterScreen(
    onRegistered: () -> Unit = {},
    onBackToSignIn: () -> Unit = {},
    vm: RegisterViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbars = remember { SnackbarHostState() }
    val context = LocalContext.current
    var reveal by rememberSaveable { mutableStateOf(false) }

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
    LaunchedEffect(Unit) { vm.registered.collectLatest { onRegistered() } }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = { TopAppBar(title = { Text(stringResource(R.string.create_account)) }) },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedTextField(
                value = state.firstName, onValueChange = vm::onFirstName,
                label = { Text(stringResource(R.string.first_name)) },
                singleLine = true, enabled = !state.submitting, modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.lastName, onValueChange = vm::onLastName,
                label = { Text(stringResource(R.string.last_name_optional)) },
                singleLine = true, enabled = !state.submitting, modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.email, onValueChange = vm::onEmail,
                label = { Text(stringResource(R.string.email)) },
                singleLine = true, enabled = !state.submitting,
                isError = state.email.isNotBlank() && !state.emailValid,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.phone, onValueChange = vm::onPhone,
                label = { Text(stringResource(R.string.phone_optional)) },
                singleLine = true, enabled = !state.submitting,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.password, onValueChange = vm::onPassword,
                label = { Text(stringResource(R.string.password)) },
                singleLine = true, enabled = !state.submitting,
                isError = state.password.isNotBlank() && !state.passwordValid,
                supportingText = { Text(stringResource(R.string.password_rule)) },
                visualTransformation =
                    if (reveal) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    TextButton(onClick = { reveal = !reveal }) {
                        Text(stringResource(if (reveal) R.string.hide_password else R.string.show_password))
                    }
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password, imeAction = ImeAction.Next,
                ),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = state.sponsorCode, onValueChange = vm::onSponsorCode,
                label = { Text(stringResource(R.string.sponsor_code_optional)) },
                singleLine = true, enabled = !state.submitting,
                isError = state.sponsor is SponsorState.NotFound,
                supportingText = {
                    // Confirming the sponsor by name before committing is the
                    // whole point: placement is permanent and a mistyped code
                    // cannot be corrected once commissions depend on it.
                    when (val sp = state.sponsor) {
                        is SponsorState.Found -> Text(stringResource(R.string.sponsor_found, sp.name))
                        SponsorState.NotFound -> Text(stringResource(R.string.sponsor_not_found))
                        SponsorState.Checking -> Text(stringResource(R.string.checking))
                        SponsorState.Empty -> Text(stringResource(R.string.sponsor_blank_help))
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(4.dp))
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
                    Text(stringResource(R.string.create_account))
                }
            }

            TextButton(onClick = onBackToSignIn, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.already_have_account))
            }
        }
    }
}
