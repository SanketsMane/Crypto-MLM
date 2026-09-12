package com.fortunex.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.fortunex.app.data.auth.AuthRepository
import com.fortunex.app.data.prefs.OnboardingPrefs
import com.fortunex.app.nav.FortuneXNav
import com.fortunex.app.nav.Routes
import com.fortunex.app.ui.theme.FortuneXTheme
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Holds the one decision the splash is waiting on: where the app should open.
 * Null means "not known yet", which is what keeps the system splash on screen.
 */
@HiltViewModel
class StartViewModel @Inject constructor(
    private val prefs: OnboardingPrefs,
    private val auth: AuthRepository,
) : ViewModel() {
    private val _start = MutableStateFlow<String?>(null)
    val start: StateFlow<String?> = _start

    init {
        viewModelScope.launch {
            /**
             * A stored session skips sign-in entirely.
             *
             * Read once, here, rather than observed: the gate decides where the
             * app opens, and re-evaluating it live would yank a member out of
             * whatever they were doing the moment a background call happened to
             * 401. Sign-out navigates deliberately instead.
             */
            val signedIn = auth.isSignedIn.first()
            val seenIntro = prefs.hasSeenOnboarding.first()
            _start.value = when {
                signedIn -> Routes.HOME
                seenIntro -> Routes.LOGIN
                else -> Routes.ONBOARDING
            }
        }
    }

    fun markOnboardingSeen() {
        viewModelScope.launch { prefs.markSeen() }
    }
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val vm: StartViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        /**
         * Installed before super.onCreate, and held until the start destination
         * is known.
         *
         * This is what makes the splash do real work rather than pad the launch
         * with a timer: the platform keeps painting the brand plate while the
         * persisted flag and the session are read, and the first Compose frame
         * is already the correct screen. A fixed delay would be slower for
         * everyone and would still not guarantee the answer had arrived.
         */
        val splash = installSplashScreen()
        splash.setKeepOnScreenCondition { vm.start.value == null }

        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            FortuneXTheme {
                val start = vm.start.collectAsStateWithLifecycle().value
                if (start != null) {
                    FortuneXNav(
                        startDestination = start,
                        onOnboardingComplete = vm::markOnboardingSeen,
                    )
                }
            }
        }
    }
}
