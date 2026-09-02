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
