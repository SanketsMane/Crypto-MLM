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

/**
 * One row of the member's own ledger — the passbook.
 *
 * `balanceAfter` is the running balance the server recorded at the moment the
 * entry was written. Shown rather than recomputed on the client: the ledger is
 * the authority, and a total derived here could disagree with it after any
 * paging or filtering.
 */
@Serializable
data class LedgerEntry(
    val id: String = "",
    val wallet: String = "",
    val direction: String = "CREDIT",
    val category: String = "",
    val amount: String = "0",
    val balanceAfter: String = "0",
    val reference: String? = null,
    val description: String? = null,
    val createdAt: String? = null,
)

/** The server names this list `entries`, not `rows`. */
@Serializable
data class LedgerPage(
    val total: Int = 0,
    val entries: List<LedgerEntry> = emptyList(),
)

/* ── plans and investments ─────────────────────────────────────────────────── */

@Serializable
data class PackagePlan(
    val id: String = "",
    val name: String = "",
    val amount: String = "0",
    val dailyRoiPercent: String = "0",
    val capPercent: String = "0",
    val sortOrder: Int = 0,
    val isActive: Boolean = true,
)

@Serializable
data class PackageRef(val name: String = "")

@Serializable
data class Investment(
    val id: String = "",
    val amount: String = "0",
    val capLimit: String = "0",
    val totalEarned: String = "0",
    val dailyRoiPercent: String = "0",
    val status: String = "ACTIVE",
    val startedAt: String? = null,
    val lastAccrualDate: String? = null,
    val cappedAt: String? = null,
    @kotlinx.serialization.SerialName("package")
    val plan: PackageRef? = null,
)

@Serializable
data class PurchaseRequest(val packageId: String)

/* ── deposits ──────────────────────────────────────────────────────────────── */

@Serializable
data class Deposit(
    val id: String = "",
    val reference: String = "",
    val amount: String = "0",
    val status: String = "PENDING",
    val network: String? = null,
    val txHash: String? = null,
    val paymentUrl: String? = null,
    val gatewayStatus: String? = null,
    val createdAt: String? = null,
)

/** Whether the app should offer gateway checkout, and which one is live. */
@Serializable
data class GatewayStatus(
    val canCharge: Boolean = false,
    val provider: String? = null,
    val canPay: Boolean = false,
    val sandbox: Boolean = false,
)

@Serializable
data class StartDepositRequest(val amount: String)

/* ── step-up re-authentication ─────────────────────────────────────────────── */

/**
 * Proof the member is still present, for an action that moves money out.
 *
 * Either a password or an authenticator code — the server decides which is
 * enough based on the amount, and says so when it is not.
 */
@Serializable
data class StepUpRequest(
    val password: String? = null,
    val code: String? = null,
)

@Serializable
data class StepUpTicket(
    val token: String = "",
    val method: String = "password",
    val expiresInSeconds: Long = 0,
)

/* ── withdrawals ───────────────────────────────────────────────────────────── */

/**
 * What an amount would actually pay out.
 *
 * Served by the API rather than computed here, deliberately: the member must
 * agree to the same figure the server will settle. The web app used to derive
 * fee and withholding itself in floats while the server used Decimal rounding
 * DOWN, so the number shown was permitted to disagree with the number paid.
 */
@Serializable
data class WithdrawalQuote(
    val amount: String = "0",
    val fee: String = "0",
    val feePercent: Double = 0.0,
    val tax: String = "0",
    val taxPercent: Double = 0.0,
    val net: String = "0",
)

@Serializable
data class WithdrawalRequest(
    val amount: String,
    val walletAddress: String,
)

@Serializable
data class Withdrawal(
    val id: String = "",
    val reference: String = "",
    val amount: String = "0",
    val fee: String = "0",
    val tax: String = "0",
    val netAmount: String = "0",
    val walletAddress: String = "",
    val network: String? = null,
    val status: String = "PENDING",
    val txHash: String? = null,
    val rejectReason: String? = null,
    val slaDueAt: String? = null,
    val createdAt: String? = null,
)

/* ── identity verification ─────────────────────────────────────────────────── */

@Serializable
data class KycDocument(
    val id: String = "",
    val type: String = "",
    val mimeType: String = "",
    val sizeBytes: Long = 0,
)

@Serializable
data class KycSubmission(
    val id: String = "",
    val status: String = "PENDING",
    val fullName: String? = null,
    val documentNo: String? = null,
    val countryCode: String? = null,
    val rejectionReason: String? = null,
    val reviewedAt: String? = null,
    val documents: List<KycDocument> = emptyList(),
)

/** `NOT_STARTED` when nothing has ever been submitted. */
@Serializable
data class KycState(
    val status: String = "NOT_STARTED",
    val submission: KycSubmission? = null,
)

/** Documents travel base64-encoded inside the JSON body, up to four at a time. */
@Serializable
data class KycUpload(
    val type: String,
    val mimeType: String,
    val data: String,
)

@Serializable
data class KycSubmitRequest(
    val fullName: String,
    val documentNo: String,
    val countryCode: String,
    val dateOfBirth: String? = null,
    val documents: List<KycUpload>,
)

/* ── network and rank ──────────────────────────────────────────────────────── */

@Serializable
data class TeamLeg(
    val userCode: String? = null,
    val name: String? = null,
    val volume: String = "0",
    val size: Int = 0,
)

@Serializable
data class TeamSummary(
    val totalTeamBusiness: String = "0",
    val directBusiness: String = "0",
    val powerLegVolume: String = "0",
    val otherLegsVolume: String = "0",
    val teamSize: Int = 0,
    val directCount: Int = 0,
    val legs: List<TeamLeg> = emptyList(),
)

@Serializable
data class RankRequirement(
    val selfCapital: String = "0",
    val teamBusiness: String = "0",
    val powerLegMax: String = "0",
    val otherLegsMin: String = "0",
)

@Serializable
data class RankActual(
    val selfCapital: String = "0",
    val teamBusiness: String = "0",
    val powerLeg: String = "0",
    val otherLegs: String = "0",
)

/**
 * One rung of the ladder, with what it needs and where the member stands.
 *
 * `percentComplete` is computed server-side against team business. Recomputing
 * it here would risk showing a different figure from the one the platform uses
 * to decide whether the rank is actually achieved.
 */
@Serializable
data class RankProgress(
    val rankCode: String = "",
    val rankName: String = "",
    val level: Int = 0,
    val required: RankRequirement = RankRequirement(),
    val actual: RankActual = RankActual(),
    val achieved: Boolean = false,
    val achievedAt: String? = null,
    val reward: String = "0",
    val percentComplete: Double = 0.0,
)

/* ── notifications ─────────────────────────────────────────────────────────── */

/**
 * `id` is the RECIPIENT row, not the notification.
 *
 * Read state hangs off the recipient, so the same announcement has a different
 * id for every reader — marking one read must use this id, not the event's.
 */
@Serializable
data class Notification(
    val id: String = "",
    val type: String = "",
    val category: String = "",
    val severity: String = "INFO",
    val title: String = "",
    val body: String = "",
    val link: String? = null,
    val readAt: String? = null,
    val archivedAt: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class NotificationPage(
    val rows: List<Notification> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class NotificationSummary(
    val unread: Int = 0,
    val total: Int = 0,
)

@Serializable
data class MarkReadRequest(val ids: List<String>)

/* ── support ───────────────────────────────────────────────────────────────── */

@Serializable
data class TicketAttachment(
    val id: String = "",
    val fileName: String = "",
    val mimeType: String = "",
    val sizeBytes: Long = 0,
)

@Serializable
data class TicketMessage(
    val id: String = "",
    val body: String = "",
    val fromAdmin: Boolean = false,
    val createdAt: String? = null,
    val attachments: List<TicketAttachment> = emptyList(),
)

@Serializable
data class SupportTicket(
    val id: String = "",
    val subject: String = "",
    val status: String = "OPEN",
    val priority: String = "NORMAL",
    val category: String = "OTHER",
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val messages: List<TicketMessage> = emptyList(),
)

@Serializable
data class NewTicketRequest(
    val subject: String,
    val body: String,
    val category: String? = null,
)

@Serializable
data class TicketReplyRequest(val body: String)
