package com.fortunex.app.ui.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.fortunex.app.ui.theme.*
import kotlinx.coroutines.launch

private data class Page(val title: String, val body: String)

/**
 * Three screens, and every one of them says something true.
 *
 * The temptation with onboarding is to sell — "earn daily returns!" — which on
 * a product that pays a percentage is both a compliance problem and a promise
 * nobody should make. These explain how the plan works and what the ceiling is,
 * because a member who understands the cap does not raise a ticket about it
 * later.
 */
private val pages = listOf(
    Page(
        "Your capital, working weekdays",
        "Buy a plan and it earns a daily trade bonus Monday to Friday. Weekends do not accrue, and every credit lands in your Main wallet where you can see it.",
    ),
    Page(
        "Build a team, earn on it",
        "Introduce members and earn on their purchases three levels up, then on their daily earnings thirty levels deep. Every rate is published in the app.",
    ),
    Page(
        "You always know where you stand",
        "Each plan has a lifetime ceiling — the most it can ever pay. Your progress towards it is on the home screen from day one, so nothing is a surprise.",
    ),
)

@Composable
fun OnboardingScreen(onFinished: () -> Unit) {
    val state = rememberPagerState(pageCount = { pages.size })
    val scope = rememberCoroutineScope()
    val last = state.currentPage == pages.lastIndex

    Column(
        Modifier
            .fillMaxSize()
            .background(Ground)
            .systemBarsPadding()
            .padding(horizontal = 24.dp),
    ) {
        // Skip stays available on every page. Trapping someone in an
        // introduction is a good way to lose them before they sign in.
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onFinished) {
                Text("Skip", color = TextSecondary, style = FxTypography.labelLarge)
            }
        }

        HorizontalPager(state = state, modifier = Modifier.weight(1f)) { index ->
            val page = pages[index]
            Column(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier
                        .size(96.dp)
                        .background(Surface1, RoundedCornerShape(28.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "${index + 1}",
                        style = FxTypography.displayLarge,
                        color = Gold,
                    )
                }
                Spacer(Modifier.height(40.dp))
                Text(
                    page.title,
                    style = FxTypography.headlineLarge,
                    color = TextPrimary,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    page.body,
                    style = FxTypography.bodyLarge,
                    color = TextSecondary,
                    textAlign = TextAlign.Center,
                )
            }
        }

        Row(
            Modifier
                .fillMaxWidth()
                .padding(bottom = 20.dp)
                .semantics { contentDescription = "Page ${state.currentPage + 1} of ${pages.size}" },
            horizontalArrangement = Arrangement.Center,
        ) {
            repeat(pages.size) { i ->
                val on = i == state.currentPage
                Box(
                    Modifier
                        .padding(horizontal = 4.dp)
                        .size(width = if (on) 22.dp else 8.dp, height = 8.dp)
                        .background(if (on) Gold else BorderDim, CircleShape),
                )
            }
        }

        Button(
            onClick = {
                if (last) onFinished()
                else scope.launch { state.animateScrollToPage(state.currentPage + 1) }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
                .padding(bottom = 0.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = GoldOn),
        ) {
            Text(if (last) "Get started" else "Next", style = FxTypography.titleMedium)
        }
        Spacer(Modifier.height(24.dp))
    }
}
