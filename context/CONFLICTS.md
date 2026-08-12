# Conflicts

Claims extracted from archived legacy documentation (`doc-archaeology` pass,
2026-07-30) that were checked directly against the current source code and
found to be **contradicted** by it. These are candidates for the human
arbitration workshop — either the doc is stale and should be marked
historical, or something in the code needs a second look. Not an exhaustive
list of every discrepancy in the project; only claims actually cross-checked
during this pass.

| Claim | Source doc | What the code shows | Needs decision by |
|---|---|---|---|
| "No login/API keys yet on the backend API — a deliberate, temporary scope decision... with a hard requirement to add authentication before this ever runs anywhere network-reachable." / "Auth: none at the HTTP layer yet." | `PPT_PROMPT.md` (Slide 10, Slide 12); `TEAM_DEMO_PREP.md` (§4 talking points, citing "ARCHITECTURE.md Key Decisions #10"); `V1_PHASE_OVERVIEW.md` ("Auth" bullet under Backend architecture, and "Explicitly out of scope for v1.0") | `backend/src/common/guards/api-key.guard.ts` (`ApiKeyGuard`) is applied globally in `backend/src/main.ts` (`app.useGlobalGuards(app.get(ApiKeyGuard))`), requiring `Authorization: Bearer <API_KEY>` on every route with no `@Public()`-style opt-out. This was added in commit `ec00266` ("feat: add backend API-key auth and sign frontend session cookie", 2026-07-28) — 4 days after all three source docs were written (2026-07-24). The "hard prerequisite" these docs call for has already been implemented. | Tech lead — confirm these docs are archived as historical/pre-auth snapshots; flag if any live slide deck or talking-point sheet derived from them still gets reused as-is in a future demo. |
| "InstitutionB" starts at `status: pending` and is "a third institution applying and being voted in live" — not yet a full consortium member. | `V1_PHASE_OVERVIEW.md` ("InstitutionB (`InstitutionBMSP`, starts `pending`, peers on `11051`/`11061` once onboarded)"); `PPT_PROMPT.md` (Slide 2, Slide 9 — onboarding described as the live demo centerpiece); `TEAM_DEMO_PREP.md` (entire live-onboarding demo script, §0 step 4 through §3.5) | `network/config/network.yaml` currently lists `InstitutionB` with `status: member`. Commit `abb1e3d` ("feat: onboard InstitutionB as a full consortium member", 2026-07-28) flipped this, with its own message stating InstitutionB "completed the propose/vote/org-add.sh onboarding ceremony live during the 2026-07-24 team demo and is now a real, active consortium member." | Tech lead / demo-materials owner — these docs describe a since-completed, one-time live event. Either mark them explicitly "historical — event completed 2026-07-24" or remove from any active runbook rotation, since re-running `TEAM_DEMO_PREP.md`'s §0 setup against the current network would attempt to re-propose an institution that is already a full member. |
| "Governance/voting via the API" is explicitly listed as out of scope for v1.0 — `ProposeNewMember`/`CastVote`/`GetProposal`/`RegisterInstitution` are described as "terminal-only... not yet a pure API-triggerable action." | `V1_PHASE_OVERVIEW.md`, "Explicitly out of scope for v1.0 (not oversights)" section | `openspec/specs/institution-governance-ui/spec.md` and `frontend/src/app/(dashboard)/governance/` implement exactly this via the backend's `/institutions/proposals*` and `/institutions/proposals/:id/vote` routes (`backend/src/institutions/institutions.controller.ts`) — shipped as the `governance-vote-status` change, archived 2026-08-11 (GitHub issue #8). | Tech lead / product owner — same root cause as the other two rows (a dated snapshot, not a wrong claim when written), but found later than the original pass: this row was added 2026-08-12 while drafting `context/product/PRODUCT.md`, not during the 2026-07-30 `doc-archaeology` run — that pass predates this feature shipping by twelve days, so it couldn't have caught this one. Confirms the same staleness pattern documented in `docs/AI_SDLC_DOC_ARCHAEOLOGY_EVALUATION_REPORT.md` Section 3.4, this time in a claim that was never merged into a `context/codebase/*.md` file at all. |

## Note on verification rigor

Both rows above were found through direct, sample-by-sample cross-checking
(git blame/log dates, direct file reads of `main.ts`/`api-key.guard.ts`, and
`network/config/network.yaml`'s current content plus its commit history) —
not inferred from the `context/codebase/*.md` map. The remaining ~30 claims
extracted from these three documents (network topology, chaincode function
signatures/counts, endorsement policy, NodeOUs, crypto disk layout, backend
endpoint list, error-mapping table, retry/CC_SEQUENCE mechanics, etc.) were
each individually checked against the real source and confirmed accurate —
see the calling agent's report for the full list with file/line evidence.
Both conflicts found here share the same root cause: these are **dated,
point-in-time snapshots** (a demo-prep runbook and a phase-overview compiled
just before a specific live demo) describing state that was accurate on
2026-07-24 and has since moved forward by design — not documentation that
was wrong when written.
