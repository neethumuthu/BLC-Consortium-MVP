# BLC-31 — Certificate UI: Scope and Architecture

Originally drafted as a discussion starter for the 2026-07-27 Szymon/Neethu
sync; updated after that sync with the decisions actually made. Sections
below are now split into **settled** (from that meeting) vs. still open.

## What's already confirmed, not up for debate

- **Ownership**: UI work is mine (confirmed in Slack, 2026-07-24 —
  Dominik: "please leave UI to Neethu").
- **Scope boundary**: certificate issue/verify/revoke UI, **not**
  org-onboarding UI. Aga's framing (from the call) is the reference
  distinction — org onboarding is rare, ceremony-driven, and already
  hard via API; certificate actions are frequent, administrator-facing,
  and the actual daily-use surface of the product.
- **No backend changes required** — the NestJS Fabric Gateway's 7
  REST endpoints (issue, get, verify, revoke certificates; list/get
  institutions; get certificates by institution) already exist,
  Swagger-documented, and are what the UI would call directly.

## Proposed MVP scope

**In scope:**
1. Issue a certificate (holder name, holder details, metadata) — form
   → POST, show the returned certificate ID.
2. Verify a certificate by ID — show VALID / TAMPERED / REVOKED
   clearly, with the certificate's stored details.
3. Look up a certificate by ID (read-only detail view).
4. List certificates by institution.
5. List active institutions (read-only — supports the "who's in the
   consortium" context, not an admin action).
6. Revoke a certificate (issuer-only — UI should reflect/enforce this
   the same way the API does, i.e. only show the revoke action when
   acting as the issuing institution).

**Explicitly out of scope for this pass** (confirm this stays true
Monday, don't let it silently expand):
- Institution onboarding / adding a new organization — confirmed
  deprioritized by Dominik on the call ("wouldn't do it... not
  reasonable to invest much time for the POC").
- Governance/voting UI (ProposeNewMember/CastVote) — flagged by Aga as
  "actually pretty easy" and a plausible fast-follow, but not part of
  this first cut. Worth explicitly asking Monday whether it's worth
  bundling in now since it was called out as low-effort, or staying
  strictly certificate-only for a cleaner first milestone.
- Batch operations (Aga's "checking in batch... when there are
  multiple students" idea) — noted as a future possibility, not MVP.

## Settled 2026-07-27 — multi-institution UI shape

**Decision: Option 2 — a single, shared, multi-tenant UI** (illustrative
example given in the meeting: `appblc.com` — a placeholder name, not a
registered domain or confirmed asset), not one deployment per
institution (Option 1, which is what this doc originally leaned toward
recommending — that recommendation is superseded by this decision, not
still in effect).

Rationale from the meeting: easier to maintain as the number of
institutions grows (Option 1 means maintaining N separate UI deployments
long-term), better/more cohesive enterprise-grade user experience, and it
better matches the current backend's overall design intent. Mechanically:
single login, and depending on which institution the logged-in user
belongs to, the UI shows that institution's own data/features (founder
sees founder-level views, Institution A sees Institution A's data, etc.)
— the UI is responsible for routing each user's requests to the correct
backend/API context for their organization.

Note this changes the trust-boundary story from the demo: previously,
"Institution A can't revoke Institution B's certificate" was enforced by
Institution A's backend instance simply never holding Institution B's
signing key. In a shared UI, that enforcement must now happen via
login/access-control logic (session identifies the org, UI/API restricts
actions to that org), not by physical separation of backend instances —
worth keeping in mind as the auth model for the shared UI gets designed,
since the "zero HTTP auth" decision (see below) was made for the
per-instance model, and this shared-UI model reintroduces a login concept
that decision didn't originally have to account for.

Both Aga and Dominik will be treated as stand-in "clients" during this
frontend phase (Szymon's suggestion, agreed) — e.g. treating Aga as if
from "University 1" and Dominik as "University 2" — to exercise gathering
and acting on feedback the way a real client engagement would, even
though this is still internal/pre-sales work.

## AI exploration — separate track, not part of the UI build itself

Szymon is researching an AI-powered tool/service to let clients customize
their view of the shared UI without the team needing to build and
maintain N bespoke UIs by hand — framed explicitly as **low-risk internal
R&D**, not a committed feature: a company-wide 2026 goal to build internal
AI expertise ("if not, we will be lagging behind the competition"), using
this project as a safe sandbox specifically because it's not yet a live
client engagement. Scope, if it goes anywhere: **certificate management
only** (issue/verify/revoke/search) — governance/institution-onboarding
automation was explicitly called out as too complex for this to touch,
same reasoning as the earlier onboarding-API deprioritization (Fabric
onboarding requires real crypto-material generation and config-file
updates, not something an AI customization layer could safely automate).

**Correction on "Fable":** an earlier version of this doc guessed at
what Szymon's "Fable" mention referred to — that guess was wrong. The
2026-07-27 meeting transcript instead names it as a "FABL-AA tool," a
specific reference Neethu asked about directly. Szymon's answer
describes it only in generic terms (an AI tooling/automation experiment
tied to the company's broader 2026 AI-learning goal, not yet concretely
defined — he said he "tested it," it "would take much more time than
initially expected," and he'll "share it with the team"). The actual
tool's identity is still unconfirmed pending Szymon's write-up — don't
assume any interpretation is correct until he shares concrete details.

## Still open

- **Frontend stack** — not decided in either meeting. The draft's
  reference to an "earlier Certificate Generator PoC frontend" as a
  precedent could **not be verified in this repo** (only `blcgen`, the
  unrelated Go network-config generator, was found). If that PoC exists,
  confirm where it lives before treating it as precedent — it may be a
  mix-up with the earlier Polygon POC that was migrated away from.
- **Styling/branding** — Szymon noted (2026-07-24 call, 39:33) that
  styling is intentionally deferred until there's a real client or
  public-site use case. Not revisited in the 2026-07-27 meeting; assume
  still deferred until stated otherwise.
- **Auth model for the shared UI** — the backend's original "no HTTP
  auth" decision was scoped to the per-instance/localhost-only demo
  model. Now that a shared UI with login is the direction, some form of
  auth (even if minimal) is implied by "single login routes users to
  their org's data" — this wasn't explicitly re-discussed as a backend
  change, worth raising before assuming the existing no-auth backend
  needs no changes to support a real login flow.

## Suggested starting point, if asked "what's the very first slice"

Given the demo's own natural narrative arc (issue → verify → revoke →
cross-institution rejection), the smallest genuinely useful UI slice is
probably: **one page, one institution's certificates — issue, view,
verify.** Revoke and the institution list/switcher are the natural
second slice once the first is proven against the real backend.
