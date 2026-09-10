package com.fortunex.app.ui.member

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Home
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

private enum class Tab(val route: String, val label: Int, val icon: ImageVector) {
    HOME("member/home", R.string.nav_home, Icons.Filled.Home),
    WALLET("member/wallet", R.string.nav_wallet, Icons.Filled.AccountBalanceWallet),
}

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
                composable(Tab.WALLET.route) { WalletScreen() }
            }
        }
    }
}
