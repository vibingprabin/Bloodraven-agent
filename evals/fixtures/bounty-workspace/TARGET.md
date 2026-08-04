# Recommended Target: Aiven Managed Bug Bounty

**Program:** Aiven Managed Bug Bounty
**Slug:** `aiven-mbb-og`
**URL:** https://bugcrowd.com/engagements/aiven-mbb-og

## Why Aiven (summary)

| Dimension | Aiven | vs Okta | vs Auth0 by Okta |
|---|---|---|---|
| Realized avg payout per rewarded bug | **$3,902.05** | $1,233.33 (3.2x lower) | $762.50 (5.1x lower) |
| Median validation time | **5 days** | 11 days | 10 days |
| Rewarded vulnerabilities (activity proof) | 146 | 466 (saturated) | 99 |
| Disclosed reports / coordinated disclosure | **Yes** | No | No |
| Automation policy (decisive for autonomous work) | Scanning tolerated; only *submission* needs a human | **Automated scanning prohibited** ("no automated tools or scanners", "no burp scans") | **Automated scanning = instant ban** (≤5 req/s Burp cap) |
| Test infrastructure | **Self-provisioned in-scope instances** (8 managed DB services) + free trial credits | Credentialed oktapreview sandbox orgs (production) | Dedicated researcher tenant (manage.cic-bug-bounty.auth0app.com) |
| Max bounty ceiling | $25,000 | $75,000 | $50,000 |

## Decision logic (STEP 4 criteria)

- **(a) Scope quality** — `api.aiven.io` is a fully documented public REST API (`api.aiven.io/doc`) that provisions and controls 8 in-scope managed database services (Kafka, ClickHouse, Valkey, Metrics, Grafana, MySQL, OpenSearch, PostgreSQL). The console (`console.aiven.io`) and marketing site (`aiven.io`) round out the web surface. Uniquely, the program **gives researchers self-owned, in-scope instances to attack** — an autonomous agent can exercise the API and data-plane against resources it controls, which is both safe and high-signal. Program guidance: website bugs are "frequently reported and have a high number of duplicates" while managed-DB-application issues are "mostly unique."
- **(b) Payout** — Highest realized payout economics in the shortlist: average payout **$3,902.05** per rewarded bug (n=146), max **$25,000**. Focus areas paid as P1: cross-client data access, total control of another customer's account, orchestration-plane pivots, RCE on non-code-exec services. (Engagement summary: min $50 / max $25,000; no per-severity table published in the fetched scope JSON.)
- **(c) Activity** — 146 rewarded vulnerabilities; **5-day median validation** (fastest of all three); disclosed reports enabled + coordinated disclosure (transparent feedback loop for iterating); brief last published 2026-07-21; 13 announcements (actively managed).
- **(d) Accessibility** — `accessStatus=open`, `isPrivate=false`, `serviceLevel=Priority Triage`, scopeRank 3; full safe harbor; free-tier signup + free trial credits for testing; only `@bugcrowdninja.com` accounts required.

## Why not Okta or Auth0

- **Okta** (`okta`, $75k ceiling): rules prohibit automated scanning entirely; 466 rewarded vulns since 2016 = very mature, high duplicate pressure; 11-day validation; testing is on production-adjacent sandbox orgs; average payout 3.2x lower than Aiven's.
- **Auth0 by Okta** (`auth0-okta`, $50k ceiling): richest pure auth-protocol API surface (OAuth/OIDC/SAML, Management API, FGA APIs, dedicated researcher tenant) but **automated scanning is an instant-ban offense** (Burp Intruder hard-capped at 5 req/s), reports containing "low-effort or AI-generated content" are rejected, average payout is the lowest of the three ($762.50), and the bonus multiplier window (P1 3x) ended 2026-05-09. 99 rewarded vulns vs. a private program history since 2019 = duplicate risk.

## First moves for an autonomous researcher

1. **Provision the sandbox:** register with `@bugcrowdninja.com` email; sign up for a free trial on `console.aiven.io`; use trial credits to create one instance per managed service (start with PostgreSQL + Kafka — the two deepest feature sets).
2. **Map `api.aiven.io`:** pull the OpenAPI spec at `api.aiven.io/doc`; enumerate the provisioning/management endpoints (project, service, user, integration CRUD) — this is the cross-account / IDOR hunting ground.
3. **Target the documented focus areas:** cross-client data access (tenant isolation in the API), account-takeover paths, orchestration-plane pivots, and RCE via service configuration.
4. **Test data-plane boundaries:** with 2 self-owned accounts, test cross-account access to each other's services/credentials (using only accounts you own, per RoE).
5. **Respect the constraints:** keep a human in the loop for submission (automated submission is banned); do not submit scanner output; PoC must work on Aiven-hosted instances, not upstream CVEs.

## Safety note

Recon and targeting only — no testing was performed against any Aiven asset in this session. Actual testing requires an authorized Bugcrowd researcher account on the program and compliance with its Rules of Engagement.
