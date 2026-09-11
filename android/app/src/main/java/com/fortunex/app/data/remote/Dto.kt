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

/* ── registration and recovery ─────────────────────────────────────────────── */

@Serializable
data class RegisterRequest(
    val firstName: String,
    val lastName: String? = null,
    val email: String,
    val phone: String? = null,
    val password: String,
    val sponsorCode: String? = null,
    val walletAddress: String? = null,
)

/** Confirms a referral code before someone commits to registering under it. */
@Serializable
data class SponsorLookup(
    val userCode: String = "",
    val name: String = "",
)

@Serializable
data class ForgotPasswordRequest(val email: String)

/**
 * The challenge id ties the code to the request that issued it.
 *
 * Without it a six-digit code would be guessable against every outstanding
 * reset on the platform at once, rather than against one.
 */
@Serializable
data class ResetPasswordRequest(
    val challengeId: String,
    val code: String,
    val newPassword: String,
)

@Serializable
data class ForgotPasswordResponse(
    val challengeId: String? = null,
    val expiresInSeconds: Long? = null,
)
