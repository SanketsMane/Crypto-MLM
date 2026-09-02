package com.fortunex.app.data.remote

import retrofit2.http.Body
import retrofit2.http.POST

interface FortuneXApi {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): ApiEnvelope<LoginResponse>
}
