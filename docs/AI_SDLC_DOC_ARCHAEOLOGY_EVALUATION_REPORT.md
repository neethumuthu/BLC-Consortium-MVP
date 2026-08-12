# Evaluation Report: AI SDLC Framework — `doc-archaeology`, `draft-adr`, `capture-learning`

**Subject project:** BLC-31, a Hyperledger Fabric-based consortium network for
institution governance and certificate issuance/verification/revocation
(Go chaincode, NestJS backend, Next.js frontend, Docker Compose deployment,
a custom Go-based network-config generator).

**Evaluation scope:** The three skills the Stage B report explicitly left out
of scope: `doc-archaeology`, `draft-adr`, and `capture-learning`.

**Status:** Internal evaluation, for team review. Not a vendor deliverable.

---

## 1. Executive Summary

- **What was evaluated:** `doc-archaeology` (tested, with output verified),
  `draft-adr` (tested via the one retroactive ADR `doc-archaeology` itself
  triggered), and `capture-learning` (not executed — scoped only, see
  Section 6).
- **Important methodological note:** unlike the Stage B report, this is not
  a live generation-then-verify pass done in one sitting. `doc-archaeology`
  was actually run against this project on **2026-07-30**, in an earlier
  session; its output (`context/ARCHIVE-INDEX.md`, `context/CONFLICTS.md`,
  four merged claims across `context/codebase/*.md`, and one retroactive ADR)
  was sitting on disk, unverified, until this pass. What follows is an
  independent re-verification of that pre-existing output against current
  source, performed on **2026-08-12** — twelve days after generation, which
  turned out to matter (Section 3.4).
- **Biggest success:** every claim actually written into a file — the four
  doc-derived merges, both `CONFLICTS.md` rows, and ADR-0001 — checked out
  against real code or the real source document. Nothing fabricated,
  nothing miscategorized.
- **Biggest weakness:** doc-derived merges carry no staleness mechanism. One
  of the four merged claims (`TESTING.md`'s "12 exported transaction
  functions") was accurate when written on 2026-07-30 and is now off by one,
  because unrelated feature work (the `governance-vote-status` change,
  2026-08-11) added an eighth function to `institution-cc`. Nothing about
  the merge would tell a future reader it needs rechecking.
- **Recommendation:** Conditional adoption, same as Stage B — `doc-archaeology`
  produces real, checkable value, but merged claims need the same
  `last_verified` discipline this project already uses for
  `context/rules/general.md`. `capture-learning` remains genuinely untested;
  see Section 6 for what a real test would require.

---

## 2. Background

`doc-archaeology` is the AI SDLC Framework skill for distilling scattered
legacy documentation into a project's `context/` files, with provenance,
producing `CONFLICTS.md` and `ARCHIVE-INDEX.md` as it goes. `draft-adr` turns
a decision into a formal ADR — either directly, or (as here) triggered
retroactively when `doc-archaeology` surfaces a decision that isn't
checkable from code but explains something in the old docs. `capture-learning`
is a different kind of skill entirely: a lightweight, repeatable five-step
procedure meant to fire every time something surprising happens during real
work, not a one-shot generation task.

For this project, the source corpus was three documents written just before
the 2026-07-24 team demo — `PPT_PROMPT.md` (a slide-deck authoring brief),
`TEAM_DEMO_PREP.md` (a demo runbook), and `V1_PHASE_OVERVIEW.md` (a
comprehensive "everything built in v1.0" reference) — moved out of the repo
to `BLC-Consortium-V1-docs-archive/` to satisfy the skill's stated
precondition that the corpus live outside the repo.

---

## 3. Findings — `doc-archaeology`

### 3.1 Classification and cross-checking

All three documents were classified `distilled, with conflicts` in
`context/ARCHIVE-INDEX.md` — none were pure product knowledge, pure
obsolete, or contradiction-free. That's a plausible outcome for three
documents written at essentially the same moment about the same system: if
they'd disagreed with each other, or if zero of ~35 checkable claims had
drifted in the following two-plus weeks of active development, either would
be more surprising than what actually happened.

### 3.2 Verifying the merged claims

Four claims were actually merged into `context/codebase/*.md` with
`source: doc-derived <filename>, confidence: medium` provenance. Each was
independently re-checked today against current source, not against the
codebase-map files themselves:

| Claim (target file) | Re-verified against | Result |
| --- | --- | --- |
| ccaas packaging was forced by a Docker BuildKit incompatibility, not chosen as a preference (`STACK.md`) | `chaincode/certificate-cc/main.go` and `chaincode/institution-cc/main.go` header comments | Confirmed — exact wording present in both files |
| Certificate/proposal IDs deliberately use `ctx.GetStub().GetTxID()`, not a UUID, for endorsement-determinism reasons (`CONVENTIONS.md`) | `issuecertificate.go:153`, `governance.go:358` and its own comment at 353-356 | Confirmed — both use `GetTxID()`; comment states the determinism rationale |
| The majority-unreachable rejection rule was chosen over two named, explicitly-rejected alternatives (100%-participation wait; mirroring `VotesAgainst`) (`CONCERNS.md`) | `governance.go`'s `CastVote` else-branch (~470-486) and `castvote_test.go`'s two close-race tests | Confirmed — comment names both rejected alternatives near-verbatim; both cited tests exist and target this exact branch |
| `certificate-cc` has exactly 22 unit test functions, and both chaincodes together expose 12 exported transaction functions (7 + 5) (`TESTING.md`) | `grep -c "^func Test"` per file; `grep "^func (s \*SmartContract)"` per package | Test count confirmed exactly (7+2+2+6+5=22). **Function count no longer holds** — see 3.4. |

### 3.3 Verifying `CONFLICTS.md`

Both rows were re-checked against git history and current source, not
just against the doc's own citations:

- **"No auth yet" claim vs. `ApiKeyGuard`.** All three source docs describe
  the backend as unauthenticated. `backend/src/main.ts:17` applies
  `ApiKeyGuard` globally with no opt-out, added in commit `ec00266`
  (2026-07-28) — four days after the docs were written. Confirmed real, and
  correctly characterized as a stale point-in-time snapshot rather than an
  error in the docs.
- **"InstitutionB still pending" claim vs. `status: member`.** `network/config/network.yaml:24`
  currently reads `status: member`; commit `abb1e3d` (2026-07-28) made that
  change, with a message stating InstitutionB completed live onboarding
  during the demo the docs were written for. Confirmed real, same root
  cause as the first row.

The skill's own hard rule is to treat an *empty* `CONFLICTS.md` as suspicious
rather than automatically good. That didn't apply here — two real conflicts
were found — but the inverse question is worth asking too: is two out of
roughly thirty-five checkable claims a *believable* count, or suspiciously
low? Given both conflicts share one identical root cause (docs frozen four
days before two specific, unrelated commits landed), and every other
checked claim describes something that hasn't changed since, two is
consistent with what actually happened rather than a sign of missed
contradictions.

### 3.4 New finding: merged claims have no staleness mechanism

This is the one genuinely new finding from today's pass, not just a
confirmation of the 2026-07-30 output. `TESTING.md`'s doc-derived claim
("12 exported transaction functions: 7 in `institution-cc`, 5 in
`certificate-cc`") was correct when merged. Since then, the
`governance-vote-status` feature (2026-08-11, shipped for GitHub issue #8)
added `GetResolvedProposals` to `institution-cc` — an eighth exported
transaction function. The merged claim now undercounts by one, and nothing
in its provenance line signals that it should be rechecked; `source:
doc-derived V1_PHASE_OVERVIEW.md, confidence: medium` reads identically
whether the claim is one day old or one year old.

This project already has a convention for exactly this problem —
`context/rules/general.md` carries `last_verified: 2026-08-11` in its
frontmatter. Doc-derived merges don't use it. This is a small, structural
gap, not a one-off mistake, and it will recur every time a doc-derived
claim describes something that ordinary feature work later touches.

### 3.5 The unfileable-claims gap

The 2026-07-30 pass flagged, correctly, that a handful of historical/process
statistics from `V1_PHASE_OVERVIEW.md` (36 dated incidents, 11 phases, "7
real infrastructure bugs") are not code-checkable and have no home in this
repo's `context/` structure — there is still no `context/product/` or
`context/DOMAIN.md` to file low-confidence product/process claims into. This
is exactly the gap the skill's own instructions anticipate as a real
possibility, and exactly the gap this project's earlier audit already
flagged as parked, lower-priority work. Confirming it here rather than
re-litigating it.

---

## 4. Findings — `draft-adr`

`context/decisions/ADR-0001-never-delete-committed-ca-server-crypto.md` was
the one retroactive ADR the 2026-07-30 pass produced, triggered by a claim
in the archived docs that wasn't checkable from code but explained a past
decision. It was re-verified today against its cited source,
`docs/ERROR_LOG.md`'s 2026-07-13 entry (`## 2026-07-13 — my own "targeted
cleanup" recovery step destroyed InstitutionB's CA root identity...`):

- The quoted incident title, root cause (a CA's root keypair lives inside
  `crypto/ca-servers/<org>/` and gets permanently pinned into channel trust
  the moment that org's MSP is committed), and the "no partial fix exists,
  only a full `network.sh down --wipe`" resolution all match the source
  entry's actual text, not a paraphrase that drifted from it.
- The "unverifiable from code" classification is itself correct: the
  source entry states plainly that `org-add.sh` has no code-level guard
  against this, and a repo search confirms none exists — there is genuinely
  nothing in code that this rule could have been checked against instead of
  being drafted as an ADR.
- The ADR's "Alternatives considered" section honestly states "not recorded
  — the source incident describes a mistake and the resulting rule
  directly," rather than inventing a false choice between options that were
  never actually weighed.

No corrections were needed. This is the strongest single result in this
report: a well-formed ADR, accurately reconstructed from a real incident,
correctly classified as something code alone could never have surfaced.

---

## 5. Findings — `capture-learning`: not executed, scoped only

Per the plan for this evaluation, `capture-learning` was deliberately not
run this round. It is a different kind of skill from the other two — a
lightweight, repeatable five-step procedure (identify a rule, check for an
existing entry, append to `LEARNINGS.md`, optionally graduate it into
`context/rules/` or `CONVENTIONS.md`, deliver as part of the current PR) —
not a one-shot generation task. Running it once against a synthetic case
would test whether it can format an entry, not whether it does its actual
job: catching real duplicates, making good graduate/don't-graduate calls,
and — the part that actually matters — whether the compounding effect
works, i.e. whether a captured learning actually stops the same mistake from
recurring in a later, unrelated task.

**What evaluating it properly would require:**

- Multiple real invocations across genuinely surprising events over time —
  not one contrived test.
- A way to check, later, whether an agent given a captured learning as
  context actually avoided the mistake it describes, versus repeating it
  anyway.
- Judgment calls to specifically watch: does step 2's duplicate-check
  correctly recognize when a new surprise is really the same rule as an
  existing entry worded differently? Does step 4's graduation call
  correctly separate "permanent, unambiguous rule" from "one-off, don't
  graduate"?

**A concrete precondition gap, confirmed today:** the skill's target file,
`context/learnings/LEARNINGS.md`, does not exist in this repo
(`context/learnings/` isn't present at all). This was already flagged as a
parked, lower-priority gap in the earlier AI SDLC audit; confirming it here
rather than treating it as new.

**Material for a future real test already exists in this project**,
without needing to manufacture one: the single-org-endorsement silent-commit
bug found during the staging wipe (2026-08-11) is a clean symptom → root
cause → rule case (`peer chaincode invoke successful` reports submission,
not commit; a majority-endorsement policy needs a majority of orgs'
`--peerAddresses` on every mutating invoke) that was never run through this
skill's structured format — it exists today only as a `docs/ERROR_LOG.md`
entry and a personal-memory note. A future evaluation could use it as a
real first test case rather than a synthetic one.

This section is a scoping note, not a completed test.

---

## 6. Strengths and Weaknesses

**Strengths:**

- Cross-checking claims directly against source (not against the
  already-generated `context/codebase/*.md` map) is exactly the discipline
  the skill instructs, and it's what caught both real `CONFLICTS.md` rows.
- Honest handling of the unfileable-claims case (3.5) — no file was invented
  to force a home for claims that don't have one yet.
- `draft-adr`'s single test case (Section 4) was accurate with zero
  corrections needed, including getting the harder judgment call
  ("unverifiable from code — is that actually true?") right.

**Weaknesses:**

- **No staleness mechanism for merged claims** (3.4) — the most consequential
  finding in this report, because it will recur silently, by design, every
  time normal feature work touches something a doc-derived claim described.
- **`capture-learning` is untestable as a one-shot skill** — not a flaw in
  the skill itself, but a real limit on what "evaluate this" can mean for
  it within a single evaluation pass.

---

## 7. Recommendations

1. **Give doc-derived merged claims a `last_verified` date**, matching the
   convention `context/rules/general.md` already uses, so a future reader —
   human or agent — has a signal that a specific claim (not the whole file)
   needs rechecking, rather than trusting a number indefinitely.
2. **Add a lightweight recheck trigger**: when a change touches a file a
   doc-derived claim cites (here, `institution-cc/queries.go` for the
   function-count claim), flag the nearby doc-derived note for review. This
   doesn't need to be automated to start — a checklist line in the PR
   template would catch this specific class of drift.
3. **Do not treat `capture-learning` as evaluated by this report.** Plan a
   real test across several genuine incidents over time, and consider using
   the single-org-endorsement bug (Section 5) as its first real case rather
   than inventing one.
4. **Carry the unfileable-claims gap forward as-is** — it's already tracked
   as parked, lower-priority work from the earlier audit; no new action
   needed from this report specifically.

---

## 8. Overall Assessment

`doc-archaeology` did its actual job here: it found real, verifiable
drift between old planning docs and current code, correctly distinguished
checkable claims from unfileable ones, and correctly triggered a retroactive
ADR for the one case that genuinely warranted it. Every claim that made it
into a file was accurate when checked against real source, not against its
own prior output.

The weakness that matters is about time, not accuracy at the moment of
generation: a doc-derived claim is a snapshot, and this project's codebase
does not stand still. Twelve days after generation, one of four merged
claims had already drifted, silently, with no mechanism in place to flag it
short of exactly the kind of manual re-verification this report performed.
That's a fixable process gap (Recommendation 1), not a reason to distrust
what the skill produced — but it is the honest headline finding here, the
same way the `blcgen` gap was the honest headline finding for Stage B.

`draft-adr`, on its one real test case, produced accurate, well-classified
output with no corrections needed. `capture-learning` remains genuinely
untested — not because it failed anything, but because a one-shot test
cannot evaluate what it actually claims to do.

This assessment is based on a single project and a small number of test
cases (one `doc-archaeology` pass, one `draft-adr` case) and should be
treated as a data point, not a conclusion about the framework's general
reliability — the same caveat Stage B's report carries.
