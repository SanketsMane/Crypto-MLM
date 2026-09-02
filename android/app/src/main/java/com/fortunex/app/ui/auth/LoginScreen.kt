package com.fortunex.app.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.fortunex.app.ui.theme.*

/**
 * Presentation only for now — the API call, token storage and the two-factor
 * step land in the next slice. It is here so the navigation graph terminates
 * somewhere real rather than on a placeholder.
 */
@Composable
fun LoginScreen() {
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        Modifier
            .fillMaxSize()
            .background(Ground)
            .systemBarsPadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(48.dp))
        Text("FortuneX", style = FxTypography.headlineLarge, color = TextPrimary)
        Spacer(Modifier.height(8.dp))
        Text("Sign in to your account", style = FxTypography.bodyMedium, color = TextTertiary)
        Spacer(Modifier.height(40.dp))

        OutlinedTextField(
            value = identifier,
            onValueChange = { identifier = it },
            label = { Text("Email or member code") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = { /* wired in the next slice */ },
            enabled = identifier.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = GoldOn),
        ) {
            Text("Sign in", style = FxTypography.titleMedium)
        }
    }
}
