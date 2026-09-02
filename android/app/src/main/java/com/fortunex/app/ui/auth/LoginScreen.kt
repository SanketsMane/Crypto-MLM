package com.fortunex.app.ui.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fortunex.app.R
import com.fortunex.app.ui.common.UiMessage
import com.fortunex.app.ui.theme.*
import kotlinx.coroutines.flow.collectLatest

@Composable
fun LoginScreen(
    onSignedIn: () -> Unit = {},
    onNeedsTwoFactor: (String) -> Unit = {},
    vm: LoginViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbars = remember { SnackbarHostState() }
    val keyboard = LocalSoftwareKeyboardController.current
    val passwordFocus = remember { FocusRequester() }
    var reveal by rememberSaveable { mutableStateOf(false) }

    // Errors arrive as one-shot messages, so a rotation does not replay them.
    // Resolved here rather than inside the snackbar helper, because a string
    // resource needs a Context and a suspend extension has none — resolving it
    // there silently produced an empty snackbar.
    val context = LocalContext.current
    LaunchedEffect(Unit) {
        vm.messages.collectLatest { m ->
            val body = m.literal ?: m.text?.let(context::getString).orEmpty()
            snackbars.showSnackbar(
                message = listOfNotNull(
                    body.ifBlank { null },
                    m.reference?.let { context.getString(R.string.reference_is, it) },
                ).joinToString("  ·  ").ifBlank { context.getString(R.string.err_unexpected) },
                withDismissAction = true,
                duration = SnackbarDuration.Long,
            )
        }
    }
    LaunchedEffect(Unit) {
        vm.events.collectLatest { e ->
            when (e) {
                is LoginEvent.SignedIn -> onSignedIn()
                is LoginEvent.NeedsTwoFactor -> onNeedsTwoFactor(e.challengeToken)
            }
        }
    }

    Scaffold(
        containerColor = Ground,
        snackbarHost = { SnackbarHost(snackbars) },
    ) { inner ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(inner)
                // Scrollable so the form still reaches the keyboard on a short
                // screen or at a large font scale.
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(48.dp))
            Image(
                painter = painterResource(R.drawable.fx_wordmark),
                contentDescription = stringResource(R.string.brand_logo),
                contentScale = ContentScale.Fit,
                modifier = Modifier.width(220.dp),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.sign_in_subtitle),
                style = FxTypography.bodyMedium,
                color = TextTertiary,
            )
            Spacer(Modifier.height(40.dp))

            OutlinedTextField(
                value = state.identifier,
                onValueChange = vm::onIdentifier,
                label = { Text(stringResource(R.string.email_or_member_code)) },
                singleLine = true,
                isError = state.identifierError != null,
                supportingText = state.identifierError?.let { { Text(stringResource(it)) } },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
                keyboardActions = KeyboardActions(onNext = { passwordFocus.requestFocus() }),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = state.password,
                onValueChange = vm::onPassword,
                label = { Text(stringResource(R.string.password)) },
                singleLine = true,
                isError = state.passwordError != null,
                visualTransformation =
                    if (reveal) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    // 48dp so it clears the minimum target even though the glyph
                    // inside it is small.
                    IconButton(onClick = { reveal = !reveal }, modifier = Modifier.size(48.dp)) {
                        Text(
                            if (reveal) "•" else "○",
                            color = TextSecondary,
                            modifier = Modifier.clearAndSetSemantics {},
                        )
                    }
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { keyboard?.hide(); vm.submit() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(passwordFocus),
            )

            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { keyboard?.hide(); vm.submit() },
                enabled = state.canSubmit,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Gold,
                    contentColor = GoldOn,
                    disabledContainerColor = Surface2,
                    disabledContentColor = TextTertiary,
                ),
            ) {
                if (state.submitting) {
                    // The label stays, so the button does not change width and
                    // the member can still read what they pressed.
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = GoldOn,
                    )
                    Spacer(Modifier.width(10.dp))
                }
                Text(stringResource(R.string.sign_in), style = FxTypography.titleMedium)
            }

            Spacer(Modifier.height(16.dp))
            TextButton(
                onClick = { },
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(
                    stringResource(R.string.forgot_password),
                    style = FxTypography.labelLarge,
                    color = TextSecondary,
                )
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}
