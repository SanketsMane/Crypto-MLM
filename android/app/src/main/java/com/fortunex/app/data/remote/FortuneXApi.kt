package com.fortunex.app.data.remote

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface FortuneXApi {

    /* ── sign-in ───────────────────────────────────────────────────────────── */

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): ApiEnvelope<LoginResponse>

    /** Second factor. Exchanges the challenge ticket for a real session. */
    @POST("auth/2fa/challenge")
    suspend fun completeTwoFactor(@Body body: TwoFactorRequest): ApiEnvelope<LoginResponse>

    /** Creates the account and signs it in, in one step. */
    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): ApiEnvelope<LoginResponse>

    /**
     * Confirms a referral code before registration commits to it.
     *
     * Worth a round trip: placement in the network is permanent, and a mistyped
     * sponsor code cannot be corrected afterwards because every commission
     * already paid depends on where the member sits.
     */
    @GET("auth/sponsor/{code}")
    suspend fun lookupSponsor(@Path("code") code: String): ApiEnvelope<SponsorLookup>

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): ApiEnvelope<ForgotPasswordResponse>

    @POST("auth/reset-password")
    suspend fun resetPassword(@Body body: ResetPasswordRequest): ApiEnvelope<Unit>

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

    /* ── plans and investments ─────────────────────────────────────────────── */

    @GET("packages")
    suspend fun packages(): ApiEnvelope<List<PackagePlan>>

    @GET("investments")
    suspend fun investments(): ApiEnvelope<List<Investment>>

    /**
     * Buying a plan moves money, so it carries an idempotency key.
     *
     * A double-tapped button otherwise produces two separate intents, each with
     * its own reference, both of which look entirely legitimate to the server —
     * and the member is charged twice. The key is generated once per submission
     * and reused across retries, so the second arrival is answered from the
     * stored response instead of executing again.
     */
    @POST("investments/purchase")
    suspend fun purchase(
        @Header("Idempotency-Key") key: String,
        @Body body: PurchaseRequest,
    ): ApiEnvelope<Investment>

    /* ── deposits ──────────────────────────────────────────────────────────── */

    @GET("deposits")
    suspend fun deposits(): ApiEnvelope<List<Deposit>>

    @GET("gateway/status")
    suspend fun gatewayStatus(): ApiEnvelope<GatewayStatus>

    /** Raises a checkout invoice and returns the URL the member pays at. */
    @POST("gateway/deposit")
    suspend fun startDeposit(
        @Header("Idempotency-Key") key: String,
        @Body body: StartDepositRequest,
    ): ApiEnvelope<Deposit>

    /* ── withdrawals ───────────────────────────────────────────────────────── */

    /** Exchanges a password or authenticator code for a short-lived ticket. */
    @POST("auth/step-up")
    suspend fun stepUp(@Body body: StepUpRequest): ApiEnvelope<StepUpTicket>

    /**
     * Read-only pricing while the member is still typing — no ticket, no
     * idempotency key, and none of the gates that guard the real request.
     */
    @GET("withdrawals/quote")
    suspend fun withdrawalQuote(@Query("amount") amount: String): ApiEnvelope<WithdrawalQuote>

    @GET("withdrawals")
    suspend fun withdrawals(): ApiEnvelope<List<Withdrawal>>

    /**
     * The real thing. Carries BOTH an idempotency key and a step-up ticket:
     * the key stops one intent becoming two payouts, the ticket proves the
     * member is still at the handset.
     */
    @POST("withdrawals")
    suspend fun requestWithdrawal(
        @Header("Idempotency-Key") key: String,
        @Header("X-Step-Up") stepUp: String,
        @Body body: WithdrawalRequest,
    ): ApiEnvelope<Withdrawal>

    /* ── identity verification ─────────────────────────────────────────────── */

    /* ── network ───────────────────────────────────────────────────────────── */

    @GET("team")
    suspend fun team(): ApiEnvelope<TeamSummary>

    /** Every rung of the ladder, with the member's standing against each. */
    @GET("rank")
    suspend fun rank(): ApiEnvelope<List<RankProgress>>

    @GET("kyc")
    suspend fun kyc(): ApiEnvelope<KycState>

    @POST("kyc")
    suspend fun submitKyc(@Body body: KycSubmitRequest): ApiEnvelope<KycSubmission>
}
