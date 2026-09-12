package com.fortunex.app.ui.member

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat

/**
 * Formats a money string for display — and only for display.
 *
 * The value travels from the API as an exact decimal string and is parsed with
 * BigDecimal, never Double: the ledger keeps eight decimal places and a Double
 * cannot hold them faithfully. Rounding happens once, here, at the last
 * possible moment, and HALF_UP so a member never sees a total that is a cent
 * short of the rows above it.
 */
private val pattern = DecimalFormat("#,##0.00")

fun usd(raw: String?): String {
    val value = raw?.takeIf { it.isNotBlank() }?.let {
        runCatching { BigDecimal(it) }.getOrNull()
    } ?: BigDecimal.ZERO
    return "$" + pattern.format(value.setScale(2, RoundingMode.HALF_UP))
}

/** Whole numbers where cents would be noise — team counts, sizes. */
fun count(n: Int?): String = DecimalFormat("#,##0").format(n ?: 0)

/** A percentage that is already 0–100 from the server. */
fun percent(p: Double?): String = DecimalFormat("0.#").format(p ?: 0.0) + "%"

/** MAIN -> "Main wallet" etc., without a when-block at every call site. */
fun walletLabel(type: String): String = when (type.uppercase()) {
    "MAIN" -> "Main wallet"
    "FUND" -> "Fund wallet"
    "DIGITAL" -> "Digital wallet"
    else -> type
}
