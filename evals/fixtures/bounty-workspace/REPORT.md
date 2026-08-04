# BUG BOUNTY TARGETING REPORT

**Prepared by:** Bloodraven (autonomous research agent)
**Date:** 2026-08-04
**Method:** Live fetch of Bugcrowd engagement data via `curl.exe` (real data only; every figure below was fetched this session). Recon-only — no findings were submitted and no testing was performed.

**Evidence files (working directory):**
- `engagements_p1.json`, `engagements_p2.json`, `engagements_p3.json` — target universe (72 programs)
- `engagements_all.csv` — parsed universe
- `okta.html`, `auth0-okta.html`, `aiven-mbb-og.html` — program brief pages
- `okta_scope.json`, `auth0-okta_scope.json`, `aiven-mbb-og_scope.json` — full scope documents (via `getBriefVersionDocument` changelog API)
- `okta_stats.json`, `auth0-okta_stats.json`, `aiven-mbb-og_stats.json` — program statistics
- `okta_targets.csv`, `auth0-okta_targets.csv`, `aiven-mbb-og_targets.csv` — enumerated in-scope target lists

---

## Target Universe (72 programs, top payouts)

Fetched from `https://bugcrowd.com/engagements.json?category=bug_bounty&sort_by=rewards&sort_direction=desc` (pages 1–3; 72 programs, all `accessStatus=open`, `isPrivate=false` unless noted).

**Top-10 by maxReward:**

| Program | Min | Max | ScopeRank | Service Level | Industry |
|---|---:|---:|:---:|---|---|
| OpenSea Managed Bug Bounty Program | $125 | $3,000,000 | 4 | Platform | Computer Software |
| Fireblocks MPC Managed Bug Bounty Engagement | $200 | $150,000 | 1 | Platform | Computer Software |
| T-Mobile | Points | $133,700 | 4 | Platform | Utilities |
| Tesla | $100 | $100,000 | 4 | Platform | Automotive |
| SpaceX/Starlink | Points | $100,000 | 1 | Self-managed | Technology |
| Sophos | $100 | $80,000 | 4 | Platform | Computer Software |
| **Okta** | $100 | **$75,000** | 4 | **Priority Triage** | Cloud |
| **Auth0 by Okta** | $100 | **$50,000** | 4 | **Priority Triage** | Cloud |
| AXIS OS | $500 | $40,000 | 1 | Platform | Technology |
| Pinterest | $200 | $25,000 | 4 | Platform | Media |

Note: only 10 of 72 programs run Priority Triage or P1 24/7 service levels (the rest are Platform/Self-managed). High-ceiling programs (OpenSea, Fireblocks, T-Mobile, Tesla) do **not** offer priority service levels.

## Candidates Shortlist (5, with bounty + rationale)

Filter: `accessStatus=open` · `isPrivate=false` · serviceLevel ∈ {Priority Triage, P1 24/7} · scopeRank 3–4 · web/API-oriented industry (finance, technology, computer software, cloud).

| # | Program (slug) | Max | ScopeRank | Industry | Rationale |
|---|---|---|:---:|---|---|
| 1 | **Okta** (`okta`) | $75,000 | 4 | Cloud | Highest max of any open+public+Priority-Triage program in the universe; rank-4 identity platform surface. |
| 2 | **Auth0 by Okta** (`auth0-okta`) | $50,000 | 4 | Cloud | Auth/API platform (OAuth/OIDC/SAML, Management API, FGA); dedicated researcher tenant. |
| 3 | **Aiven Managed Bug Bounty** (`aiven-mbb-og`) | $25,000 | 3 | Computer Software | Managed cloud databases; public API + self-provisioned in-scope instances. |
| 4 | **eToro Managed Bug Bounty Engagement** (`etoro-mbb-og`) | $15,000 | 3 | Finance | Fintech trading APIs; finance industry is web/API-heavy. |
| 5 | **OpenAI** (`openai`) | $6,500 | 3 | Technology | Large web+API+LLM surface; lower max but high researcher relevance. |

Runner-up: Cisco Networking (`cisconetworking`, $10,000, rank 4, Priority Triage) — dropped on industry tie-break (Electronics, hardware-centric surface).

**Top-3 highest maxReward seen (even if competitive):** OpenSea ($3,000,000, Platform, rank 4) · Fireblocks MPC (`fireblocks-mbb-og2`, $150,000, Platform, rank 1) · T-Mobile ($133,700, Platform, rank 4, pays Points).

## Scope Analysis (top-3, enumerated in-scope targets per program)

Scope documents fetched from each program's `getBriefVersionDocument` changelog endpoint; in-scope targets enumerated from `data.scope[].targets[]` (name, uri, category). Statistics from `/engagements/<slug>/statistics`.

### 1) Okta — `okta` (scopeRank 4, Priority Triage)
- **21 in-scope targets** across 8 groups (18 additional targets explicitly out-of-scope)
- Category breakdown: **website 9 · android 1 · ios 1 · other 10**
- Web targets: `support.okta.com` (support portal); sandbox identity orgs `bugcrowd-pam-###.oktapreview.com`, `-admin.oktapreview.com`, `.pam.oktapreview.com`, `.workflows.oktapreview.com`, `.at.oktapreview.com` (credentials issued to researchers); `app.scaleft.com` + Advanced Server Access; Okta Verify mobile/desktop, browser plugins, on-prem agents (other)
- Published per-group payout table (from scope JSON `rewardRange`): OIE / Device Access / Other — P1 **$10,000–$75,000**, P2 $4,000–$10,000, P3 $1,000–$4,000, P4 $100–$1,000; Privileged Access / Workflows / ASA — P1 $7,000–$35,000; AtSpoke — P1 $5,000–$25,000; Support Portal — P1 $5,000–$15,000
- Statistics: **466 rewarded vulnerabilities · avg payout $1,233.33 · validation within 11 days**
- RoE: automated scanning/tools prohibited ("no automated tools or scanners", "no burp scans"); production testing; theoretical issues out of scope
- Program running since 2016-11-16 (466 rewarded → mature, duplicate-heavy)

### 2) Auth0 by Okta — `auth0-okta` (scopeRank 4, Priority Triage)
- **25 in-scope targets** across 3 groups (12 out-of-scope)
- Category breakdown: **website 12 · api 2 · android 1 · ios 1 · other 9**
- API targets: `https://api.us1.fga.dev/`, `https://customers.us1.fga.dev/` (Okta Fine-Grained Authorization)
- Web targets: dedicated researcher environment `*.cic-bug-bounty.auth0app.com` (wildcard; `config.`, `manage.` subdomains + 3 sets of tenant credentials), `marketplace.auth0.com`, `dashboard.fga.dev`, `play.fga.dev`, plus Tier-2 brand sites (`auth0.com`, `auth0.net`, `jwt.io`, `openidconnect.net`, `samltool.io`, `webauthn.me`)
- SDK targets (9): Auth0.Net, auth0-java, nextjs-auth0, auth0-php, react-native-auth0, Auth0.js, auth0-spa-js, Lock, MFA integrations; mobile: Auth0 Guardian (Android/iOS)
- Focus areas: OAuth 2.0 / OpenID Connect / SAML, auth bypass, PII exfiltration, cross-tenant privilege escalation
- Bonus window published in brief (P1 3x, P2 2x, P3 1.5x) ran 2026-04-09 → 2026-05-09 (already ended at fetch date)
- Statistics: **99 rewarded vulnerabilities · avg payout $762.50 · validation within 10 days**
- RoE: automated scanning = immediate ban (Burp Intruder capped at 5 req/s); submissions on `auth0.auth0.com`/`manage.auth0.com` auto-out-of-scope; **low-effort/AI-generated reports rejected**; disclosed reports disabled

### 3) Aiven Managed Bug Bounty — `aiven-mbb-og` (scopeRank 3, Priority Triage) ⭐
- **15 in-scope targets** across 6 groups (14 out-of-scope)
- Category breakdown: **website 3 · api 1 · other 11**
- API target: `api.aiven.io` (documented public REST API at `api.aiven.io/doc`) — provisioning/management API for the whole platform
- Web targets: `aiven.io`, `console.aiven.io`, `regatta.aiven.io`
- Managed database services (other): Aiven for Kafka, ClickHouse, Metrics, Valkey (Tier 1); Grafana, MySQL, OpenSearch, PostgreSQL (Tier 2) — **researchers can provision their own in-scope instances on free tier/trial credits**
- Plus: GitHub orgs (`github.com/Aiven`, `github.com/Aiven-Open`) and a dedicated CTF challenge (`falcon-bug-bounty-flag-pgsql-dev-sandbox.aivencloud.com`)
- Payout: engagement summary min **$50** / max **$25,000** (no per-severity table published in fetched scope JSON — noted, not fabricated)
- Statistics: **146 rewarded vulnerabilities · avg payout $3,902.05 · validation within 5 days**
- Program explicitly recommends managed database apps ("most issues reported with our managed database applications are unique") vs website targets ("frequently reported... high number of duplicates")
- Disclosed reports enabled + coordinated disclosure; 13 announcements; brief last published 2026-07-21
- RoE: scanner output rejected (they run scanners themselves) but scanning not banned; automated *submission* banned (human in the loop); testing only on self-owned accounts/services; PoC must work on Aiven-hosted instances

## RECOMMENDED TARGET: Aiven Managed Bug Bounty — `aiven-mbb-og`

**Why:**

- **Scope quality** — `api.aiven.io` (documented REST API) + `console.aiven.io` + 8 self-provisionable managed database services are all in scope. The program hands researchers **self-owned, in-scope test instances** (free tier + trial credits), which is the ideal safe, high-signal environment for autonomous testing. The program's own guidance steers effort to the managed-DB surface where bugs are "mostly unique" (low duplicate pressure) — exactly what an autonomous agent needs to avoid wasted cycles.
- **Payout** — Realized **average payout $3,902.05 per rewarded bug** (n=146) — 3.2× Okta ($1,233.33) and 5.1× Auth0 ($762.50), the best realized payout economics of any program examined. Max reward $25,000 with P1 focus areas (cross-client data access, full account takeover, orchestration-plane pivots, RCE).
- **Activity** — **146 rewarded vulnerabilities**, **5-day median validation** (fastest of the three; Okta 11 days, Auth0 10 days), disclosed reports + coordinated disclosure (transparent, fast feedback loop for an agent iterating on findings), 13 announcements, brief updated 2026-07-21.
- **Accessibility** — `accessStatus=open`, `isPrivate=false`, `serviceLevel=Priority Triage`, full safe harbor, free trial credits, `@bugcrowdninja` test accounts. Critically, Aiven **tolerates tooling** (it only rejects scanner *output* and requires a human for *submission*), whereas Okta and Auth0 both impose instant-ban policies on automated scanning — the single most important factor for an autonomous researcher. (Auth0 additionally rejects AI-generated reports; the mission's recon-only posture is fully compliant with Aiven's rules.)

**First moves for an autonomous researcher (once authorized):**

1. Register with a `@bugcrowdninja.com` email; create a free-trial account on `console.aiven.io`.
2. Pull the OpenAPI spec from `api.aiven.io/doc`; enumerate project/service/user/integration CRUD endpoints — the primary cross-account/IDOR hunting ground.
3. Provision one instance each of PostgreSQL and Kafka (deepest feature sets) and test API→data-plane boundaries against resources you own.
4. Create a second self-owned account and test cross-account access paths between your own accounts (per RoE), credential/`avnadmin` exposure, and orchestration-plane pivots.
5. Do not submit scanner output; ensure any PoC works on Aiven-hosted instances (upstream CVEs against managed versions are typically out of scope); keep a human in the loop for final submission.

**Alternative if the goal shifts:** Okta (`okta`) if you want the highest published ceiling ($75,000 P1) and can operate without any automated tooling; Auth0 by Okta (`auth0-okta`) if you want the purest auth-protocol API surface (OAuth/OIDC/SAML, Management API, FGA) and accept the scanning ban and AI-report rejection policy.

**Safety note:** This is recon and targeting only. No requests beyond public program metadata were made to Aiven, Okta, or Auth0 assets, and no testing was performed. Actual testing requires an authorized researcher account on the program and strict compliance with each program's Rules of Engagement (especially the automation bans on Okta/Auth0 and Aiven's human-in-the-loop submission rule).
