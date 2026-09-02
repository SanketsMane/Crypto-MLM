package com.fortunex.app.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "fortunex_prefs")

/**
 * Whether the introduction has been seen.
 *
 * In DataStore rather than in memory because the decision has to survive
 * process death: Android will kill a backgrounded app freely, and showing the
 * introduction again to somebody who has already read it reads as a bug.
 *
 * Deliberately excluded from cloud backup — see data_extraction_rules.xml. It
 * is harmless on its own, but it lives in the same store as auth state.
 */
@Singleton
class OnboardingPrefs @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val seenKey = booleanPreferencesKey("onboarding_seen")

    val hasSeenOnboarding: Flow<Boolean> =
        context.dataStore.data.map { it[seenKey] ?: false }

    suspend fun markSeen() {
        context.dataStore.edit { it[seenKey] = true }
    }
}
