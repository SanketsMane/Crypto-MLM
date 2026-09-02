package com.fortunex.app

import android.app.Application
import android.os.StrictMode
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class FortuneXApp : Application() {

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) enableStrictMode()
    }

    /**
     * Debug only, and deliberately loud.
     *
     * Disk and network on the main thread do not fail on a developer's fast
     * device — they fail as jank on a cheap phone on a slow network, which is
     * where most members are. Detecting it here means it is a visible violation
     * during development rather than a one-star review later.
     *
     * penaltyLog rather than penaltyDeath: a crash on a third-party library's
     * violation would stop the app being usable while it is being built.
     */
    private fun enableStrictMode() {
        StrictMode.setThreadPolicy(
            StrictMode.ThreadPolicy.Builder()
                .detectDiskReads()
                .detectDiskWrites()
                .detectNetwork()
                .penaltyLog()
                .build(),
        )
        StrictMode.setVmPolicy(
            StrictMode.VmPolicy.Builder()
                .detectLeakedSqlLiteObjects()
                .detectLeakedClosableObjects()
                .penaltyLog()
                .build(),
        )
    }
}
