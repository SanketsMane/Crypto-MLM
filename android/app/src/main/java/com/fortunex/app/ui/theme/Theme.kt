package com.fortunex.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

/**
 * Dark in both system settings, on purpose.
 *
 * The brand is a near-black plate with a gold accent — the same decision the
 * web app makes for its sidebar and member card. A light variant would have to
 * re-derive every semantic colour to stay legible, and a half-done light theme
 * on a screen showing balances is worse than a committed dark one. When a light
 * theme is wanted it should be designed, not inverted.
 */
private val FxDark = darkColorScheme(
    primary = Gold,
    onPrimary = GoldOn,
    secondary = GoldHigh,
    background = Ground,
    onBackground = TextPrimary,
    surface = Surface1,
    onSurface = TextPrimary,
    surfaceVariant = Surface2,
    onSurfaceVariant = TextSecondary,
    outline = BorderDim,
    error = Negative,
)

@Composable
fun FortuneXTheme(
    @Suppress("UNUSED_PARAMETER") darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(colorScheme = FxDark, typography = FxTypography, content = content)
}
