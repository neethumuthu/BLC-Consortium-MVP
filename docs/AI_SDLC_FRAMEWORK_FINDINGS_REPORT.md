last_verified: 2026-08-13
source: real git/GitHub history + docs/BUILD_LOG.md + docs/ERROR_LOG.md, re-checked against live repo state while writing this report

# AI SDLC Framework — Findings Report (BLC-31)

## 1. Executive Summary

Dominik asked for the Espeo AI SDLC Framework to be tested against BLC-31 as a real
brownfield project. What started as a scoped Stage B evaluation (map the codebase,
run the doc-archaeology pass, draft one ADR) expanded, once Dominik began directing
real feature work through it, into a full brownfield adoption: 146 commits, 13 pull
requests, 8 CI workflows totaling 259 runs, and real product features (governance
voting UI, credential rotation, an institution directory, an institution detail
page) shipped through the framework's own propose → apply → verify → archive cycle.

The honest bottom line: the framework works, but not for free. Every stage that
completed cleanly did so only because real bugs — in the Starter Kit template, in
this project's own code, and in the review process's own output — got caught and
fixed as they came up, several of them more than once. Two stages (E, and most of
G) genuinely cannot be closed out solo; they need live team time and weeks of
real usage, not more agent work. One upstream contribution (`espeo/ai-sdlc-framework`
PR #1) is still sitting unreviewed. This report documents what was tested, what
broke, what got fixed, and what's still open — evidence-first, not rounded up.

## 2. Scope — What Was Actually Tested

This is one project (BLC-31), one team, evaluated by one person (me) working
solo except where explicitly noted (Dominik's decisions, a Slack thread, a
Google Drive comment thread). It is not a general conclusion about the
framework's fitness for other projects or teams.

The scope expanded in two phases:

- **Phase 1 (Stage B only):** map the codebase (`map-codebase` skill →
  `context/codebase/*.md`), run `doc-archaeology` against three archived
  pre-demo docs, draft one ADR. Output: `docs/AI_SDLC_STAGE_B_EVALUATION_REPORT.md`,
  `docs/AI_SDLC_DOC_ARCHAEOLOGY_EVALUATION_REPORT.md`, `docs/AI_SDLC_STAGE_B_SPOT_CHECK_EVIDENCE.md`,
  `docs/AI_SDLC_CLAUDE_TAGS_EVALUATION.md` (all added in commit `c9803ad`).
- **Phase 2 (full Brownfield Rollout, Stages A–G):** once Dominik started
  routing real product asks (password-change, voting/governance UI,
  certificate licensing) through the framework's own OpenSpec cycle, the
  evaluation became real adoption — every CI workflow wired up and exercised
  against live PRs, a real Azure staging environment stood up specifically to
  give `agentic-qa` something to run against, and Stage D/F/G's
  solo-doable follow-ups closed out.

The Greenfield Rollout tutorial was correctly never attempted — BLC-31 is not a
greenfield project.

## 3. What Each Stage and Agent Actually Is

For each of the 7 Brownfield stages and 8 CI workflows: what it is, why it
exists, what happens when you use it, and — the part that matters most here —
what it actually produced on BLC-31, not just what the tutorial/workflow
comment says it's supposed to produce. The first four columns are grounded in
the tutorial's own text and each workflow's own header comment; the last
column is this project's real, evidenced result.

### The 7 Brownfield Rollout stages

Source: `AI SDLC/Consulting · Tutorial 1 - Brownfield Rollout - Superhuman Docs.pdf`,
read directly.

| Stage | What it is | Why it exists | Usage — what happens when you do it | Result on BLC-31 |
|---|---|---|---|---|
| **A — Prerequisites** | Install Claude Code + OpenSpec for every dev, create Slack channels/webhooks, add repo secrets, install the Claude GitHub app. | Nothing downstream works without access/tooling in place first. | Each dev runs `claude` once; webhooks get a test `curl`. | **Done.** Slack App set up (not legacy webhooks — confirmed deprecated), Claude GitHub app installed. Ended up with **5** secrets provisioned, not the tutorial's 3 — 2 extra (`DISPATCH_TOKEN`, `PROJECTS_TOKEN`) were needed later for workflows the tutorial doesn't define (§5.1). |
| **B — Map the code** | Run `map-codebase`: 4 parallel subagent tasks fill the 7 `context/codebase/*.md` files from source, before touching old docs. | Fast, code-derived baseline that isn't contaminated by stale docs. | Skill writes all 7 files at once (`confidence: medium`); you spot-check 3 claims/file. | **Done.** All 7 files generated (commit `c9803ad`), spot-checked, held up. |
| **C — Document archaeology** | Run `doc-archaeology`: classify every old doc found, distill claims, cross-check each against real code. | Separates still-true from long-stale docs mechanically instead of trusting either by default. | Confirmed claims merge into context files; contradicted ones go to `CONFLICTS.md`; unverifiable-but-decision-relevant ones become draft ADRs. | **Done.** `context/ARCHIVE-INDEX.md` and `context/CONFLICTS.md` created; one ADR drafted (`ADR-0001`, the never-delete-committed-CA-crypto rule), grounded in a real earlier incident — Phase 9, 2026-07-13 (`docs/ERROR_LOG.md`): a targeted cleanup took down a CA server's whole crypto directory, requiring a full network wipe-and-redo to recover. |
| **D — Wire GitHub and Slack** | `openspec init`, enable the CI workflows, create the GitHub Project with `Stage`/`Change-ID`/`AI-assist` fields, turn on branch protection, merge the rollout branch as the first real pipeline test. | This is where the framework stops being files in a repo and starts reacting to real pushes/PRs/schedules. | First merged PR should trigger Ring 2's comment, a Slack message, and a `context-gardener` run. | **As complete as solo work allows.** GitHub Project #2 created with the right fields, all 8 CI workflows enabled and live (§10 Appendix), first PRs did trigger Ring 2 + Slack + gardener as expected. Branch protection is the one piece that **can't** be turned on — GitHub's API returns `403 Upgrade to GitHub Pro or make this repository public` on this private repo. Three real options sent to Dominik; no reply yet. |
| **E — Team standardization workshops** | Two workshops (verify/correct context live as a team; agree on working norms) + one hands-on training run. | Tutorial's own words: *"unverified context gets ignored forever after."* | Team confirms/corrects context files live, writes down the operating loop, every dev runs the loop once. | **Not done.** Never attempted solo — this is the one stage the tutorial itself says needs the whole team in a room, and that hasn't happened yet. |
| **F — Spec reconstruction, scoped** | List 3–6 next-quarter capabilities, run `/opsx:onboard` on each, review the reconstructed spec against reality (tutorial: *"the QA person is the best reviewer"*), stub everything else, define Ring 3 QA goals. | Spec'ing the whole system up front doesn't scale; this narrows to what's about to change. | Reconstructed specs get reviewed by whoever actually knows the behavior; nightly QA starts running against them. | **Partial.** Two capabilities (`certificate-lifecycle`, `institution-directory`) got real specs, reviewed by Neethu against live behavior, bumped to `confidence: high`. Next-quarter list has **1** item, not 3–6 — `PRODUCT.md` only has one informally-scoped item to draw from. `agentic-qa` enabled nightly: found one real, well-scoped bug on its first live run (issue #8) — and also caused a real incident of its own (§5.2). |
| **G — First real sprint** | Pull a real sprint through the full loop, verify the whole chain fires on one real feature, run weekly 30-min operating reviews for a month. | The only stage that proves the loop survives sustained real use, not one clean demo. | Issues get Change-IDs, the board moves automatically, Friday reviews catch drift and feed `LEARNINGS.md`. | **Partial.** `capture-learning` has real entries; one graduated into a permanent rule (`general.md` rule 11) after recurring 3 times. But the Project board still has **zero items** on it (`totalCount: 0`, live-checked) despite real work happening — no issue has ever carried a `Change-ID`. No Friday reviews have started. |

### The CI workflows

The starter kit ships **6** workflows by default (confirmed against
`AI SDLC/starter-kit/.github/workflows/`); BLC-31 runs **8** — the original 6
plus 2 built specifically to solve real problems found during this rollout
(§5.1). "What it is" quotes each workflow's own header comment.

| Workflow | What it is (its own words) | Why it exists | Usage — what happens when it fires | Result on BLC-31 |
|---|---|---|---|---|
| `ai-pr-review.yml` | *"Ring 2 — agentic PR review + interactive `@claude`."* | Every PR gets an automated first-pass review before a human looks at it. | Reads the diff + context files, posts findings via `gh pr comment`. | **64 runs** (32 success, 29 skipped, 3 failure). Initially posted **nothing** — a real silent-no-op bug, fixed in commit `3913177`. Since the fix: caught a real credential mistake on PR #13, and drove PR #17's 5-round review saga and PR #18's process-violation catch (§5.2) — the single most productive piece of automation in this evaluation. |
| `context-gardener.yml` | *"Compound step automation — proposes context updates after every merge to main."* | Keeps `context/` current without anyone remembering to update it by hand. | Diffs since its last successful run, opens a PR proposing context updates. | **15 runs** (8 success, 7 failure — a permission-denial bug, fixed in commit `45857b2`). Opened real, useful PRs (#9, #16, #17); one PR (#10) was correctly *not* merged as-is because it duplicated same-day manual work. |
| `context-drift-check.yml` | *"Weekly verification that `context/` still matches the codebase."* | Catches slow drift on a cadence instead of waiting for it to become a bug. | Re-samples context claims weekly, files drift issues. | **9 runs, all success.** Clean weekly cadence held throughout; no drift issues needed filing during this window. |
| `agentic-qa.yml` | *"Ring 3 — goal-driven QA against the preview environment."* | Catches bugs that only show up by actually using the running product. | Logs into a real environment, works through `TESTING.md`'s QA goals, files issues. | **4 runs, all "success"** — but two of them were the real-vote incident (§5.2): it used the wrong account and cast real governance votes while doing QA. Also found one genuinely good bug on its first run (issue #8). Fixed with a `READ_ONLY_API_KEY`/`QA_GUEST` guard; verified live, re-enabled. Net: real value, real damage, both true. |
| `project-sync.yml` | *"Keeps GitHub Projects stages in sync with the operating loop + Slack nudges."* | The board should reflect reality automatically. | Reads the Change-ID out of a push/PR diff, moves the board item's `Stage` field. | **70 runs** (69 success, 1 failure). Mechanically works — but the board it's syncing has **zero real items**, since nothing in this project has ever carried a `Change-ID` yet. Works correctly on data that doesn't exist yet. |
| `requirements-nudge.yml` | *"Nudges the PM on Slack when a change carries unresolved product questions."* | Product ambiguity should surface immediately, not sit silently blocking a change. | Posts/reuses a Slack nudge linked to a GitHub issue when a proposal's Open Questions section is non-empty. | **54 runs, all success.** Used for real: surfaced the password-change decision and the still-unresolved Slack→GitHub scope question (§6). |
| `proposal-answer-sync.yml` *(BLC-31 addition)* | Resolves a proposal's Open Questions when the PM replies `@claude <answer>`; opens a PR; never touches implementation. | Closes the loop `requirements-nudge` opens. | On an `@claude <answer>` comment, resolves the section, opens a PR. | **33 runs** (3 success, 30 skipped — skips are expected/correct on non-matching events). All 3 real runs worked cleanly. |
| `scheduler-dispatch.yml` *(BLC-31 addition)* | *"Fires a shared `repository_dispatch` event once daily."* | `claude-code-action@v1` doesn't support `push`/`schedule` triggers at all — this plain workflow is the one place that needs a real `schedule`. | Fires daily, both Claude-driven workflows listen for the dispatch. | **10 runs** (8 success, 2 failure). Built mid-rollout specifically because `context-gardener`'s push trigger failed live with `Unsupported event type: push` — since then, both downstream workflows fire reliably through it. |

## 4. The Brownfield Rollout, Stage by Stage

| Stage | Status | Note |
|---|---|---|
| A — Prerequisites | Done | Repo access, Slack App (not legacy Incoming Webhooks — confirmed deprecated per Slack's own docs), Claude GitHub app installed, all 5 secrets provisioned. |
| B — Map the code | Done | `map-codebase` run for real (see §10 Appendix for exact outputs). |
| C — Document archaeology | Done | `doc-archaeology` and `draft-adr` both run for real — `ARCHIVE-INDEX.md`, `CONFLICTS.md`, `ADR-0001` (see §10 Appendix). |
| D — Wire GitHub and Slack | As complete as solo work allows | GitHub Project v2 board (#2) built with `Stage`/`Change-ID`/`AI-assist` fields; all 8 CI workflows live and running (see §10 Appendix for run counts). Branch protection is the one remaining piece, and it is not fixable by more work — GitHub's REST API returns `403 Upgrade to GitHub Pro or make this repository public` on this private repo (confirmed live, `docs/BUILD_LOG.md` Phase 17, re-confirmed again in this same session on 2026-08-13). Three real options exist (upgrade to GitHub Team/Pro, make the repo public, move it under Espeo's org) and have been sent to Dominik; no response confirmed as of this writing. |
| E — Team standardization workshops | Not done, cannot be done solo | Requires live workshops with the team (PM/PO input for `context/product/`, a context steward role, Stage E-produced roadmap). Nothing here is a solo-agent task. |
| F — Spec reconstruction, scoped | Partial | Real, substantive coverage exists for both live capabilities (`certificate-lifecycle`, `institution-directory` — both hand-verified against live backend/UI behavior on 2026-08-13 by Neethu, both bumped `confidence: low → high`). The tutorial's own instruction to "list 3-6 capabilities the team will touch next quarter" has exactly **one** item to draw from (`certificate-licensing`, v1.01) — `context/product/PRODUCT.md`'s own "Current focus" section is explicit that this is informal planning-note input, not a PM/PO-confirmed backlog. |
| G — First real sprint | Partial | `capture-learning` has real entries now (`context/learnings/LEARNINGS.md`, one graduated to a permanent rule — see §5). Sustained real-world usage — the `Change-ID:` convention actually used on real issues, the GitHub Project board actually populated, Friday operating reviews happening on a cadence — hasn't happened yet. The Project board (#2) is correctly field-configured and correctly wired into `project-sync.yml`, but has **zero items on it** (`gh project item-list 2 --owner neethumuthu` → `totalCount: 0`, confirmed `docs/BUILD_LOG.md` Phase 17) despite real work — issue #8, PRs #4/#9/#10/#11/#12 and beyond — having happened in that window. This needs weeks of real usage, not more agent work, to demonstrate. |

The Greenfield Rollout tutorial: correctly not attempted (see §2).

## 5. Real Bugs Found

### 5.1 In the Starter Kit template itself

These are bugs in `espeo/ai-sdlc-framework` (the Starter Kit), separate from
BLC-31's own codebase — relevant to whoever maintains that repo.

- **`project-sync.sh` referenced but missing entirely.** `project-sync.yml`
  calls a script that didn't exist anywhere in the Starter Kit.
- **`actions/checkout@v4` defaulting to `fetch-depth: 1` in `project-sync.yml`
  broke the diff logic project-sync.sh depends on.** The script needs a
  before/after diff on push events to tell "new change folder" apart from
  "modified" apart from "archived" — a depth-1 checkout only has the single
  latest commit, making that diff impossible.
- **`anthropics/claude-code-action@v1` does not support `push` or `schedule`
  as trigger events at all.** Confirmed live: `context-gardener`'s push
  trigger failed with the exact error `Unsupported event type: push`. This
  affected every Claude-driven workflow that needed to react to a merge or
  run on a timer (`context-gardener`, `context-drift-check`,
  `agentic-qa`'s nightly run). Fixed once, centrally, rather than per
  workflow: `scheduler-dispatch.yml` — a plain, non-Claude workflow — fires a
  shared `repository_dispatch(context-maintenance)` event on a real
  `schedule` trigger, and the Claude-driven workflows listen for that
  dispatch instead. Getting `repository_dispatch` itself to fire required two
  more real fixes: the default `GITHUB_TOKEN` can't call that API endpoint at
  all (confirmed live: `403 Resource not accessible by integration`,
  regardless of declared job permissions), and the first replacement
  (reusing the existing `PROJECTS_TOKEN`) also wasn't sufficient — a
  dedicated `DISPATCH_TOKEN` secret was created instead.
- **`AGENTS.md` and `context/rules/general.md` don't exist in the Starter
  Kit**, despite three of its own workflow prompts (`requirements-nudge`,
  `ai-pr-review`, `context-drift-check` — confirmed by grepping every
  workflow file, not assumed) explicitly assuming they exist and reading
  hard rules from them. Added real content (commit `01c4267`), not template
  placeholders.
- **`ai-pr-review.yml` silently did nothing.** The agent completed a full,
  correct review both times it ran, but never called `gh pr comment` or
  `gh pr review` — its own built-in inline-comment mechanism reported
  nothing buffered either. It needed an explicit tool-call instruction, not
  review text left implied in the final response. Fixed by making
  "execute `gh pr comment` as your last action" a mandatory prompt
  instruction (commit `3913177`).
- **The `/opsx:onboard` investigation — told as the full arc, because the
  arc is the point.** Early in the evaluation, `/opsx:onboard` and
  `openspec-onboard`'s skill file appeared to be genuinely missing from a
  fresh OpenSpec install (`openspec config profile <name>` only accepts a
  named preset — `core` was the only one that actually worked, and no
  "expanded" preset existed). That absence was treated as a confirmed gap
  and drove a real design decision: building `spec-onboard-replacement`, a
  bulk coverage-sweep skill, as a substitute for the missing tool. Before
  filing an upstream issue about it, a check of `Fission-AI/OpenSpec`'s own
  issue tracker found **issue #1001** ("Can't find onboard command after
  init") — closed 9 days earlier by a maintainer with a working
  reproduction. The real gap wasn't a missing feature, it was an
  undocumented activation path: `openspec config set profile custom` +
  `openspec config set workflows '[...]'` + `openspec update` (a `custom`
  profile with an explicit workflow array, not a named preset). Reproduced
  directly — `.claude/commands/opsx/onboard.md` and
  `.claude/skills/openspec-onboard/SKILL.md` now exist in this project, and
  no upstream issue was filed, because there was nothing real left to
  report. Reading the actual skill afterward showed it's a single-task
  guided tutorial (roughly 15–20 minutes), not the bulk capability scanner
  the earlier assumption had pictured — a materially different tool than
  what was assumed missing. This meant `spec-onboard-replacement` remained
  genuinely justified, just for a different reason than originally
  thought: it's a complementary tool for a different job (unattended, exhaustive
  coverage sweeps), not a substitute for something that turned out not to be
  missing. Every earlier "confirmed absent" claim across the adoption-plan
  doc, the build log, and both spec stubs was corrected rather than left
  standing.

### 5.2 In BLC-31 itself, found because of using the framework

- **The `agentic-qa` real-vote incident — the strongest, most concrete story
  in this whole evaluation.**
  **Discovery:** two runs (2026-08-10, one nightly, one manual;
  2026-08-11, discovered the next day via a routine "is that QA
  institution actually cleaned up" check, not caught proactively) each
  logged into the real `BLCFounder` account — whose cosmetic-login
  credentials are readable straight out of
  `frontend/src/lib/institutions.ts` — and, while literally executing
  `TESTING.md`'s own "Ring 3 QA goals," completed a real `ProposeNewMember`
  plus enough real `CastVote`s to reach quorum. Result: two permanent,
  fully `"active"` institutions on the shared staging ledger
  (`InstitutionQAMSP` and a second one from the 2026-08-11 run), and a
  changed real majority-vote threshold for the whole consortium
  (`requiredVotesToApprove` counts active institutions at proposal-creation
  time — it went from `3/2+1=2` to `5/2+1=3`).
  **Root cause:** `Institution.Status == "active"` is the single
  authorization gate for `ProposeNewMember`/`CastVote`/`IssueCertificate`
  across both chaincodes, and flipping it requires no real Fabric identity
  for the candidate — only enough real, already-active callers voting.
  `agentic-qa.yml`'s prompt told the agent to "execute" the QA goals, which
  literally include propose/vote scenarios; nothing constrained which
  account it logged in with.
  **Fix:** the nightly schedule was disabled immediately
  (`workflow_dispatch` only) while the fix landed. Added an optional
  `READ_ONLY_API_KEY` to `ApiKeyGuard` — authenticated but GET-only, every
  mutating route rejects it with 403 before the request ever reaches the
  chaincode — and a matching `QA_GUEST` account. `TESTING.md`'s Ring 3
  goals were reframed: for this account, a 403 on a write action is the
  correct, expected result, not a defect.
  **Verification:** confirmed live two separate ways before re-enabling the
  schedule — a direct `curl` against the staging backend with
  `READ_ONLY_API_KEY` (`403`, exact message: `"This is a read-only credential - it cannot perform write actions"`), and a full browser
  walkthrough logging in as `QA_GUEST` and submitting a real proposal
  through the actual UI (same 403 surfaced inline, session left intact, no
  proposal created). Both mattered: the first proves the guard itself
  works regardless of what's in front of it; the second proves the real
  user-facing path actually hits that guard and fails gracefully.
  **Re-enable:** the nightly schedule went back on only after both
  verifications passed. As for the two fake institutions themselves: a
  check confirmed `institution-cc` has no function to deactivate, suspend,
  or remove an already-active institution, so they were deliberately left
  as permanent fixtures on staging rather than building a new
  deactivate-function just to clean them up — staging exists to be
  exercised, and the quorum threshold of 3 (not 2) is now just a
  permanent fact of staging's current state, not a bug to chase.
- **The same credential mistake happened a second time, days later — and
  this time Ring 2 review caught it before it went anywhere.** While
  building live verification for a different, unrelated capability
  (`governance-proposal-lookup`, PR #13), the first pass used
  `BLCFounder`'s real API key for a read-only `curl` check against
  staging. Ring 2 review on that PR flagged it as a `[blocker]`: the
  purpose-built `READ_ONLY_API_KEY` already existed for exactly this kind
  of exploratory verification, built specifically because of the incident
  above. No write actually happened either way — the endpoint being tested
  (`GetProposal`) is GET-only — but the credential *choice* itself was the
  violation (`AGENTS.md` rule 4 / `context/rules/general.md` rule 3), not
  the outcome. Redone with `READ_ONLY_API_KEY`: identical results. This is
  live proof the safety mechanism built after the first incident actually
  works on a second, independent occasion — not just a bug that got fixed
  once, but a guardrail that caught a repeat mistake before it became a
  repeat incident.
- **The institution-detail-page gap, found by Stage F's human-review pass,
  not by any automated check.** Manually verifying the `institution-directory`
  spec against live behavior surfaced that `GET /institutions/:id` had
  zero UI path at all — no `[id]` route existed under `institutions/`, only
  the list page. Built `frontend/src/app/(dashboard)/institutions/[id]/page.tsx`
  (mirroring the existing certificate detail page) and linked the list
  page's rows to it.
- **A real process violation, caught by Ring 2 review on PR #18, not
  self-caught.** The commit that added the institution detail page
  (`5177ce7`) bundled three distinct things into one commit: a spec
  confidence-bump (`certificate-lifecycle`/`institution-directory`,
  `low → high`), a brand-new UI capability with zero change-id backing
  it, and (in a second commit) an unrelated doc-formatting fix — violating
  `context/rules/general.md` rules 5 ("no code without a change-id") and 7
  ("context/spec updates never as a side effect of a feature commit").
  Ring 2's review was explicit: *"Commit `5177ce7` does three distinct
  things in one non-atomic commit, with no `openspec/changes/<id>/`
  anywhere in the tree backing any of it."* Fixed by creating
  `institution-detail-page` as an explicitly-labeled **retroactive**
  OpenSpec change (`skip_specs: true`, since the underlying requirement was
  already spec'd and unchanged — this change only added the UI surface for
  it), then archiving it. The already-pushed commit couldn't be un-bundled
  without a force-push, which wasn't warranted for a documentation-history
  concern — so it was documented plainly in `docs/BUILD_LOG.md` Phase 18
  instead of hidden. A follow-up Ring 2 pass explicitly acknowledged this
  trade-off: *"the rule-7 violation itself isn't literally undone, only
  disclosed"* — a fair characterization, left standing rather than argued
  with.
- **The PR #17 review saga — five rounds, each catching something real,
  with the fix for one problem sometimes introducing the next one.** PR
  #17 was a routine `context-gardener` sweep: correct one stale claim
  ("there is no CI configuration anywhere in this repository," false since
  2026-08-05) across the four files it was repeated in. It took five full
  Ring 2 review cycles to actually close:

  1. **Round 1** found the stale "no CI" claim repeated identically in
     `TESTING.md`, `CONVENTIONS.md`, `INTEGRATIONS.md`, and `STACK.md` — a
     recurrence of an already-known pattern (this exact "one stale claim,
     several sibling restatements" failure had already happened twice
     before, on PR #15 and PR #16). Fixed in all four files.
  2. **Round 2** found that the fix from round 1 replaced one wrong claim
     with a different wrong one: "branch protection is configured but not
     enforced" mischaracterized the only real evidence in the repo
     (`docs/BUILD_LOG.md` Phase 17's `403 Upgrade to GitHub Pro or make this repository public`) — branch protection can't be configured at
     all on this plan tier, it isn't "configured but unenforced." Two of
     the four citations also pointed at `context/rules/general.md`, which
     never mentioned branch protection anywhere. Fixed in all four files
     again, citing the real evidence this time.
  3. **Round 3** found that fixing round 2 left a table inside
     `TESTING.md` self-contradicting the correction two lines below it
     (a "Runs automatically?" column still said "No CI found" in four
     rows), *and* found that adding a new rule 11 to
     `context/rules/general.md` had collided with a pre-existing,
     unrelated rule 11 in a different section — two different rules both
     labeled "11" in the same document. Both fixed: the table reworded to
     state the substantively-true fact directly, and the Code-section
     rules renumbered 12/13.
  4. **Round 4** found one wording nit (a phrase reading ambiguously next
     to the correction just above it) and one process nit: the graduated
     `LEARNINGS.md` entry had its body deleted instead of kept alongside a
     `[graduated → ...]` tag, diverging from this repo's own one existing
     precedent for how a graduated learning should read. Both fixed.
  5. **Round 5** found that three of the files corrected in earlier rounds
     never had their `last_verified` frontmatter date bumped, despite
     genuinely being re-verified against live evidence in this same PR —
     silently understating how current their claims actually were. Fixed;
     round 6 came back clean and the PR merged.

  The same pattern that caused this — "fixing one stale claim leaves its
  siblings stale, or introduces a new one" — had already been logged twice
  in `context/learnings/LEARNINGS.md` before this PR. After this third
  recurrence, it was graduated from a logged learning to a permanent rule
  (`context/rules/general.md` rule 11: *"When correcting a stale/false
  claim in `context/` or `AGENTS.md`, grep the rest of `context/` and
  `AGENTS.md` for restatements of the same underlying fact before
  considering the correction done — fix every instance in one pass, not
  just the one instance a diff happened to surface."*).
- **Missing Jest config, found writing the first backend test — fixed. A
  separately-scoped ESLint gap, found in the same commit — deliberately
  not fixed.** Adding the project's first backend unit test
  (`api-key.guard.spec.ts`, via a real `/opsx:onboard` run) surfaced that
  no Jest config existed anywhere in `backend/` — the test couldn't run at
  all, since the default Babel transform choked on TypeScript syntax. This
  was a small, contained, 11-line fix activating the already-installed
  `ts-jest`, scoped to making one file runnable — fixed directly. In the
  same pass, it also surfaced that `eslint` isn't installed in `backend/`
  at all, despite the lint script referencing it and `TESTING.md` claiming
  it was "configured." This was **not** fixed: installing it for real
  means running it for the first time ever against roughly 80 never-linted
  files — genuinely unbounded, unrelated scope for a task that was about
  adding one test. `TESTING.md`'s inaccurate claim was corrected instead,
  and the ESLint gap left as an explicit future task.

## 6. Real Product/Governance Decisions Surfaced

- **Password-change scope — resolved directly by Dominik, not inferred.**
  Asked him explicitly: rotate the one shared credential, or build real
  per-user accounts? He replied "let's go with 1" (Google Drive comment
  thread, 2026-08-03 16:58 IST). Implemented as `credential-rotation`
  (commit `260cb38`), archived with its delta spec synced into
  `openspec/specs/credential-rotation/spec.md`. Building it surfaced a real
  design gap: the frontend held its own separate, `.env.local`-sourced copy
  of the credential, which would have gone stale the instant a rotation
  happened through the UI, reintroducing the exact "needs a restart"
  problem the feature was meant to remove — fixed with a matching
  frontend-side credential-override store.
- **Voting/governance UI — a real scope conflict, found after work had
  already started, resolved by checking the actual source rather than
  assuming.** `voting-governance-ui` implementation was already underway —
  real chaincode change, already live-deployed — when a check of
  `UI_PLAN_DRAFT.md` (a 2026-07-27 Szymon/Dominik/Aga sync) turned up an
  explicit line listing "Governance/voting UI" as **out of scope** for the
  separate Certificate UI work, with a note that it needed explicit
  reconfirmation before expanding. Rather than assume a real conflict or
  assume it was fine, Dominik's actual Google Drive comment thread was
  checked directly: his assignment of "Password change" + "UI for the
  voting system" as **AI SDLC Framework** evaluation tasks was dated
  2026-07-30 — three days *after* the July 27 out-of-scope note, for a
  distinct track (framework evaluation work, not the Certificate UI
  product work). Deliberate, not an oversight — work continued.
- **A related but separate scope question that this report cannot fully
  resolve: exactly what Dominik agreed to for the Slack→GitHub answer
  automation.** The adoption plan's own decision log states: *"he asked
  whether his Slack answer could sync to GitHub automatically and have the
  agent 'restart the implementation.' Scoped down deliberately to: PM
  answers on a GitHub issue, the system updates the proposal automatically,
  a reviewer approves it with one click — explicitly stopping there, no
  automatic implementation. His own words, not a compromise talked down
  from."* Read closely, that entry directly quotes Dominik on one part of
  the decision (no auto-implementation, "restart the implementation" is
  his own phrase) but does not directly quote him confirming the other
  part — that answering happens on GitHub rather than in Slack itself.
  His original question, as the entry itself paraphrases it, was about a
  **Slack** answer syncing over; what got built requires him to go answer
  **on GitHub**. There is no verbatim transcript of the original Slack
  thread stored anywhere in this repository to settle which reading is
  right, and Slack itself wasn't reachable while writing this report to
  check. This is flagged honestly as unresolved, not smoothed over — it's
  the same category of assumed-vs-actual gap this whole evaluation kept
  finding elsewhere, this time about a decision instead of a piece of code.
- **Certificate licensing (v1.01) — scoped from real, if informal, planning
  input.** `context/product/PRODUCT.md`'s "Current focus" section and the
  `certificate-licensing` OpenSpec change both cite "informal planning
  notes shared 2026-08-12" as their source — understood to trace back to
  Szymon's original v1.0/v1.01 scoping, though the notes themselves have no
  external ticket/doc/Slack link to cite; they were shared directly in
  conversation. Two real open questions from those notes are carried
  forward as genuine Open Questions in the change itself, not guessed at:
  whether a partnering institution needs vetting before licensing a brand,
  and whether the 66%-of-institutions governance threshold (currently
  majority, deliberately built as swappable) should be decided now or
  safely deferred. **Neither question is resolved by anything done in this
  evaluation.**
- **A genuinely open governance question, raised verbally, not written down
  anywhere in this repository.** Whether an institution's approval vote
  should remain valid permanently, or whether it should be re-checked at
  some later real-world event (e.g. actual onboarding), is a real,
  still-open question for Dominik to decide — not resolved by anything
  done today. It exists only as a verbal exchange between Neethu and
  Dominik; this report is not aware of it being written down in any commit,
  doc, or spec, and is deliberately not inventing a citation for it. The
  closest *documented*, related-but-distinct technical gap is
  `ARCHITECTURE.md` Key Decision #12: a full network wipe restores
  infrastructure membership but not ledger membership for non-founding
  institutions, meaning a member org can look fully healthy while being
  invisible to `GetAllInstitutions` until its governance ceremony is
  manually redone. That is a real, already-understood operational gap —
  it is not the same question as whether an approval should ever expire,
  and the two shouldn't be conflated.

## 7. Process Lessons

- **The single biggest, most recurring pattern this whole evaluation kept
  surfacing: something assumed true — from a template, from an earlier
  claim in this very project, or from memory of "this was already
  verified" — turned out not to match current reality, and it took a
  dedicated re-check each time to catch it. It was never caught by the
  normal flow of work.** Concrete instances: a stale "several months"
  overstatement caught before it shipped; a tracking doc claiming
  `SLACK_WEBHOOK_QUALITY` was still missing when it had actually already
  been resolved six days earlier (caught via `gh secret list` during the
  `agentic-qa` incident response, not by re-reading the tracking doc
  itself); `TESTING.md`'s ESLint claim and its
  `agentic-qa.yml` "exists" claim, both wrong when finally checked;
  `AGENTS.md`/`context/rules/general.md` assumed to exist by three
  workflow prompts that depended on them, when neither file existed yet;
  the `/opsx:onboard` "missing" belief (§5.1), which drove a real design
  decision before being found wrong; and, most recently and most visibly,
  the PR #17 saga (§5.2) — the same failure mode recurring inside a single
  PR, four times, including once in the very fix meant to correct an
  earlier instance of it. This is worth carrying forward as a standing
  practice, not treating as a one-off: **before restating any claim about
  current state — "this exists," "this was verified," "this is still
  true" — check it again, don't reuse the last check.**
- **Triaging findings as Bug / Improvement / Question, rather than treating
  everything the same way, kept small process friction from turning into
  either silent scope creep or silent scope loss.** The ESLint-vs-Jest-config
  split (§5.2) is the clearest example: same commit, same discovery moment,
  deliberately different treatment — one was small and contained, the
  other was real, unbounded, unrelated scope.
- **Verifying against current reality before building a substitute for
  something assumed missing** is what turned the `/opsx:onboard` story
  (§5.1) from a wasted afternoon into a correctly-scoped tool
  (`spec-onboard-replacement`) built for the right reason instead of the
  wrong one.

## 8. What's Explicitly Not Done, and Why That's Not a Failure

- **Stage E** (live team workshops) and **most of Stage G** (sustained
  real usage of the Change-ID convention, an actually-populated Project
  board, Friday operating reviews) — both need the team's calendar and the
  passage of real weeks, not more solo agent work. See §4.
- **Backend ESLint setup** — deliberately deferred (§5.2): a real, contained
  fix (Jest config) was kept separate from a real, unbounded one
  (installing and running ESLint against ~80 never-linted files for the
  first time).
- **The Slack-relay feature (Dominik replying in-thread on Slack, relayed
  automatically to GitHub as the same `@claude <answer>` comment)** — paused,
  not abandoned. This was never formally signed off by Dominik as its own
  decision (see §6's honest note on that ambiguity) — Neethu made the call
  to build the missing direction anyway rather than chase that sign-off
  first, then paused the work to prioritize the institution-detail-page/Stage
  F thread. No code has been written for it yet.
- **PR #1 upstream (`espeo/ai-sdlc-framework`)** — checked live while
  writing this report: still **OPEN**, zero reviews, last updated
  **2026-08-03**. No movement in over a week. Blocked on Dominik/Filip's
  availability to review, not stalled from this side.

## 9. Recommendations / Next Steps

1. **Schedule Stage E's team workshops** — this is the one blocker nothing
   here can substitute for.
2. **Get a real 3–6 item next-quarter capability backlog from Dominik** —
   right now Stage F has exactly one item (`certificate-licensing`) to draw
   from, and `PRODUCT.md`'s own "Current focus" section says plainly it
   isn't a PM/PO-confirmed backlog yet.
3. **~~Get human review on the two spec stubs~~ — closed.** Neethu reviewed
   both (`certificate-lifecycle`, `institution-directory`) against live
   behavior on 2026-08-13 and bumped both to `confidence: high`.
4. **Decide on backend ESLint timing** — it's a real, contained-but-nonzero
   task (~80 files, first lint pass ever) that someone needs to schedule
   deliberately rather than let it happen as a side effect of an unrelated
   commit.
5. **Decide the governance-vote-permanence question** (§6) — currently
   exists only verbally; needs an actual decision recorded somewhere once
   made.
6. **Resolve, or explicitly accept as unresolved, the Slack→GitHub scope
   question** (§6) before resuming the paused Slack-relay work — building
   it without knowing whether the original ask was actually "answer in
   Slack" risks solving the wrong problem.
7. **Follow up on PR #1 upstream** — it's been open and unreviewed since
   2026-08-03; worth a direct nudge to Dominik/Filip if the intent is for
   it to actually land in the Starter Kit.

## 10. Appendix

### CI workflow run counts (live-checked 2026-08-13, not reused from an earlier count)

| Workflow | Claude-driven? | Total runs | Outcomes | First run | Latest run |
|---|---|---|---|---|---|
| `agentic-qa.yml` | Yes | 4 | 4 success | 2026-08-10 | 2026-08-13 |
| `ai-pr-review.yml` | Yes | 64 | 32 success, 29 skipped, 3 failure | 2026-08-06 | 2026-08-13 |
| `context-drift-check.yml` | Yes | 9 | 9 success | 2026-08-05 | 2026-08-13 |
| `context-gardener.yml` | Yes | 15 | 8 success, 7 failure | 2026-08-05 | 2026-08-13 |
| `project-sync.yml` | No (plain script) | 70 | 69 success, 1 failure | 2026-08-04 | 2026-08-13 |
| `proposal-answer-sync.yml` | Yes | 33 | 3 success, 30 skipped | 2026-08-05 | 2026-08-13 |
| `requirements-nudge.yml` | No (plain script) | 54 | 54 success | 2026-08-04 | 2026-08-13 |
| `scheduler-dispatch.yml` | No (plain script) | 10 | 8 success, 2 failure | 2026-08-05 | 2026-08-13 |
| **Total** | **5 of 8 Claude-driven** | **259** | | | |

Note: an earlier informal count referred to "6 CI agents" — checked directly
while writing this report (`grep -l claude-code-action .github/workflows/*.yml`)
and only 5 of the 8 workflows actually invoke `anthropics/claude-code-action`
(`agentic-qa`, `ai-pr-review`, `context-drift-check`, `context-gardener`,
`proposal-answer-sync`); `scheduler-dispatch.yml` only *mentions*
`claude-code-action` in a comment explaining why it exists, it doesn't call
it. Corrected here rather than repeated.

Many of the "failure" and "skipped" outcomes above are expected/intentional
(e.g. `proposal-answer-sync` skips on every PR/comment event that isn't an
`@claude <answer>` reply on an open-question issue; several early
`context-gardener` failures were the permission-denial bug fixed in commit
`45857b2`) — not re-litigated claim-by-claim here, since none of them are
currently open/unexplained.

### Framework skills run for real

| Skill | Evidence |
|---|---|
| `map-codebase` | 7 files added to `context/codebase/` (commit `c9803ad`) |
| `doc-archaeology` | `context/ARCHIVE-INDEX.md`, `context/CONFLICTS.md`, `docs/AI_SDLC_DOC_ARCHAEOLOGY_EVALUATION_REPORT.md` (commit `c9803ad`) |
| `draft-adr` | `context/decisions/ADR-0001-never-delete-committed-ca-server-crypto.md` |
| `capture-learning` | Initially scoped as untestable in a single pass (2026-08-12); run for real starting Phase 17, now has multiple entries in `context/learnings/LEARNINGS.md`, one graduated to `context/rules/general.md` rule 11 |

### Real commits, PRs, and issues referenced in this report

- Commits: `c9803ad`, `01c4267`, `3913177`, `5a47be2`, `e8d1260`, `a7a471b`,
  `5e8dae9`, `a91aa52`, `ea5885e`, `d365d69`, `404a493`, `94bbaab`, `5177ce7`,
  `df3097d`, `260cb38`, `4142690`
- Pull requests (BLC-Consortium-MVP, 13 total): #4, #9, #11, #12, #13, #14,
  #15, #16, #17, #18 (all merged); #5, #7, #10 (closed, deliberately not
  merged — test/verification artifacts or superseded by manual fixes)
- Pull request (upstream `espeo/ai-sdlc-framework`): #1, open since
  2026-07-31, still unreviewed as of 2026-08-13
- Issues (BLC-Consortium-MVP, 5 total, all closed): #1, #2, #3, #6 (test/
  verification artifacts); #8 (real bug — governance UI never showed
  per-institution vote status — fixed and verified via `governance-vote-status`)
- Upstream reference: `Fission-AI/OpenSpec` issue #1001 (closed by a
  maintainer, not filed by this project)

### Files created or materially modified in this evaluation

- `context/codebase/{ARCHITECTURE,CONCERNS,CONVENTIONS,INTEGRATIONS,STACK,STRUCTURE,TESTING}.md`
- `context/{ARCHIVE-INDEX,CONFLICTS}.md`
- `context/decisions/ADR-0001-never-delete-committed-ca-server-crypto.md`
- `context/learnings/LEARNINGS.md`
- `context/rules/general.md`, `AGENTS.md`
- `context/product/{PRODUCT,DOMAIN}.md`
- `openspec/specs/{certificate-lifecycle,institution-directory,institution-governance-ui,credential-rotation}/spec.md`
- `openspec/changes/certificate-licensing/` (in progress)
- `.github/workflows/{agentic-qa,ai-pr-review,context-drift-check,context-gardener,project-sync,proposal-answer-sync,requirements-nudge,scheduler-dispatch}.yml`
- `frontend/src/app/(dashboard)/institutions/[id]/page.tsx` (new)
- `backend/src/common/guards/api-key.guard.ts` (`READ_ONLY_API_KEY` addition)
- `docs/{BUILD_LOG,ERROR_LOG}.md`
- `docs/AI_SDLC_{STAGE_B_EVALUATION_REPORT,STAGE_B_SPOT_CHECK_EVIDENCE,DOC_ARCHAEOLOGY_EVALUATION_REPORT,CLAUDE_TAGS_EVALUATION}.md`
