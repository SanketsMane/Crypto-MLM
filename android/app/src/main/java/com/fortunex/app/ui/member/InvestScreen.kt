package com.fortunex.app.ui.member

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.fortunex.app.data.remote.Investment
import com.fortunex.app.data.remote.PackagePlan
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvestScreen(vm: InvestViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbars = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        vm.messages.collectLatest { m ->
            val body = m.literal ?: m.text?.let(context::getString).orEmpty()
            snackbars.showSnackbar(body.ifBlank { context.getString(R.string.err_unexpected) })
        }
    }
    LaunchedEffect(Unit) {
        vm.purchased.collectLatest { snackbars.showSnackbar(context.getString(R.string.invest_done)) }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbars) },
        topBar = { TopAppBar(title = { Text(stringResource(R.string.nav_invest)) }) },
    ) { padding ->
        when {
            state.loading -> Box(
                Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            state.error != null -> Column(
                Modifier.fillMaxSize().padding(padding).padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    state.error?.literal
                        ?: state.error?.text?.let { stringResource(it) }
                        ?: stringResource(R.string.err_unexpected),
                )
                Spacer(Modifier.height(12.dp))
                Button(onClick = vm::load) { Text(stringResource(R.string.retry)) }
            }

            else -> LazyColumn(
                Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (state.holdings.isNotEmpty()) {
                    item {
                        Text(stringResource(R.string.my_investments), style = MaterialTheme.typography.titleSmall)
                    }
                    items(state.holdings, key = { it.id }) { HoldingCard(it) }
                    item { Spacer(Modifier.height(8.dp)) }
                }

                item { Text(stringResource(R.string.available_plans), style = MaterialTheme.typography.titleSmall) }
                items(state.plans, key = { it.id }) { plan ->
                    PlanCard(plan) { vm.askToConfirm(plan) }
                }
            }
        }
    }

    state.confirming?.let { plan ->
        AlertDialog(
            onDismissRequest = { if (!state.submitting) vm.dismissConfirm() },
            title = { Text(stringResource(R.string.confirm_invest_title, plan.name)) },
            text = {
                Text(
                    stringResource(
                        R.string.confirm_invest_body,
                        usd(plan.amount),
                        plan.dailyRoiPercent,
                        usd(capOf(plan)),
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = vm::confirmPurchase, enabled = !state.submitting) {
                    if (state.submitting) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    } else {
                        Text(stringResource(R.string.confirm))
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = vm::dismissConfirm, enabled = !state.submitting) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

/** capPercent is a percentage of the plan price, e.g. 250 of $110. */
private fun capOf(p: PackagePlan): String = runCatching {
    java.math.BigDecimal(p.amount)
        .multiply(java.math.BigDecimal(p.capPercent))
        .divide(java.math.BigDecimal(100))
        .toPlainString()
}.getOrDefault("0")

@Composable
private fun PlanCard(p: PackagePlan, onBuy: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(p.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(2.dp))
            Text(usd(p.amount), style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.plan_terms, p.dailyRoiPercent, usd(capOf(p))),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            Button(onClick = onBuy, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.invest_now))
            }
        }
    }
}

@Composable
private fun HoldingCard(inv: Investment) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(inv.plan?.name ?: usd(inv.amount), fontWeight = FontWeight.Medium)
                AssistChip(onClick = {}, label = { Text(inv.status) })
            }
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.holding_progress, usd(inv.totalEarned), usd(inv.capLimit)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
