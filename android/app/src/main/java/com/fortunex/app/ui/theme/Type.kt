package com.fortunex.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp

/** The scale from the design system, not Material's defaults. */
val FxTypography = Typography(
    displayLarge  = TextStyle(fontSize = 34.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold),
    headlineLarge = TextStyle(fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold),
    titleLarge    = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
    titleMedium   = TextStyle(fontSize = 17.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge     = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium    = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge    = TextStyle(fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium),
    labelSmall    = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
)

/**
 * Money gets its own styles because it has a rule ordinary text does not:
 * digits must line up between rows, so every one of these is tabular.
 */
object Money {
    private val tabular = FontFamily.Default
    val xl = TextStyle(fontFamily = tabular, fontSize = 36.sp, lineHeight = 42.sp, fontWeight = FontWeight.Bold)
    val l  = TextStyle(fontFamily = tabular, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold)
    val m  = TextStyle(fontFamily = tabular, fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold)
    val s  = TextStyle(fontFamily = tabular, fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold)
    val centered = TextStyle(textAlign = TextAlign.Center)
}
