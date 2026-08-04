# Bug Bounty Target Shortlist

Source: `https://bugcrowd.com/engagements.json?category=bug_bounty&sort_by=rewards&sort_direction=desc` pages 1-3 (fetched 2026-08-04, 72 programs total).
Evidence files: `engagements_p1.json`, `engagements_p2.json`, `engagements_p3.json`, `engagements_all.csv`.

## Shortlist Criteria (applied in order)
1. `accessStatus == open`
2. `isPrivate == false`
3. `serviceLevel` in (Priority Triage, P1 24/7) — fast validation, best for autonomous research
4. `scopeRank` 3-4 — larger, meaningful attack surface
5. Web/API-oriented industry: finance, technology, computer software, cloud
6. Decent maxReward

## Top 5 Candidates (preferred criteria)

| # | Program | Slug | Max Reward | Scope Rank | Service Level | Industry | Rationale |
|---|---------|------|-----------:|:----------:|:-------------:|----------|-----------|
| 1 | Okta | `okta` | $75,000 | 4 | Priority Triage | Cloud | Highest payout of any open, public, Priority-Triage program in the universe; rank-4 scope = large identity platform (SSO/API-heavy surface). |
| 2 | Auth0 by Okta | `auth0-okta` | $50,000 | 4 | Priority Triage | Cloud | Identity/authentication API platform — classic web+API bounty surface; rank-4 scope; sibling of Okta (same bounty program family). |
| 3 | Aiven Managed Bug Bounty | `aiven-mbb-og` | $25,000 | 3 | Priority Triage | Computer Software | Cloud data infrastructure (managed Kafka/Postgres/OpenSearch) — rich API + control-plane attack surface; $25k max for a rank-3. |
| 4 | eToro Managed Bug Bounty Engagement | `etoro-mbb-og` | $15,000 | 3 | Priority Triage | Finance | Fintech trading platform — money-movement APIs, auth flows; finance industry is strongly web/API oriented. |
| 5 | OpenAI | `openai` | $6,500 | 3 | Priority Triage | Technology | LLM/API platform with huge API + web surface; lower max but high attacker-relevant surface and famous program. |

**Runner-up (did not make top 5):** Cisco Networking (`cisconetworking`) — $10,000, scopeRank 4, Priority Triage, but industry is Electronics (hardware-heavy, less pure web/API surface) so it loses the industry tie-break to OpenAI.

## Top-3 Highest MaxReward Programs (regardless of competitiveness)

| # | Program | Slug | Max Reward | Scope Rank | Access | Service Level | Industry | Why not primary pick |
|---|---------|------|-----------:|:----------:|:------:|:-------------:|----------|---------------------|
| 1 | OpenSea Managed Bug Bounty Program | `opensea` | $3,000,000 | 4 | open | Platform | Computer Software | Absurd top-end bounty but `serviceLevel=Platform` (no P1/priority triage guarantee); NFT marketplace, huge volume of researchers, notoriously competitive; high-variance payout. |
| 2 | Fireblocks MPC Managed Bug Bounty Engagement | `fireblocks-mbb-og2` | $150,000 | 1 | open | Platform | Computer Software | Scope rank 1 (very small/targeted scope) and `Platform` service level; MPC cryptography is a deep specialty. |
| 3 | T-Mobile | `t-mobile` | $133,700 | 4 | open | Platform | Utilities | Carrier — telecom infra, SIM/network surface not web/API friendly; pays in Points (per summary) and Platform service level. |

## Decision rule
Among the shortlist, the top-3 (Okta, Auth0, Aiven) go to full scope analysis (STEP 3). The single pick will be decided by enumerated in-scope targets, payout, statistics activity, and accessibility.
