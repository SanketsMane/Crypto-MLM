package com.fortunex.app.ui.member

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fortunex.app.R
import com.fortunex.app.data.remote.WalletBalance
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(vm: HomeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbars = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        vm.messages.collectLatest { m ->
            val body = m.literal ?: m.text?.let(context::getString).orEmpty()
            snackbars.showSnackbar(body.ifBlank { context.getString(R.string.err_unexpected) })
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = {
            TopAppBar(
                title = {
                    val name = state.data?.profile?.name?.takeIf { it.isNotBlank() }
                    Text(
                        if (name != null) stringResource(R.string.greeting, name)
                        else stringResource(R.string.nav_home),
                    )
                },
                actions = {
                    TextButton(onClick = { vm.load(isRefresh = true) }, enabled = !state.refreshing) {
                        Text(stringResource(R.string.refresh))
                    }
                    TextButton(onClick = vm::signOut) { Text(stringResource(R.string.sign_out)) }
                },
            )
        },
    ) { padding ->
        when {
            state.loading -> Box(
                Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            state.error != null -> ErrorPane(
                modifier = Modifier.fillMaxSize().padding(padding),
                text = state.error?.literal
                    ?: state.error?.text?.let { stringResource(it) }
                    ?: stringResource(R.string.err_unexpected),
                onRetry = { vm.load() },
            )

            else -> {
                val d = state.data ?: return@Scaffold
                Column(
                    Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        stringResource(R.string.member_code, d.profile.userCode),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    d.wallets.forEach { WalletCard(it) }

                    StatRow(
                        stringResource(R.string.total_invested) to usd(d.investments.totalInvested),
                        stringResource(R.string.total_earned) to usd(d.income.total),
                    )
                    StatRow(
                        stringResource(R.string.earned_today) to usd(d.income.today),
                        stringResource(R.string.rank_label) to
                            (d.profile.rank?.name ?: stringResource(R.string.unranked)),
                    )
                    StatRow(
                        stringResource(R.string.team_size) to count(d.team.teamSize),
                        stringResource(R.string.direct_referrals) to count(d.team.directCount),
                    )

                    CeilingCard(
                        used = usd(d.capping.earned),
                        limit = usd(d.capping.limit),
                        pct = d.capping.percent,
                        capped = d.capping.isCapped,
                    )
                }
            }
        }
    }
}

@Composable
private fun WalletCard(w: WalletBalance) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(walletLabel(w.type), style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(4.dp))
            Text(usd(w.available), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            // `locked` is only worth screen space when some of the balance is
            // actually reserved — otherwise it reads as a second, confusing total.
            if (runCatching { java.math.BigDecimal(w.locked) }.getOrNull()?.signum() == 1) {
                Text(
                    "${stringResource(R.string.locked)}: ${usd(w.locked)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun StatRow(vararg pairs: Pair<String, String>) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        pairs.forEach { (label, value) ->
            OutlinedCard(Modifier.weight(1f)) {
                Column(Modifier.padding(14.dp)) {
                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(2.dp))
                    Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun CeilingCard(used: String, limit: String, pct: Double, capped: Boolean) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.earning_ceiling), style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { (pct / 100.0).coerceIn(0.0, 1.0).toFloat() },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.ceiling_used, used, limit),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (capped) {
                Spacer(Modifier.height(6.dp))
                Text(
                    stringResource(R.string.capped_notice),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun ErrorPane(modifier: Modifier, text: String, onRetry: () -> Unit) {
    Column(
        modifier.padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(12.dp))
        Button(onClick = onRetry) { Text(stringResource(R.string.retry)) }
    }
}
