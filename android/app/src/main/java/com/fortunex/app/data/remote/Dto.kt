package com.fortunex.app.data.remote

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(val emailOrCode: String, val password: String)

@Serializable
data class Tokens(val accessToken: String, val refreshToken: String, val expiresIn: Long? = null)

@Serializable
data class MemberSummary(
    val id: String? = null,
    val userCode: String? = null,
    val email: String? = null,
    val firstName: String? = null,
)

/**
 * Sign-in has two shapes. With two-factor on, the server answers
 * `twoFactorRequired` and a challenge token instead of a session — so the field
 * is nullable and the caller must branch, rather than assume a session exists.
 */
@Serializable
data class LoginResponse(
    val twoFactorRequired: Boolean = false,
    val challengeToken: String? = null,
    val tokens: Tokens? = null,
    val user: MemberSummary? = null,
)

/* ── session lifecycle ─────────────────────────────────────────────────────── */

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class LogoutRequest(val refreshToken: String)

/**
 * The second step of sign-in.
 *
 * The challenge token is not a session — it authorises exactly one thing,
 * expires in five minutes, and is useless against any other endpoint.
 */
@Serializable
data class TwoFactorRequest(val challengeToken: String, val code: String)

/** `GET auth/me` — the signed-in member, richer than the login summary. */
@Serializable
data class MemberProfile(
    val id: String? = null,
    val userCode: String? = null,
    val email: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val status: String? = null,
    val affiliateMode: String? = null,
    val walletAddress: String? = null,
    val totalInvested: String? = null,
    val totalEarned: String? = null,
    val directCount: Int? = null,
    val emailVerifiedAt: String? = null,
    val twoFactorEnabled: Boolean = false,
    val rank: RankSummary? = null,
    val sponsorId: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class RankSummary(
    val code: String? = null,
    val name: String? = null,
    val level: Int? = null,
)
