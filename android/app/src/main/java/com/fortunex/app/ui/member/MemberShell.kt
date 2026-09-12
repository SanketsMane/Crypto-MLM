package com.fortunex.app.ui.member

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.fortunex.app.R

/**
 * Five destinations, which is Material's ceiling for a bottom bar.
 *
 * Deposit and Withdraw are deliberately NOT tabs. They are things done TO a
 * wallet rather than places, they would have pushed the bar to seven, and a
 * crowded bar makes every destination harder to hit. They live one tap inside
 * Wallet, where a member already is when they think about moving money.
 */
private enum class Tab(val route: String, val label: Int, val icon: ImageVector) {
    HOME("member/home", R.string.nav_home, Icons.Filled.Home),
    WALLET("member/wallet", R.string.nav_wallet, Icons.Filled.AccountBalanceWallet),
    INVEST("member/invest", R.string.nav_invest, Icons.Filled.TrendingUp),
    NETWORK("member/network", R.string.nav_network, Icons.Filled.Groups),
    ACCOUNT("member/account", R.string.nav_account, Icons.Filled.Person),
}

private const val ROUTE_DEPOSIT = "member/deposit"
private const val ROUTE_WITHDRAW = "member/withdraw"

/**
 * Verification is reached from wherever it is demanded — the withdrawal gate or
 * the account screen — rather than owning a permanent slot it would spend
 * unused after the one time a member completes it.
 */
private const val ROUTE_KYC = "member/kyc"
private const val ROUTE_NOTIFICATIONS = "member/notifications"
private const val ROUTE_SUPPORT = "member/support"

/**
 * The signed-in shell.
 *
 * Its own NavHost, nested inside the app graph, so the tabs keep their own back
 * stacks and switching between them does not unwind the sign-in graph behind.
 */
@Composable
fun MemberShell() {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val current = entry?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { tab ->
                    val selected = current?.hierarchy?.any { it.route == tab.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            nav.navigate(tab.route) {
                                /* Saving and restoring state keeps a scrolled
                                   passbook where the member left it, and popping
                                   to the start stops the back stack growing by
                                   one entry every time a tab is tapped. */
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, contentDescription = null) },
                        label = { Text(stringResource(tab.label)) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            NavHost(nav, startDestination = Tab.HOME.route) {
                composable(Tab.HOME.route) { HomeScreen() }

                composable(Tab.WALLET.route) {
                    WalletScreen(
                        onDeposit = { nav.navigate(ROUTE_DEPOSIT) },
                        onWithdraw = { nav.navigate(ROUTE_WITHDRAW) },
                    )
                }

                composable(Tab.INVEST.route) { InvestScreen() }
                composable(Tab.NETWORK.route) { NetworkScreen() }

                composable(Tab.ACCOUNT.route) {
                    AccountScreen(
                        onVerifyIdentity = { nav.navigate(ROUTE_KYC) },
                        onNotifications = { nav.navigate(ROUTE_NOTIFICATIONS) },
                        onSupport = { nav.navigate(ROUTE_SUPPORT) },
                    )
                }

                composable(ROUTE_NOTIFICATIONS) { NotificationsScreen() }
                composable(ROUTE_SUPPORT) { SupportScreen() }

                composable(ROUTE_DEPOSIT) { DepositScreen() }

                composable(ROUTE_WITHDRAW) {
                    WithdrawScreen(onVerifyIdentity = { nav.navigate(ROUTE_KYC) })
                }

                composable(ROUTE_KYC) { KycScreen(onDone = { nav.popBackStack() }) }
            }
        }
    }
}
