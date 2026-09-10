package com.fortunex.app.data.remote

import kotlinx.serialization.Serializable

/**
 * Member-facing payloads.
 *
 * Money arrives as a STRING everywhere, never a number. The backend keeps every
 * balance as Decimal(38,8) precisely so that no rounding happens in transit, and
 * decoding it into a Double here would undo that at the last step — 0.1 + 0.2 is
 * not 0.3, and a member reading their own balance is the worst place to learn it.
 * Formatting for display is the UI's job; the value stays exact until then.
 *
 * Every field is nullable with a default. The app must survive the API adding,
 * renaming or omitting fields — an old build in someone's pocket has to keep
 * working after a deploy, not crash on an unfamiliar response.
 */

@Serializable
data class WalletBalance(
    val type: String = "",
    val balance: String = "0",
    val locked: String = "0",
    /** balance − locked. What the member can actually spend. */
    val available: String = "0",
)

@Serializable
data class Capping(
    val limit: String = "0",
    val earned: String = "0",
    val remaining: String = "0",
    val isCapped: Boolean = false,
    val percent: Double = 0.0,
    val usedPercent: Double = 0.0,
    val mode: String? = null,
    val ceiling: Double? = null,
)

@Serializable
data class WalletsResponse(
    val wallets: List<WalletBalance> = emptyList(),
    val capping: Capping = Capping(),
)

@Serializable
data class DashboardProfile(
    val userCode: String = "",
    val name: String = "",
    val email: String = "",
    val walletAddress: String? = null,
    val affiliateMode: String = "PASSIVE",
    val status: String = "",
    val rank: RankSummary? = null,
    val joinedAt: String? = null,
    val referralLink: String? = null,
)

@Serializable
data class InvestmentTotals(
    val totalInvested: String = "0",
    val totalEarned: String = "0",
    val active: Int = 0,
    val capped: Int = 0,
    val count: Int = 0,
)

@Serializable
data class IncomeBreakdown(
    val category: String = "",
    val total: String = "0",
    val count: Int = 0,
)

@Serializable
data class IncomeTotals(
    val total: String = "0",
    val today: String = "0",
    val yesterday: String = "0",
    val breakdown: List<IncomeBreakdown> = emptyList(),
)

@Serializable
data class TeamTotals(
    val totalTeamBusiness: String = "0",
    val directBusiness: String = "0",
    val powerLegVolume: String = "0",
    val otherLegsVolume: String = "0",
    val teamSize: Int = 0,
    val directCount: Int = 0,
    val activeDirectCount: Int = 0,
)

@Serializable
data class Dashboard(
    val profile: DashboardProfile = DashboardProfile(),
    val wallets: List<WalletBalance> = emptyList(),
    val capping: Capping = Capping(),
    val investments: InvestmentTotals = InvestmentTotals(),
    val income: IncomeTotals = IncomeTotals(),
    val team: TeamTotals = TeamTotals(),
)

/** One row of the member's own ledger. */
@Serializable
data class LedgerRow(
    val id: String = "",
    val category: String = "",
    val direction: String = "CREDIT",
    val amount: String = "0",
    val wallet: String? = null,
    val description: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class LedgerPage(
    val total: Int = 0,
    val rows: List<LedgerRow> = emptyList(),
)
