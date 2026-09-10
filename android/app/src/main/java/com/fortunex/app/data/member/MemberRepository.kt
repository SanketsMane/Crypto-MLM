package com.fortunex.app.data.member

import com.fortunex.app.data.remote.ApiResult
import com.fortunex.app.data.remote.AppError
import com.fortunex.app.data.remote.Dashboard
import com.fortunex.app.data.remote.FortuneXApi
import com.fortunex.app.data.remote.LedgerPage
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
