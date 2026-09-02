package com.fortunex.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Lifted from the web theme rather than reinvented, so a member moving between
 * the site and the app sees one product. The hex values are the same tokens the
 * Next.js app compiles from.
 *
 * Gold is an accent with one job: the primary action and the active state. It
 * is deliberately not used for surfaces, headings or ordinary icons — spent
 * everywhere it stops meaning anything.
 */
val Ground    = Color(0xFF08080E)
val Surface1  = Color(0xFF0F0F17)
val Surface2  = Color(0xFF14141E)
val BorderDim = Color(0xFF24242F)

val TextPrimary   = Color(0xFFE9E8E4)
val TextSecondary = Color(0xFFA3A2AE)
val TextTertiary  = Color(0xFF74737F)

val Gold     = Color(0xFFC89B2C)
val GoldHigh = Color(0xFFDDBB57)
val GoldOn   = Color(0xFF0A0A0F)

/** Semantic, and separate from the accent: money state is not branding. */
val Positive = Color(0xFF6FC79B)
val Negative = Color(0xFFE8837A)
val Pending  = Color(0xFFE0B364)
