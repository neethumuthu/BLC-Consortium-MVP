# Evaluation Report: AI SDLC Framework — Stage B ("Map Codebase")

**Subject project:** BLC-31, a Hyperledger Fabric-based consortium network for
institution governance and certificate issuance/verification/revocation
(Go chaincode, NestJS backend, Next.js frontend, Docker Compose deployment,
a custom Go-based network-config generator).

**Evaluation scope:** Stage B ("Map Codebase") of the AI SDLC Framework's
Brownfield Rollout tutorial only.

**Status:** Internal evaluation, for team review. Not a vendor deliverable.

---

## 1. Executive Summary

- **What was evaluated:** Stage B ("Map Codebase") of the AI SDLC Framework's
  Brownfield Rollout tutorial, tested against BLC-31 — a real, already
  substantially built project with its own maintained documentation, used as
  an independent baseline for comparison.
- **What was generated:** Seven `context/codebase/*.md` files (`STACK`,
  `ARCHITECTURE`, `STRUCTURE`, `INTEGRATIONS`, `CONVENTIONS`, `TESTING`,
  `CONCERNS`), produced directly from source code with the project's
  existing documentation deliberately withheld during generation.
- **Biggest success:** The generated documentation was accurate — every
  spot-checked claim held up against source — and it surfaced concrete,
  verifiable findings not present anywhere in the project's existing
  documentation, most notably that `blcgen` (the network's config generator)
  is simultaneously load-bearing, untested, and absent from the risk
  register — a real gap, confirmed against three historical incidents, that
  was added to `CONCERNS.md` as a direct result of this evaluation.
- **Biggest weakness:** That same `blcgen` finding was missed by every
  automated step in this evaluation's own pipeline — generation, isolation
  verification, and automated spot-checking all completed cleanly without
  flagging it. It was caught only by an independent human reading all seven
  files together, a step Stage B does not currently require.
- **Recommendation:** Conditional adoption of Stage B as a brownfield
  onboarding accelerant — not a documentation replacement — with independent
  human review treated as a required step, and the process fixes in Section
  10 applied before wider use.

---

## 2. Background

Espeo's AI SDLC Framework is an internal, spec-driven delivery methodology
covering both greenfield and brownfield engagements. Its Brownfield Rollout
tutorial's Stage B ("Map Codebase") calls for generating a standard set of
seven codebase-context files directly from source, using four parallel
agents working in separate areas (Tech, Architecture, Quality, Concerns),
with code treated as the sole ground truth.

BLC-31 was selected as the test subject because it is a real brownfield
project with an established codebase and an existing set of engineering
documentation. Unlike a synthetic or greenfield test case, it already
contains a maintained `ARCHITECTURE.md`, `BUILD_LOG.md`, and `ERROR_LOG.md`,
allowing the framework's output to be compared against an independently
authored baseline rather than evaluated in isolation.

---

## 3. Evaluation Scope

**In scope:** Stage B of the Brownfield Rollout tutorial only — generation
of the seven `context/codebase/*.md` files, verification of that output, and
comparison against the project's existing documentation.

**Explicitly out of scope, not evaluated here:**

- The remainder of the Brownfield Rollout tutorial (OpenSpec integration,
  GitHub Projects sync, Slack wiring, CI workflows shipped with the
  framework's starter kit).
- The framework's other skills (`doc-archaeology`, `draft-adr`,
  `capture-learning`).
- The Greenfield Rollout tutorial.
- Any AI SDLC Framework tutorial content beyond the "map-codebase" skill and
  the spot-check step described by name as "Tutorial 1, Stage B3" — that
  source document was not independently read for this evaluation; the step
  was implemented from a description of it. Two distinct gaps follow: the
  instruction was taken second-hand, and the *executor* also differs from
  what Stage B3 specifies — it describes a human personally reviewing each
  file, while what ran first was an AI-executed automated analog (Section 4,
  step 3). The actual human-executed check happened separately and is its
  own step (Section 4, step 5).

This was a single-project test. No claim in this report should be read as
validated across multiple codebases, team sizes, or languages.

---

## 4. Methodology

1. **Generation.** Four parallel agents were tasked with the framework's
   four defined roles (Tech → `STACK`/`INTEGRATIONS`; Architecture →
   `ARCHITECTURE`/`STRUCTURE`; Quality → `CONVENTIONS`/`TESTING`; Concerns →
   `CONCERNS`), each restricted to the project's actual source and the
   framework's blank templates, explicitly instructed not to read the
   project's existing `ARCHITECTURE.md`, `docs/BUILD_LOG.md`, or
   `docs/ERROR_LOG.md`. This exclusion is the load-bearing premise of the
   whole evaluation — it is what makes "did the generated files
   independently find anything new" a meaningful question rather than a
   circular one.
2. **Isolation verification.** Initial generation was interrupted before
   completion. Isolation was verified before any partial work was reused:
   each interrupted agent was asked to report, file by file, whether it had
   opened any excluded document. Two agents reported clean isolation and
   were resumed. One reported that a broad, insufficiently-scoped search had
   surfaced an excluded file's *name* (not content) in its own search
   output — treated as disqualifying, not acceptable; that agent's work was
   discarded and restarted fresh, as was a fourth agent that produced no
   usable output at all. Net effect: two of seven final files came from
   verified-clean, resumed agents; five came from agents with no prior
   history.
3. **Automated spot-check** *(AI-executed; supplementary to, not equivalent
   to, the human check Stage B3 specifies — see step 5)*. Twenty factual
   claims were selected across the seven files and checked directly against
   source using `grep`/`sed`, independent of the generating agent's own
   citations. This step confirms textual accuracy against source; it cannot
   judge whether a claim is the right thing to have said, or whether
   something important is missing entirely — both of which turned out to
   matter (Section 6.4), and were only caught by step 5.
4. **Comparison against existing documentation.** `ARCHITECTURE.md`,
   `docs/BUILD_LOG.md`, and `docs/ERROR_LOG.md` were read and checked
   against the seven generated files for contradictions and material gaps.
   An initial pass used full reading for the first two documents but only
   targeted keyword search for `ERROR_LOG.md`; a follow-up pass read
   `ERROR_LOG.md` in full and surfaced findings the keyword search had
   missed (Section 6.3) — itself a methodological finding, not just a
   completeness formality.
5. **Independent human review.** Following steps 1–4, all seven generated
   files were read in full by a human reviewer, using a structured per-file
   orientation summary as a guide to where to look, not a substitute for
   direct reading. This step — not steps 1–4 — is what identified the
   `blcgen` cross-file consistency gap (Section 6.4), and is the direct
   evidentiary basis for Recommendation 1 (Section 10) and the corresponding
   lesson in Section 11.

**Known residual gaps in this methodology:** the initial full read of
`BUILD_LOG.md` skipped roughly 193 of its 2,530 lines (part of the
org-onboarding debugging narrative) due to a navigation choice mid-read; this
was not revisited. Separately, `TESTING.md`'s claim that the Go chaincode
test suites pass rests on the generating agent's self-report of having run
`go test ./...` — file existence was confirmed, but the tests were not
independently re-run.

---

## 5. Generated Artifacts

| File | Lines | Front-matter | Content summary |
| --- | --- | --- | --- |
| `STACK.md` | 28 | Yes | Per-layer tech stack/versions; CouchDB confirmed (not assumed); no CI found; no dependency policy found. |
| `INTEGRATIONS.md` | 62 | Yes | Every external integration point with entry point, sandbox status, gotchas; full env-variable table. |
| `ARCHITECTURE.md` | 105 | Yes | Architectural style, module-dependency table, three key flows traced through real function calls, boundary/contract notes. |
| `STRUCTURE.md` | 61 | Yes | Annotated directory tree; "where things go" table. |
| `CONVENTIONS.md` | 56 | Yes | Real naming/error-handling/API-design patterns per layer, quantified where inconsistent. |
| `TESTING.md` | 64 | Yes | Honest test-coverage inventory; explicit "no CI"/"no Ring 3 QA" rather than invented content. |
| `CONCERNS.md` | 44 | Yes | "Do not touch" table, known-debt table, watchlist. Reflects one row added during this evaluation (Section 6.4). |
| **Total** | **420** | — | — |

None exceeded the framework's ~300-line guideline; the largest
(`ARCHITECTURE.md`, 105 lines) was roughly a third under budget. Whether this
reflects a comfortably sufficient guideline, or simply a project too small to
test it, is addressed in Section 9.

---

## 6. Findings

### 6.1 Accuracy

Twenty individually selected, concrete factual claims — each naming a
specific file and code behavior — were checked directly against the actual
source. **All 20 held up.** Representative examples:

| Claim (source file) | Verification method | Result |
| --- | --- | --- |
| `network/config/network.yaml` declares chaincode packaging as `classic`, but the deployed system runs `ccaas` (`STACK.md`) | Read `network.yaml:27` and both chaincodes' `main.go` directly | Confirmed — real, unresolved discrepancy in the config file |
| `RevokeCertificate` deliberately omits the active-institution check that `IssueCertificate` enforces (`ARCHITECTURE.md`) | Read `revokecertificate.go` in full, including its own doc comment | Confirmed — intentional asymmetry, documented in code |
| A stale code comment claims `CastVote` never rejects a proposal, while the function actually does (`CONCERNS.md`) | Read both the comment and the actual rejection logic in `governance.go` | Confirmed — both statements are real and do contradict each other |

One imprecision was found: `CONVENTIONS.md` states that chaincode "never
calls `time.Now()`," true of production logic but omitting that test files
call it extensively (expected, for fake timestamps, but uncaveated). A
wording gap, not a factual error.

### 6.2 Newly discovered observations (not present in existing documentation)

Confirmed, after a full read of the existing documentation, to be genuinely
absent from it — not merely missed by a keyword search:

| Observation | File | Verification |
| --- | --- | --- |
| `network.yaml`'s `chaincode.packaging: classic` field is dead configuration — parsed and printed, but nothing in the deployment path branches on it | `STACK.md` | Confirmed by grepping its only two usages; no conditional logic reads it |
| The backend's Fabric-error-to-HTTP-status mapping and the frontend's separate error-message humanizer both independently regex-match the same underlying Go error strings, with no shared source of truth | `CONVENTIONS.md`, `ARCHITECTURE.md` | Confirmed by reading both files; the backend filter's own comment self-describes as "a FIRST DRAFT, not verified against live output" |
| `InstitutionsController` directly injects `CertificatesService` to serve one composed endpoint — a minor cross-module coupling | `ARCHITECTURE.md` | Confirmed by reading the controller |
| CA, peer, and CouchDB ports use bare `hostport:containerport` Compose syntax, binding to all interfaces rather than localhost only | `CONCERNS.md` | Confirmed by reading the Compose templates |
| The bind-mounted Docker socket used by peer containers has a security implication (a compromised peer has effective host Docker-daemon control) not stated anywhere in existing documentation | `CONCERNS.md` | Confirmed absent by full-text search of all three existing documents |

### 6.3 Comparison against existing documentation

**Contradictions found: zero.** Where the two document sets cover the same
ground, they agree — in one case closely enough to be worth noting on its
own: `CONVENTIONS.md` independently identified a data-tagging convention as
"a non-obvious, previously-hit gotcha" purely from paired code annotations,
without ever reading the incident log — and that inference matched a real,
specific 2026-07-09 incident in `docs/ERROR_LOG.md` exactly.

**Material gaps found** — operational knowledge present in existing
documentation but structurally unreachable from code alone:

| Existing-documentation finding | Why code alone cannot surface it |
| --- | --- |
| A partial/targeted deletion inside a CA's own data directory, performed after that org's identity was already channel-committed, permanently broke that org's identity, requiring a full network rebuild. | A record of a human operational mistake and its consequence — not a property of any code path. |
| A Fabric peer's in-memory read cache does not reflect writes made directly to its backing database outside the normal transaction path, and serves stale data until the peer restarts. | A documented behavior of the underlying platform, observed empirically — not visible in this project's own code. |
| `peer chaincode invoke successful` confirms submission, not commit; two competing operations can both report success while only one actually takes effect. | Same as above — a platform behavior discovered through direct testing. |

These gaps are not defects in the generated files; they describe knowledge
that could not have been produced by a code-only process by design. They are
the clearest evidence for why the two document sets need to coexist rather
than one replacing the other.

### 6.4 The `blcgen` gap — how it was found, and why it matters most

`TESTING.md` correctly recorded that `network/cmd/blcgen` and
`network/internal/generate` — the code that generates the network's entire
configtx, Docker Compose, and connection-profile artifacts — have zero test
files. `ARCHITECTURE.md`, independently, established that this same code is
the network's sole, load-bearing topology generator. `CONCERNS.md`'s risk
table, as originally generated, did not include it at all. Separately,
`docs/ERROR_LOG.md` documents three distinct, real historical bugs in
exactly this code — a hardcoded path that broke genesis-block generation, a
hardcoded `localhost` value that would have silently broken multi-container
networking, and a YAML merge-key mistake that silently dropped TLS
configuration from every generated container (caught only by a human reading
resolved output line by line, since the tooling itself validated cleanly).
None were caught by an automated test, because none existed then or now.

**How it was caught matters as much as what was caught.** None of this
evaluation's automated steps — generation, isolation verification, or the
automated spot-check — surfaced this. It was found only when a human read
all seven files together and noticed the same component described as
critical in one file, untested in another, and absent from the risk table in
a third. This is the direct evidentiary basis for Recommendation 1 (Section
10).

**Correction applied.** Because the evidence is specific and verified (three
named incidents, not speculation), a row was added directly to `CONCERNS.md`,
consistent with that file's own stated provenance (`source: code-derived +
workshop`), which already anticipates human-verified additions. No other
generated file was edited.

---

## 7. Comparison: Existing Documentation vs. Generated Documentation

| Dimension | Existing project documentation | Generated documentation |
| --- | --- | --- |
| **Primary content** | Decisions made, why they were made, alternatives considered and rejected, chronological evolution, and a dated record of real bugs and their resolutions | A snapshot of what the code currently does, structured by a fixed template |
| **Captures rationale ("why")** | Yes — extensively, with named provenance in several cases | No — explicitly out of scope for a code-only generation process |
| **Captures evolution ("how it got here")** | Yes — phase-by-phase build log | No |
| **Captures operational/debugging knowledge** | Yes — dated, incident-level detail (Section 6.3) | No |
| **Source of truth** | Human-authored, incrementally, over the project's real history | Automated, generated fresh from current source in a single pass |
| **Staleness risk** | Requires discipline to keep current as the project changes; can drift from the code if not updated | Regenerable on demand; reflects the code as of generation time by construction |
| **Verification burden before trusting** | Already trusted by the team that wrote it, though not independently spot-checked in this evaluation | Required and received both automated spot-checking and independent human review in this evaluation before being trusted |
| **Best used for** | Understanding why the system is shaped the way it is, and what has already gone wrong operationally | Fast orientation for someone new to the codebase, or a check on whether documentation has drifted from actual code |

---

## 8. Practical Outcome

Concretely, running Stage B on BLC-31 produced:

- Seven standardized `context/codebase/*.md` files, generated and verified
  as accurate against source (Section 6.1).
- One new, confirmed documentation gap (`blcgen`), added to `CONCERNS.md`
  with supporting historical evidence (Section 6.4).
- Several previously undocumented technical observations, now recorded
  (Section 6.2).
- No contradictions found between the generated files and the existing
  documentation, within the scope of what was compared (Section 6.3). This
  reflects agreement on the ground both document sets actually cover; it is
  not a claim that the existing documentation was exhaustively checked
  against every generated statement, or vice versa.

---

## 9. Strengths and Weaknesses of the Framework

**Strengths:**

- **Accuracy of code-derived output.** 20/20 spot-checked claims confirmed,
  including claims cited to specific line numbers.
- **Honest absence-reporting.** Where no evidence existed for something a
  template asked for, the generated files said so rather than inventing
  plausible-sounding content.
- **Forced verification over assumption.** The templates pushed agents to
  confirm things (e.g. CouchDB as the state database) from configuration
  rather than inferring them from reputation.
- **Effective parallel decomposition for this project's shape.** The four
  roles mapped cleanly onto real, largely independent seams in this
  codebase.
- **Genuine convergence, not just independence.** The `CONVENTIONS.md`
  gotcha (Section 6.3) shows code-derived generation can reconstruct real
  historical lessons purely from the fingerprints they leave in code.

**Weaknesses, each paired with its corresponding recommendation in Section
10:**

- **The isolation instruction is underspecified** (→ Recommendation 3). "Do
  not read these files" does not account for a codebase where those files
  are referenced by name throughout the source, nor for a broad search
  incidentally surfacing an excluded file's name — both of which happened
  here.
- **No documented recovery procedure for an interrupted run** (→
  Recommendation 4). The self-reported-tool-history verification used here
  was invented for this test and is unvalidated as a general approach.
- **A genuine cross-cutting risk fell through the seams of the four-way
  split** (→ Recommendation 2). The `blcgen` finding was only visible by
  reading all seven files together — something no single generating agent
  was tasked to do.
- **Operational knowledge is structurally unreachable from source code
  alone** (→ Recommendation 6). This is not a fixable defect in generation —
  it is an inherent limit of "code is ground truth" as a premise.
- **Template size limits were not meaningfully tested** (→ Recommendation
  5). No file came close to the 300-line guideline, but BLC-31 is a small,
  cleanly modularized, single-narrator codebase; this should not be assumed
  to hold on a larger or more heterogeneous project.

---

## 10. Recommendations

1. **Treat independent human review of the seven generated files as a
   required step, not an optional one.** This evaluation's single most
   consequential finding (the `blcgen` gap) was not caught by generation,
   isolation verification, or the automated spot-check — three separate
   steps that all completed cleanly without flagging it. Only a human
   reading all seven files together found it. A Stage B run that stops at
   automated generation and verification would have shipped this
   evaluation's report without that finding.
2. **Add an explicit cross-file consistency check as a final step of Stage
   B.** After the four files are generated, add one pass (human or agent)
   checking whether anything `ARCHITECTURE.md` marks as load-bearing has
   zero coverage in `TESTING.md` and no entry in `CONCERNS.md`. This is a
   systemic fix for a decomposition problem, not a BLC-31-specific one.
3. **Tighten the isolation instruction's wording** to explicitly require
   that any repository-wide search exclude the withheld files' paths, not
   just forbid directly opening them.
4. **Add a documented procedure for interrupted or partial generation
   runs**, including what evidence is sufficient to trust and reuse partial
   work versus when to discard and restart.
5. **Re-test Stage B on a larger, more heterogeneous codebase** before
   drawing conclusions about template size limits or isolation robustness at
   scale.
6. **Do not automatically merge operational/historical documentation into
   the generated files.** A deliberate, human-reviewed step that proposes
   candidate `CONCERNS.md` additions drawn from existing incident logs is
   reasonable; an automatic merge is not — it would quietly blend two
   document sets whose separation is part of their value.

---

## 11. Lessons Learned

- **An agent's self-report of its own behavior should be checked, not
  trusted outright.** The isolation-verification step only caught a real
  (if minor) leak because it was independently checked.
- **An automated spot-check materially changes how much confidence is
  justified in factual accuracy**, and is worth its cost — it is what
  allowed this report to state "20 of 20 held up" as a checked fact, and
  what caught the one imprecision found.
- **That automated spot-check is not a substitute for independent human
  review.** The spot-check confirms individual claims are accurate; it has
  no way to notice that a true claim in one file, a true claim in a second,
  and a true absence in a third together describe a real risk none of them
  states alone. Generation, isolation verification, and the automated
  spot-check all completed cleanly without surfacing the `blcgen` gap; only
  a human reading all seven files together found it.
- **Keyword search is not a substitute for reading a document in full when
  checking for absence of information.** The first pass through
  `docs/ERROR_LOG.md` used keyword search and concluded nothing further was
  missing; a full read afterward found three additional, material findings
  the keyword search had no way to surface.
- **Clean parallel decomposition can still leave a seam no individual piece
  is responsible for.** The four-way split that made generation fast and
  accurate is the same structural choice that let a genuinely important
  risk go unflagged, because no single agent's task included synthesizing
  across the others.

---

## 12. Overall Assessment

Stage B, as tested on this one project, produced accurate, genuinely useful
output and surfaced real findings the project's existing documentation did
not have. It did not produce anything that could stand in place of that
existing documentation — Section 6.3's findings show why that would be a
category error, not a close call.

The process weaknesses found are real and, in the `blcgen` case,
consequential enough that this evaluation would not recommend running Stage
B unattended on a project where the output would be trusted without a
subsequent human review pass. With that caveat, and with the fixes in
Section 10 applied, Stage B appears to be a reasonable, moderate-effort
addition to how this team onboards into unfamiliar or drifted codebases.

This assessment is based on a single project and should be treated as a data
point, not a conclusion about the framework's general reliability.
