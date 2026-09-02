package com.fortunex.app.data.remote

/**
 * Every way a call can fail, as a type the UI can branch on.
 *
 * The rule this exists to enforce: a timeout is not a failure. When a request
 * times out we do not know whether the server acted, so it gets its own case
 * and its own copy — telling somebody a payment failed when it may have
 * succeeded is how a member sends money twice.
 *
 * `requestId` is carried on everything the server answered, because it is what
 * turns "it broke" in a support ticket into one line in the log.
 */
sealed class AppError {
    /** No usable network. Nothing left the device. */
    data object Offline : AppError()

    /** Sent, but no answer. The outcome is genuinely unknown. */
    data object Timeout : AppError()

    /** The server answered with a failure it described. */
    data class Api(
        val code: String?,
        val message: String?,
        val requestId: String?,
        val httpStatus: Int,
    ) : AppError()

    /** The session is gone. The caller should return to sign-in. */
    data class Unauthorized(val requestId: String?) : AppError()

    /** 5xx. The server broke; the member did nothing wrong. */
    data class Server(val requestId: String?) : AppError()

    /** A response we could not parse, or something genuinely unforeseen. */
    data class Unexpected(val cause: String?) : AppError()

    /** True when trying the same call again is a reasonable thing to offer. */
    val isRetryable: Boolean
        get() = this is Offline || this is Server || this is Unexpected
}
