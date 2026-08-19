---
last_verified: 2026-08-18
source: compound loop
confidence: high
owner: context steward (rotating)
---

# Learnings (compound log)

<!-- Newest first. Entry format below. When a learning hardens into a permanent rule,
     move it to rules/ or CONVENTIONS.md and replace the body with a link.
     Prune quarterly: anything not referenced in 6 months gets archived. -->

## 2026-08-18 — Splitting a code fix and its context/spec correction into two PRs (rule 7) can leave `main` asserting a fix that hasn't landed yet

- **Symptom:** PR #37 (docs-only: `CONCERNS.md`/`LEARNINGS.md` corrections for `encode-dynamic-route-ids`) was cut from `main` and independently mergeable, with no dependency on PR #34 (the actual `encodeURIComponent` code fix, still open at the time). Ring 2 review on #37 flagged it `[blocker]`: if #37 merged first, `main`'s own `CONCERNS.md` would declare the four sites "(resolved — all four sites)" / "fixed 2026-08-18" while the shipped code still had every unencoded interpolation — exactly the context-contradicts-code state `AGENTS.md` rule 8 says must never happen. Fixed by the author adding an explicit "do not merge before #34" note to the PR description and merging #34 first.
- **Root cause:** rule 7 (context/spec updates go through their own PR, never bundled with the feature commit) correctly stops a docs correction from riding along with code — but splitting them creates two independently-mergeable PRs with no enforced ordering between them. Nothing about rule 7's guidance addresses the case where the docs PR describes a fix in the past tense before that fix has actually merged.
- **Rule adopted:** When a rule-7 split produces a context/spec-correction PR that describes another, still-open PR's fix as already done, state the hard merge-order dependency explicitly in the docs PR's own description (e.g. "do not merge before #N") — don't rely on merge order happening to work out, since GitHub enforces no ordering between two independently-mergeable PRs.
- **Origin:** PR #37 Ring 2 review (`[blocker]`), self-fixed same PR via an explicit dependency note in the description.

## 2026-08-18 — A fix at one call site of a shared bug/duplication class doesn't get checked against sibling call sites unless a reviewer happens to catch it

- **Symptom:** Two independent instances this range:
  1. PR #26: `slackClient.ts`'s new `callWithQueryParams` re-duplicated the `ok:false` response-envelope check that task 1.16 had already centralized once in `SlackClient.call()`, specifically to avoid this duplication. Caught by Ring 2 review and fixed in the same PR (`5b3bcbe`, extracted a shared `parseSlackResponse()`).
  2. PR #29: `encodeURIComponent(id)` was correctly applied to `certificates/verify/page.tsx` (issue #21) and the new `governance/[id]/page.tsx`, but `institutions/[id]/page.tsx` and `certificates/[id]/page.tsx` build the identical unencoded backend-fetch-path pattern (`` `/institutions/${id}` ``, `` `/certificates/${id}` ``) and were left untouched. Two separate Ring 2 review passes on the same PR both flagged this independently; neither was fixed before merge — confirmed still present as of the 2026-08-18 gardener run that first logged this. **Fixed 2026-08-18** (`encode-dynamic-route-ids`) — and that fix's own review corrected this instance's severity: these are dynamic route *segments*, not the query-param path #21 fixed, and issue #21's own report had already confirmed Next.js doesn't decode `%2F` in route segments — so this specific sibling site was never actually the same exploitable leak, just a reasonable consistency gap. The underlying pattern below (sibling sites don't get swept) still holds regardless.
  3. **Same PR (`encode-dynamic-route-ids`), same day — this fix itself fell into the exact trap it was written to correct.** Its own commit restated this entry's "grep for sibling sites" rule, but the grep stopped at the two page components named in the PR body and didn't extend to `actions/certificates.ts`'s `revokeCertificateAction`/`actions/institutions.ts`'s `castVoteAction` — which read `certificateId`/`proposalId` raw off `FormData` and interpolate them into a backend path with **no** router in between at all. Caught by a second Ring 2 pass on the same PR, not self-caught. These are actually more exploitable than the page-component sites this PR fixed first, since Next's route matcher (the reason the page-component sites turned out not to be exploitable) doesn't apply to Server Action form values at all.
- **Root cause:** `general.md` rule 11 already requires sweeping `context/`/`AGENTS.md` for restatements of a corrected *documentation* claim, but there's no equivalent discipline for application code — fixing or de-duplicating one call site doesn't prompt a grep for structurally identical sibling call sites, so the same defect/duplication class survives at every site the original report or task didn't happen to name. Instance 3 shows the sweep itself needs a wide enough net: grepping for the literal diff pattern named in a bug report (page components reading a route param) missed a structurally-identical but syntactically-different site (server actions reading a form field) that shares the actual root cause (unencoded ID in a backend path) but not the exact code shape someone might grep for.
- **Rule adopted:** When fixing a bug or removing duplication at one call site, grep the codebase for other call sites with the same *underlying* pattern (not just the same literal syntax) before considering the fix done — not just the one site the issue/task named. For "unencoded ID in a backend path" specifically: check every `backendFetch`/`fetch` call across `app/**/page.tsx` *and* `actions/*.ts`, not just the file type the original report happened to name. If a sibling site is found but genuinely out of scope for the current change, log it in `CONCERNS.md`'s Known debt table rather than leaving it silently unswept.
- **Origin:** PR #26 Ring 2 review (should-fix, self-fixed same PR); PR #29 Ring 2 review, two independent passes (should-fix, unresolved — tracked in `context/codebase/CONCERNS.md`); PR `encode-dynamic-route-ids` Ring 2 review, second pass (should-fix, self-fixed same PR).

## 2026-08-13 — Spec/context edits keep landing bundled with the feature commit that motivated them, despite rules 5/7 already existing

- **Symptom:** PR #18's first commit (`5177ce7`) bundled three unrelated
  things together: a `confidence: low → high` bump to two `openspec/specs/`
  files, a brand-new frontend capability (the institution detail page)
  shipped with no change-id at all, and (in a second commit) an unrelated
  `DOMAIN.md` formatting fix. Ring 2 review flagged this as a `[blocker]`
  for violating `general.md` rules 5 ("no code without a change-id") and 7
  ("context and spec updates go through PRs — never edit `context/` or
  `openspec/specs/` as a side effect of a feature commit"). This is the
  second time this exact rule pair has been violated: the first was
  `certificate-lifecycle/spec.md` landing via a direct push straight to
  `main` rather than its own PR (`docs/BUILD_LOG.md`'s Stage D5 entry),
  corrected the next time around by routing `institution-directory/spec.md`
  through its own PR (#12) instead.
- **Root cause:** rules 5/7 are enforced only by Ring 2's after-the-fact
  review, not by anything that runs before a commit is made. At authoring
  time, a spec/context touch motivated by the feature work in front of you
  feels like part of the same task, so it lands in the same commit unless
  the author deliberately stops to split it first.
- **Rule adopted:** before opening a PR, check whether any single commit
  touches both `openspec/specs/`/`context/` and application code; if so,
  split it before pushing rather than relying on Ring 2 to catch it after
  the fact. If it's already been pushed and splitting would require a
  force-push, don't rewrite shared history — fix it with a retroactive,
  explicitly-labeled change-id (`skip_specs: true` if the underlying
  requirement itself didn't change) plus a plain `docs/BUILD_LOG.md` note
  describing what happened, matching the precedent this PR itself set.
- **Origin:** PR #18 Ring 2 review (`[blocker]`), self-fixed the same day
  via `df3097d`; first occurrence documented in `docs/BUILD_LOG.md`'s
  Stage D5 follow-up entry (`certificate-lifecycle/spec.md` direct push,
  corrected via PR #12's `institution-directory` stub).

## 2026-08-13 — Fixing one stale context claim leaves its siblings stale unless the fix greps for the claim, not just the file that prompted it `[graduated → rules/general.md#process, rule 11]`

- **Symptom:** PR #15's Ring 2 review caught `TESTING.md`'s "ESLint is
  configured for backend" claim as stale and fixed it in place — but left
  two other claims falsified by that same PR's own diff standing in the
  same file ("zero test files"/"jest never wired up") plus a mirrored note
  in `AGENTS.md`. A second PR (#16) was needed to sweep all of them. This
  gardener run then independently found a *third* instance of the identical
  pattern: `TESTING.md`'s Ring 3 QA goals section still headed the
  Certificate lifecycle QA goals with "no openspec/specs/ capability exists
  for this yet," even though a real spec landed at
  `openspec/specs/certificate-lifecycle/spec.md` in the very same commit
  range — PR #16's sweep was scoped to the ESLint-area claims it was
  written to fix, not to every claim of the same shape.
- **Root cause:** A correction is scoped to the one claim/file a reviewer
  or commit happened to notice, not to the underlying fact that changed.
  When a single code change (e.g. "a spec now exists," "a test file now
  exists") falsifies a claim, that claim is usually restated in more than
  one context file, and a fix that only touches the file the diff already
  touched will miss the others.
- **Rule adopted:** When correcting a stale/false claim in `context/` (or
  `AGENTS.md`), grep the rest of `context/` and `AGENTS.md` for restatements
  of the same underlying fact before considering the correction done — fix
  every instance in one pass, not the one instance a diff happened to
  surface.
- **Origin:** Ring 2 review on PR #15 (should-fix), fully swept in PR #16
  (`bee88fc`); third recurrence found and fixed by context-gardener,
  2026-08-13 (`context/codebase/TESTING.md`'s Certificate lifecycle QA goals
  header); graduated to `context/rules/general.md` rule 11 in PR #17 after
  that third recurrence.

## 2026-08-12 — Correcting an already-archived change's docs needs a visible strikethrough + dated note, never a silent rewrite

- **Symptom:** `openspec/changes/archive/2026-08-12-test-api-key-guard-read-only/tasks.md` claimed PR #15 had corrected `TESTING.md`'s inaccurate ESLint claim. PR #16's Ring 2 review found that claim itself wasn't true when the change was archived — the edit had actually been reverted from PR #15 (per rule 7) and only landed later, in PR #16. The archived record needed fixing, but it also documents what actually happened at merge time.
- **Root cause:** An archived change's `proposal.md`/`tasks.md` is a historical record, not a living doc — quietly editing it to match current reality erases the fact that the original claim was wrong when merged, which is exactly the kind of drift a future reader relies on this record to catch.
- **Rule adopted:** When an archived change's proposal/tasks doc turns out to contain an inaccurate claim, correct it with a visible strikethrough plus a dated correction note explaining what was actually true and when the fix landed — never a silent rewrite of the archived text.
- **Origin:** PR #16 (`cd6500c`), validated by that PR's own Ring 2 review as matching established practice in this repo's review history.

## 2026-08-11 — Single-org-endorsed `peer chaincode invoke` reports success but never commits `[graduated → rules/general.md#process, rule 9]`

- **Symptom:** During the staging wipe/redeploy, `RegisterInstitution` invokes
  reported `Chaincode invoke successful` with a real, correctly-shaped payload.
  A follow-up `GetAllInstitutions` read immediately after showed the ledger
  empty — the write had never actually happened.
- **Root cause:** The channel's `Application` group endorsement policy is
  `MAJORITY Endorsement` (a majority of orgs, each `OR('OrgMSP.peer')`,
  from `generated/configtx.yaml`). The invoke had only one org's
  `--peerAddresses`/`--tlsRootCertFiles` pair. A single-org-endorsed
  transaction passes *simulation* cleanly (real payload, real "successful"
  message) but fails *validation* at commit, silently — the peer CLI has no
  way to report this back to the caller, since from its point of view the
  simulation genuinely succeeded.
- **Rule adopted:** Every mutating `peer chaincode invoke` against this
  channel must include enough orgs' `--peerAddresses`/`--tlsRootCertFiles`
  pairs to satisfy majority endorsement, and every mutating invoke must be
  followed by an independent read-back (e.g. `GetAllInstitutions`) before
  being trusted — never the CLI's own success message alone.
- **Origin:** `docs/BUILD_LOG.md` Phase 16 / `docs/ERROR_LOG.md`, 2026-08-11
  (staging wipe and fresh redeploy).
