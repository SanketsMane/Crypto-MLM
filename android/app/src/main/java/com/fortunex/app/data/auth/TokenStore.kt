package com.fortunex.app.data.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.authStore by preferencesDataStore(name = "fortunex_auth")

/** Access and refresh tokens, encrypted at rest. */
@Singleton
class TokenStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val accessKey = stringPreferencesKey("access")
    private val refreshKey = stringPreferencesKey("refresh")

    val isSignedIn: Flow<Boolean> =
        context.authStore.data.map { it[refreshKey] != null }

    suspend fun access(): String? =
        context.authStore.data.first()[accessKey]?.let(Keystore::decrypt)

    suspend fun refresh(): String? =
        context.authStore.data.first()[refreshKey]?.let(Keystore::decrypt)

    suspend fun save(access: String, refresh: String) {
        context.authStore.edit {
            it[accessKey] = Keystore.encrypt(access)
            it[refreshKey] = Keystore.encrypt(refresh)
        }
    }

    /** Called on sign-out and whenever the server says the session is gone. */
    suspend fun clear() {
        context.authStore.edit { it.clear() }
    }
}
