package com.fortunex.app.di

import com.fortunex.app.BuildConfig
import com.fortunex.app.data.auth.TokenStore
import com.fortunex.app.data.remote.FortuneXApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    private val json = Json {
        ignoreUnknownKeys = true   // the API may add fields; an old client must not break
        explicitNulls = false
    }

    @Provides
    @Singleton
    fun okHttp(tokens: TokenStore): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val token = runBlocking { tokens.access() }
            val req = chain.request().newBuilder()
                .apply { token?.let { header("Authorization", "Bearer $it") } }
                .build()
            chain.proceed(req)
        }
        .apply {
            if (BuildConfig.DEBUG) {
                // BASIC, not BODY: a body log would print access tokens and
                // balances into logcat, which is readable by anyone with adb.
                addInterceptor(
                    HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC },
                )
            }
        }
        .build()

    @Provides
    @Singleton
    fun retrofit(client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    @Provides
    @Singleton
    fun api(retrofit: Retrofit): FortuneXApi = retrofit.create(FortuneXApi::class.java)
}
