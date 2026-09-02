package com.fortunex.app.ui.common

import androidx.annotation.StringRes
import com.fortunex.app.R
import com.fortunex.app.data.remote.AppError

/**
 * What the member is shown when something goes wrong.
 *
 * Built from the typed error rather than from an exception message, so the copy
 * says what happened and what to do — and never surfaces a stack trace, a
 * provider's wording, or a raw error code. The reference id is kept separately:
 * it is shown small, because it means nothing to the member and everything to
 * support.
 */
data class UiMessage(
    @StringRes val text: Int? = null,
    val literal: String? = null,
    val reference: String? = null,
    val actionLabel: Int? = null,
)

fun AppError.toMessage(): UiMessage = when (this) {
    AppError.Offline -> UiMessage(text = R.string.err_offline, actionLabel = R.string.retry)
    AppError.Timeout -> UiMessage(text = R.string.err_timeout, actionLabel = R.string.retry)
    is AppError.Server -> UiMessage(text = R.string.err_server, reference = requestId, actionLabel = R.string.retry)
    is AppError.Unauthorized -> UiMessage(text = R.string.err_invalid_credentials, reference = requestId)
    is AppError.Api ->
        // The server writes member-facing copy for the cases it knows about, so
        // prefer it; fall back only when it gave us nothing usable.
        if (!message.isNullOrBlank()) UiMessage(literal = message, reference = requestId)
        else UiMessage(text = R.string.err_unexpected, reference = requestId)
    is AppError.Unexpected -> UiMessage(text = R.string.err_unexpected)
}
