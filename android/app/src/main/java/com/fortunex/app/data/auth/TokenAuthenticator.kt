package com.fortunex.app.data.auth

import com.fortunex.app.data.remote.FortuneXApi
import com.fortunex.app.data.remote.RefreshRequest
import dagger.Lazy
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Renews the session when the server says the access token has expired.
 *
 * Access tokens last fifteen minutes; the refresh token lasts thirty days.
 * Without this the app worked for exactly one fifteen-minute window and then
 * 401'd on everything, with a perfectly good refresh token sitting unused in
 * the store — the member's only way out being to force-quit and sign in again.
 *
 * An Authenticator rather than an Interceptor because OkHttp calls it *after* a
 * 401, hands it the failed request, and retries whatever it returns. Returning
 * null means "give up", which is what propagates the 401 to the caller.
 *
 * Three things make it safe:
 *
 *   1. It never tries to refresh the refresh call itself, which would loop.
 *   2. `priorResponse` depth caps the retries, so a server that 401s a
 *      brand-new token cannot spin forever.
 *   3. It is serialised on a lock, and re-checks the stored token first. Ten
 *      screens loading at once produce ten 401s; without that check they would
 *      fire ten refreshes, and since the backend RETIRES the presented token on
 *      every rotation, nine of them would arrive holding a retired one — which
 *      the server reads as theft and answers by revoking the entire session
 *      family. The check turns the other nine into "someone already did it".
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    // Lazy breaks the cycle: the API is built on the OkHttp client that this
    // authenticator is installed into.
    private val api: Lazy<FortuneXApi>,
    private val tokens: TokenStore,
) : Authenticator {

    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.encodedPath.endsWith("/auth/refresh")) return null
        if (responseCount(response) >= 2) return null

        synchronized(lock) {
            val attempted = response.request.header("Authorization")?.removePrefix("Bearer ")
            val stored = runBlocking { tokens.access() }

            // Refreshed by another request while this one waited on the lock.
            if (stored != null && stored != attempted) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer $stored")
                    .build()
            }

            val refreshToken = runBlocking { tokens.refresh() } ?: return null

            val fresh = runCatching {
                api.get().refreshBlocking(RefreshRequest(refreshToken)).execute()
            }.getOrNull()
                ?.takeIf { it.isSuccessful }
                ?.body()
                ?.data
                ?.tokens

            if (fresh == null) {
                /* The refresh token is expired, revoked, or was reused. There is
                   no way back from here, so the session is cleared — the app
                   observes that and returns to sign-in, rather than retrying a
                   dead credential on every screen. */
                runBlocking { tokens.clear() }
                return null
            }

            runBlocking { tokens.save(fresh.accessToken, fresh.refreshToken) }
            return response.request.newBuilder()
                .header("Authorization", "Bearer ${fresh.accessToken}")
                .build()
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) { count++; prior = prior.priorResponse }
        return count
    }
}
