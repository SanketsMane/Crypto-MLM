package com.fortunex.app.data.auth

import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.AppError
import com.fortunex.app.data.remote.FortuneXApi
import com.fortunex.app.data.remote.LoginRequest
import com.fortunex.app.data.remote.LoginResponse
import com.fortunex.app.data.remote.LogoutRequest
import com.fortunex.app.data.remote.MemberProfile
import com.fortunex.app.data.remote.TwoFactorRequest
import com.fortunex.app.data.remote.apiCall
import com.fortunex.app.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
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
    /** Drives the top-level gate between the sign-in and member graphs. */
    val isSignedIn: Flow<Boolean> = tokens.isSignedIn

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

    /**
     * Finishes a sign-in that asked for a second factor.
     *
     * The challenge token is spent here; a session only exists once the code
     * has been accepted.
     */
    suspend fun completeTwoFactor(challengeToken: String, code: String): ApiResult<LoginResponse> =
        withContext(io) {
            when (
                val res = apiCall {
                    api.completeTwoFactor(TwoFactorRequest(challengeToken, code.trim()))
                }
            ) {
                is ApiResult.Err -> res
                is ApiResult.Ok -> {
                    val body = res.value.data
                        ?: return@withContext ApiResult.Err(
                            AppError.Unexpected("two-factor returned no data"),
                        )
                    body.tokens?.let { tokens.save(it.accessToken, it.refreshToken) }
                    ApiResult.Ok(body)
                }
            }
        }

    suspend fun me(): ApiResult<MemberProfile> = withContext(io) {
        when (val res = apiCall { api.me() }) {
            is ApiResult.Err -> res
            is ApiResult.Ok -> res.value.data
                ?.let { ApiResult.Ok(it) }
                ?: ApiResult.Err(AppError.Unexpected("me returned no data"))
        }
    }

    /**
     * Ends the session on the server as well as on the device.
     *
     * Clearing local storage alone only makes this handset forget the token —
     * the refresh token stays valid for its full thirty days to anyone holding
     * a copy, which is exactly the case sign-out exists to close.
     *
     * The local clear happens regardless of what the server says. A member who
     * taps sign out on a train must end up signed out; a failed network call is
     * not a reason to leave them logged in.
     */
    suspend fun signOut() = withContext(io) {
        val refresh = tokens.refresh()
        if (refresh != null) {
            runCatching { api.logout(LogoutRequest(refresh)) }
        }
        tokens.clear()
    }
}
