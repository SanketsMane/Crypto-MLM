package com.fortunex.app.data.member

import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.AppError
import com.fortunex.app.data.remote.Dashboard
import com.fortunex.app.data.remote.Deposit
import com.fortunex.app.data.remote.FortuneXApi
import com.fortunex.app.data.remote.GatewayStatus
import com.fortunex.app.data.remote.Investment
import com.fortunex.app.data.remote.KycState
import com.fortunex.app.data.remote.KycSubmission
import com.fortunex.app.data.remote.KycSubmitRequest
import com.fortunex.app.data.remote.LedgerPage
import com.fortunex.app.data.remote.MarkReadRequest
import com.fortunex.app.data.remote.NewTicketRequest
import com.fortunex.app.data.remote.NotificationPage
import com.fortunex.app.data.remote.NotificationSummary
import com.fortunex.app.data.remote.SupportTicket
import com.fortunex.app.data.remote.TicketReplyRequest
import com.fortunex.app.data.remote.StepUpRequest
import com.fortunex.app.data.remote.StepUpTicket
import com.fortunex.app.data.remote.Withdrawal
import com.fortunex.app.data.remote.WithdrawalQuote
import com.fortunex.app.data.remote.WithdrawalRequest
import com.fortunex.app.data.remote.PackagePlan
import com.fortunex.app.data.remote.PurchaseRequest
import com.fortunex.app.data.remote.RankProgress
import com.fortunex.app.data.remote.TeamSummary
import com.fortunex.app.data.remote.StartDepositRequest
import com.fortunex.app.data.remote.WalletsResponse
import com.fortunex.app.data.remote.apiCall
import com.fortunex.app.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Everything the signed-in member area reads.
 *
 * Kept separate from AuthRepository so the session lifecycle has exactly one
 * owner: a screen that needs a balance asks here, and nothing outside
 * data/auth ever touches the token store.
 */
@Singleton
class MemberRepository @Inject constructor(
    private val api: FortuneXApi,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    suspend fun dashboard(): ApiResult<Dashboard> = withContext(io) {
        unwrap(apiCall { api.dashboard() }, "dashboard")
    }

    suspend fun wallets(): ApiResult<WalletsResponse> = withContext(io) {
        unwrap(apiCall { api.wallets() }, "wallet")
    }

    suspend fun ledger(take: Int = 30, skip: Int = 0): ApiResult<LedgerPage> = withContext(io) {
        unwrap(apiCall { api.ledger(take, skip) }, "ledger")
    }

    suspend fun packages(): ApiResult<List<PackagePlan>> = withContext(io) {
        unwrap(apiCall { api.packages() }, "packages")
    }

    suspend fun investments(): ApiResult<List<Investment>> = withContext(io) {
        unwrap(apiCall { api.investments() }, "investments")
    }

    suspend fun gatewayStatus(): ApiResult<GatewayStatus> = withContext(io) {
        unwrap(apiCall { api.gatewayStatus() }, "gateway status")
    }

    /**
     * Money-moving calls take their idempotency key from the CALLER, not from
     * here.
     *
     * Generating one inside this function would defeat the point: a retry would
     * mint a fresh key, the server would read it as a new intent, and the member
     * would be charged twice for one tap. The key belongs to the submission, so
     * the ViewModel creates it once and reuses it across every attempt.
     */
    suspend fun purchase(packageId: String, idempotencyKey: String): ApiResult<Investment> =
        withContext(io) {
            unwrap(apiCall { api.purchase(idempotencyKey, PurchaseRequest(packageId)) }, "purchase")
        }

    suspend fun startDeposit(
        amount: String,
        provider: String?,
        idempotencyKey: String,
    ): ApiResult<Deposit> =
        withContext(io) {
            unwrap(
                apiCall { api.startDeposit(idempotencyKey, StartDepositRequest(amount, provider)) },
                "deposit",
            )
        }

    suspend fun deposits(): ApiResult<List<Deposit>> = withContext(io) {
        unwrap(apiCall { api.deposits() }, "deposits")
    }

    /* ── withdrawals ───────────────────────────────────────────────────────── */

    suspend fun stepUp(password: String?, code: String?): ApiResult<StepUpTicket> =
        withContext(io) {
            unwrap(apiCall { api.stepUp(StepUpRequest(password, code)) }, "step-up")
        }

    suspend fun withdrawalQuote(amount: String): ApiResult<WithdrawalQuote> = withContext(io) {
        unwrap(apiCall { api.withdrawalQuote(amount) }, "quote")
    }

    suspend fun withdrawals(): ApiResult<List<Withdrawal>> = withContext(io) {
        unwrap(apiCall { api.withdrawals() }, "withdrawals")
    }

    suspend fun requestWithdrawal(
        amount: String,
        walletAddress: String,
        stepUpToken: String,
        idempotencyKey: String,
    ): ApiResult<Withdrawal> = withContext(io) {
        unwrap(
            apiCall {
                api.requestWithdrawal(
                    idempotencyKey, stepUpToken, WithdrawalRequest(amount, walletAddress),
                )
            },
            "withdrawal",
        )
    }

    /* ── network ───────────────────────────────────────────────────────────── */

    suspend fun team(): ApiResult<TeamSummary> = withContext(io) {
        unwrap(apiCall { api.team() }, "team")
    }

    suspend fun rank(): ApiResult<List<RankProgress>> = withContext(io) {
        unwrap(apiCall { api.rank() }, "rank")
    }

    /* ── notifications ─────────────────────────────────────────────────────── */

    suspend fun notifications(take: Int = 30): ApiResult<NotificationPage> = withContext(io) {
        unwrap(apiCall { api.notifications(take) }, "notifications")
    }

    suspend fun notificationSummary(): ApiResult<NotificationSummary> = withContext(io) {
        unwrap(apiCall { api.notificationSummary() }, "notification summary")
    }

    suspend fun markRead(ids: List<String>): ApiResult<Unit> = withContext(io) {
        when (val res = apiCall { api.markRead(MarkReadRequest(ids)) }) {
            is ApiResult.Err -> res
            is ApiResult.Ok -> ApiResult.Ok(Unit)
        }
    }

    suspend fun markAllRead(): ApiResult<Unit> = withContext(io) {
        when (val res = apiCall { api.markAllRead() }) {
            is ApiResult.Err -> res
            is ApiResult.Ok -> ApiResult.Ok(Unit)
        }
    }

    /* ── support ───────────────────────────────────────────────────────────── */

    suspend fun tickets(): ApiResult<List<SupportTicket>> = withContext(io) {
        unwrap(apiCall { api.tickets() }, "tickets")
    }

    suspend fun createTicket(subject: String, body: String, category: String?): ApiResult<SupportTicket> =
        withContext(io) {
            unwrap(apiCall { api.createTicket(NewTicketRequest(subject, body, category)) }, "ticket")
        }

    suspend fun replyToTicket(id: String, body: String): ApiResult<SupportTicket> = withContext(io) {
        unwrap(apiCall { api.replyToTicket(id, TicketReplyRequest(body)) }, "reply")
    }

    /* ── identity verification ─────────────────────────────────────────────── */

    suspend fun kyc(): ApiResult<KycState> = withContext(io) {
        unwrap(apiCall { api.kyc() }, "kyc")
    }

    suspend fun submitKyc(body: KycSubmitRequest): ApiResult<KycSubmission> = withContext(io) {
        unwrap(apiCall { api.submitKyc(body) }, "kyc submission")
    }

    /**
     * `success: true` with a null body is not success.
     *
     * Every envelope carries an optional `data`, so without this each call site
     * would either force-unwrap — turning a malformed response into a crash in
     * front of the member — or silently render a screen full of zeroes, which on
     * a balance is worse than an error.
     */
    private fun <T> unwrap(res: ApiResult<com.fortunex.app.data.remote.ApiEnvelope<T>>, what: String): ApiResult<T> =
        when (res) {
            is ApiResult.Err -> res
            is ApiResult.Ok -> res.value.data
                ?.let { ApiResult.Ok(it) }
                ?: ApiResult.Err(AppError.Unexpected("$what returned no data"))
        }
}
