package com.fortunex.app.data.auth

import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.AppError
import com.fortunex.app.data.remote.FortuneXApi
import com.fortunex.app.data.remote.LoginRequest
import com.fortunex.app.data.remote.LoginResponse
import com.fortunex.app.data.remote.apiCall
import com.fortunex.app.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The only thing that talks to the auth endpoints.
 *
 * The ViewModel does not touch Retrofit or the token store directly — it asks
 * for an outcome and gets a typed one. That boundary is what lets sign-in be
 * tested without a server, and what stops a second screen inventing its own
 * idea of where the tokens live.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val api: FortuneXApi,
    private val tokens: TokenStore,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    suspend fun login(emailOrCode: String, password: String): ApiResult<LoginResponse> =
        withContext(io) {
            when (val res = apiCall { api.login(LoginRequest(emailOrCode.trim(), password)) }) {
                is ApiResult.Err -> res
                is ApiResult.Ok -> {
                    val body = res.value.data
                        ?: return@withContext ApiResult.Err(
                            AppError.Unexpected("login returned no data"),
                        )
                    // Only a completed sign-in produces a session. A two-factor
                    // challenge deliberately stores nothing.
                    body.tokens?.let { tokens.save(it.accessToken, it.refreshToken) }
                    ApiResult.Ok(body)
                }
            }
        }

    suspend fun signOut() = withContext(io) { tokens.clear() }
}
