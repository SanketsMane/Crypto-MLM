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
import com.fortunex.app.data.remote.RankProgress
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NetworkScreen(vm: NetworkViewModel = hiltViewModel()) {
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
                title = { Text(stringResource(R.string.nav_network)) },
                actions = {
                    TextButton(onClick = vm::load) { Text(stringResource(R.string.refresh)) }
                },
            )
        },
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
                item {
                    StatRow(
                        stringResource(R.string.team_size) to count(state.team.teamSize),
                        stringResource(R.string.direct_referrals) to count(state.team.directCount),
                    )
                }
                item {
                    StatRow(
                        stringResource(R.string.team_business) to usd(state.team.totalTeamBusiness),
                        stringResource(R.string.direct_business) to usd(state.team.directBusiness),
                    )
                }

                /**
                 * Power leg and the rest, shown side by side.
                 *
                 * Rank turns on the 50:50 rule — half the required team business
                 * must come from outside the strongest leg — so these two are
                 * only meaningful next to each other.
                 */
                item {
                    StatRow(
                        stringResource(R.string.power_leg) to usd(state.team.powerLegVolume),
                        stringResource(R.string.other_legs) to usd(state.team.otherLegsVolume),
                    )
                }

                state.currentRank?.let { r ->
                    item {
                        Card(
                            Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                            ),
                        ) {
                            Column(Modifier.padding(16.dp)) {
                                Text(
                                    stringResource(R.string.current_rank),
                                    style = MaterialTheme.typography.labelMedium,
                                )
                                Text(
                                    r.rankName,
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }

                item {
                    Spacer(Modifier.height(4.dp))
                    Text(stringResource(R.string.rank_ladder), style = MaterialTheme.typography.titleSmall)
                }
                items(state.ranks, key = { it.rankCode }) { RankRow(it) }

                if (state.team.legs.isNotEmpty()) {
                    item {
                        Spacer(Modifier.height(4.dp))
                        Text(stringResource(R.string.your_legs), style = MaterialTheme.typography.titleSmall)
                    }
                    items(state.team.legs, key = { it.userCode ?: it.name.orEmpty() }) { leg ->
                        ListItem(
                            headlineContent = { Text(leg.name?.ifBlank { null } ?: leg.userCode ?: "—") },
                            supportingContent = {
                                Text(
                                    stringResource(R.string.members_count, count(leg.size)),
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            },
                            trailingContent = { Text(usd(leg.volume), fontWeight = FontWeight.Medium) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RankRow(r: RankProgress) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    r.rankName,
                    fontWeight = if (r.achieved) FontWeight.SemiBold else FontWeight.Normal,
                )
                Text(
                    if (r.achieved) stringResource(R.string.achieved) else percent(r.percentComplete),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (r.achieved) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!r.achieved) {
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = { (r.percentComplete / 100.0).coerceIn(0.0, 1.0).toFloat() },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    stringResource(
                        R.string.rank_needs,
                        usd(r.required.selfCapital),
                        usd(r.required.teamBusiness),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (runCatching { java.math.BigDecimal(r.reward).signum() == 1 }.getOrDefault(false)) {
                Text(
                    stringResource(R.string.rank_reward, usd(r.reward)),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
