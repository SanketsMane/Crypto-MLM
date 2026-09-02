package com.fortunex.app.data.remote

import kotlinx.serialization.json.Json
import okio.IOException
import retrofit2.HttpException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/** Success or a typed failure. Repositories return this; nothing throws upward. */
sealed class ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>()
    data class Err(val error: AppError) : ApiResult<Nothing>()
}

private val lenient = Json { ignoreUnknownKeys = true }

/**
 * Runs a call and turns anything it can throw into an `AppError`.
 *
 * Deliberately not `catch (e: Exception) { null }`: the difference between no
 * network, a timeout and a refused credential is the whole of the error copy,
 * and collapsing them loses it.
 */
suspend fun <T> apiCall(block: suspend () -> T): ApiResult<T> = try {
    ApiResult.Ok(block())
} catch (e: SocketTimeoutException) {
    ApiResult.Err(AppError.Timeout)
} catch (e: UnknownHostException) {
    ApiResult.Err(AppError.Offline)
} catch (e: IOException) {
    ApiResult.Err(AppError.Offline)
} catch (e: HttpException) {
    val raw = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
    val body = raw?.let {
        runCatching { lenient.decodeFromString<ApiEnvelope<Unit>>(it).error }.getOrNull()
    }
    ApiResult.Err(
        when {
            e.code() == 401 -> AppError.Unauthorized(body?.requestId)
            e.code() >= 500 -> AppError.Server(body?.requestId)
            else -> AppError.Api(body?.code, body?.message, body?.requestId, e.code())
        },
    )
} catch (e: Throwable) {
    ApiResult.Err(AppError.Unexpected(e.message))
}
