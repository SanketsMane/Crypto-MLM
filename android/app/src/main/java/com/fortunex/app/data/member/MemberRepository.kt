package com.fortunex.app.data.member

import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.AppError
import com.fortunex.app.data.remote.Dashboard
import com.fortunex.app.data.remote.Deposit
import com.fortunex.app.data.remote.FortuneXApi
import com.fortunex.app.data.remote.GatewayStatus
import com.fortunex.app.data.remote.Investment
import com.fortunex.app.data.remote.LedgerPage
import com.fortunex.app.data.remote.PackagePlan
import com.fortunex.app.data.remote.PurchaseRequest
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

    suspend fun startDeposit(amount: String, idempotencyKey: String): ApiResult<Deposit> =
        withContext(io) {
            unwrap(apiCall { api.startDeposit(idempotencyKey, StartDepositRequest(amount)) }, "deposit")
        }

    suspend fun deposits(): ApiResult<List<Deposit>> = withContext(io) {
        unwrap(apiCall { api.deposits() }, "deposits")
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
