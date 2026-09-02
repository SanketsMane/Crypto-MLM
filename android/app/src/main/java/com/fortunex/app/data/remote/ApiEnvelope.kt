package com.fortunex.app.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Every response from the API is wrapped: `{ success, data }` or
 * `{ success, error: { code, message, requestId } }`.
 *
 * The `code` is the part worth reading. The backend distinguishes cases the app
 * must handle differently — STEP_UP_REQUIRED means prompt, PAYOUT_ADDRESS_HOLD
 * means explain a wait, KYC_REQUIRED means route to capture — and treating them
 * all as "an error occurred" throws that away.
 */
@Serializable
data class ApiEnvelope<T>(
    val success: Boolean,
    val data: T? = null,
    val error: ApiErrorBody? = null,
)

@Serializable
data class ApiErrorBody(
    val code: String? = null,
    val message: String? = null,
    @SerialName("requestId") val requestId: String? = null,
)
