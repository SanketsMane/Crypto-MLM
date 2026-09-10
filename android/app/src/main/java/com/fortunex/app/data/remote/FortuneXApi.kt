package com.fortunex.app.data.remote

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface FortuneXApi {

    /* ── sign-in ───────────────────────────────────────────────────────────── */

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): ApiEnvelope<LoginResponse>

    /** Second factor. Exchanges the challenge ticket for a real session. */
    @POST("auth/2fa/challenge")
    suspend fun completeTwoFactor(@Body body: TwoFactorRequest): ApiEnvelope<LoginResponse>

    /* ── session lifecycle ─────────────────────────────────────────────────── */

    /**
     * Rotates the refresh token. The presented one is retired server-side, so
     * the pair that comes back MUST replace what is stored — presenting a
     * retired token again is treated as theft and kills the whole session
     * family.
     *
     * Deliberately NOT suspend: the OkHttp Authenticator that calls this runs
     * on a blocking dispatcher inside the interceptor chain.
     */
    @POST("auth/refresh")
    fun refreshBlocking(@Body body: RefreshRequest): retrofit2.Call<ApiEnvelope<LoginResponse>>

    /** Ends the session server-side. Clearing the device alone leaves the
     *  refresh token valid for its full 30 days to anyone holding a copy. */
    @POST("auth/logout")
    suspend fun logout(@Body body: LogoutRequest): ApiEnvelope<Unit>

    @GET("auth/me")
    suspend fun me(): ApiEnvelope<MemberProfile>

    /* ── member area ───────────────────────────────────────────────────────── */

    @GET("customer/dashboard")
    suspend fun dashboard(): ApiEnvelope<Dashboard>

    @GET("wallet")
    suspend fun wallets(): ApiEnvelope<WalletsResponse>

    @GET("wallet/ledger")
    suspend fun ledger(
        @Query("take") take: Int = 30,
        @Query("skip") skip: Int = 0,
    ): ApiEnvelope<LedgerPage>
}
