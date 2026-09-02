package com.fortunex.app.nav

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.fortunex.app.ui.auth.LoginScreen
import com.fortunex.app.ui.onboarding.OnboardingScreen

object Routes {
    const val ONBOARDING = "onboarding"
    const val LOGIN = "login"
}

/**
 * The start destination is decided before this composes, from the persisted
 * flag — not navigated to afterwards. Routing on arrival would show the
 * introduction for a frame to a returning member, and a flicker on the first
 * screen of a financial app is the wrong first impression.
 */
@Composable
fun FortuneXNav(
    startDestination: String,
    onOnboardingComplete: () -> Unit,
    navController: NavHostController = rememberNavController(),
) {
    NavHost(navController = navController, startDestination = startDestination) {
        composable(Routes.ONBOARDING) {
            OnboardingScreen(
                onFinished = {
                    // Recorded before navigating, so a member who reaches the
                    // login screen never sees the introduction again — including
                    // via Skip, which is the path most people take.
                    onOnboardingComplete()
                    navController.navigate(Routes.LOGIN) {
                        // The introduction is not somewhere to go back to.
                        popUpTo(Routes.ONBOARDING) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.LOGIN) {
            LoginScreen(
                onSignedIn = { /* the member area lands in the next slice */ },
                onNeedsTwoFactor = { /* two-factor screen lands in the next slice */ },
            )
        }
    }
}
