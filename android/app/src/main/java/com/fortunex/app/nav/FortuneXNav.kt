package com.fortunex.app.nav

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.fortunex.app.ui.auth.LoginScreen
import com.fortunex.app.ui.auth.TwoFactorScreen
import com.fortunex.app.ui.member.HomeScreen
import com.fortunex.app.ui.onboarding.OnboardingScreen

object Routes {
    const val ONBOARDING = "onboarding"
    const val LOGIN = "login"
    const val TWO_FACTOR = "two-factor/{challengeToken}"
    const val HOME = "home"

    fun twoFactor(token: String) = "two-factor/$token"
}

/**
 * The start destination is decided before this composes, from the persisted
 * flag and the stored session — not navigated to afterwards. Routing on arrival
 * would show the introduction for a frame to a returning member, and a flicker
 * on the first screen of a financial app is the wrong first impression.
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
                onSignedIn = { navController.toHome() },
                onNeedsTwoFactor = { token -> navController.navigate(Routes.twoFactor(token)) },
            )
        }

        composable(
            route = Routes.TWO_FACTOR,
            arguments = listOf(navArgument("challengeToken") { type = NavType.StringType }),
        ) { entry ->
            TwoFactorScreen(
                challengeToken = entry.arguments?.getString("challengeToken").orEmpty(),
                onSignedIn = { navController.toHome() },
            )
        }

        composable(Routes.HOME) { HomeScreen() }
    }
}

/**
 * Entering the member area clears the sign-in stack.
 *
 * Without this, Back from the dashboard returns to a login form belonging to a
 * session that already exists — and on a two-factor sign-in, to a spent
 * challenge screen that can only fail.
 */
private fun NavHostController.toHome() {
    navigate(Routes.HOME) {
        popUpTo(graph.startDestinationId) { inclusive = true }
        launchSingleTop = true
    }
}
