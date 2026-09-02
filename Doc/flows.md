Mapped from the route tables, service entry points and job registry — 33 end-to-end flows across nine areas.

Money in

# Flow Path

1 Manual deposit member reports amount + txHash → admin approves/rejects → FUND wallet credited
2 Automatic deposit chain-scan job watches BEP-20 → detects transfer to member's address → auto-credits, no operator
Which one runs depends on depositsAutomatic (whether a chain provider is configured).

Money out

# Flow Path

3 Withdrawal KYC gate → fee + withholding computed → PENDING → admin approves/rejects → rejection refunds in full
4 On-chain payout chain-payouts job signs and broadcasts, records txHash
Investment & earnings

# Flow Path

5 Package purchase FUND debit → investment created → direct bonus (3 levels) → binary bonus if that plan is in force
6 Daily trade bonus daily-roi job on trading days → ROI credit → generation bonus (30 levels, unilevel only)
7 Earnings ceiling every credit consumes cap allowance → investment flips CAPPED when exhausted
8 Rank achievement evaluate-rank job → 50:50 leg rule → reward paid, achievement recorded
9 Flyers Club qualification evaluated → admin fulfils the award
10 Reward cards tier evaluated → member claims
11 Prize draws admin opens → tickets issued → draw run → prize claimed
Network

# Flow Path

12 Referral + sponsorship invite link → registration under sponsor → materialised path/depth
13 Binary placement leftmost-open BFS at signup, with spillover — only when the plan structure is binary
14 Team volume purchase propagates up the tree → power leg / other legs recomputed
Wallet

# Flow Path

15 Internal transfer MAIN ⇄ FUND ⇄ DIGITAL, settles in one transaction, both ledger sides written
Compliance

# Flow Path

16 KYC verification submit → automated checks → admin decision → withdrawals unlocked / rejection reason returned
17 Consent capture signup records which terms version was accepted
18 Privacy export member downloads their own data (GDPR-style)
Support

# Flow Path

19 Support ticket member opens with attachments → admin replies → resolved, on an SLA
20 Public contact form visitor submits → stored + admin notified
Auth & security

# Flow

21 Member register / login / 2FA / forgot-reset password
22 Admin login + 2FA + per-capability RBAC + IP allowlist
23 Session listing and individual revocation
24 Failed-login lockout
25 Support impersonation (users.impersonate, with the banner)
Operations

# Flow

26 Announcements → member banners → dismissal
27 Notifications (in-app) + earnings-digest email
28 Append-only audit trail, now including PII VIEW events
29 Error tracking — faults grouped by fingerprint, resolvable
30 Job scheduling, monitoring and manual re-run
31 Runtime settings governing live behaviour with no redeploy
32 Simulation / dry-run for modelling a plan before launch
33 Plan structure selection, locked on first sponsored enrolment
What that means for "production level"
