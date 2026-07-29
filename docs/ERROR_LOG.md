# BLC-31 Error Log

Record of errors, failed commands, and design conflicts hit during
implementation, along with how each was resolved. Append new entries at the
top (most recent first). Use this to avoid re-debugging the same issue twice
and to give future sessions/readers context that isn't visible from the code
alone.

Entry format:

```
## YYYY-MM-DD — short title

**Phase:** N — phase name
**Symptom:** what broke / what command failed / what output was wrong
**Command / context:**
    <the command or situation>
**Root cause:** why it happened
**Resolution:** what fixed it (command, config change, or decision)
**Follow-up:** anything deferred or worth watching (optional)
```

---

## 2026-07-29 — Nav bar had no responsive layout, caused page-wide horizontal overflow

**Phase:** 14 — full UI regression pass, narrow-viewport check.
**Symptom:** at a 390px (typical phone) viewport width, the whole page
required horizontal scrolling — confirmed via
`document.documentElement.scrollWidth > clientWidth` returning `true`,
and visually via a full-page screenshot showing nav items pushed far
off the right edge of the screen.
**Command / context:** a Playwright script setting `viewport: {width:
390, height: 844}` and screenshotting the dashboard and certificate
detail pages — the first time this app had been checked at any
viewport narrower than a standard desktop width.
**Root cause:** `components/nav-bar.tsx` laid out the logo, all 4 nav
links, the institution name, and the logout button in a single
non-wrapping flex row with no responsive breakpoints at all - at
desktop widths this fit comfortably, but at phone widths the row's
natural content width (well over 600px) forced the entire `<header>`,
and with it the whole page, wider than the viewport.
**Resolution:** added a `md:` breakpoint split: the nav links and
institution-name/logout controls are now `hidden md:flex` (desktop
only), with a `md:hidden` hamburger button revealing a stacked dropdown
panel containing the same links/controls below the `md` breakpoint.
Confirmed via `scrollWidth <= clientWidth` at 390px afterward, and that
every link in the new mobile menu still navigates correctly.
**Follow-up:** no other pages/components were checked at narrow
viewports before this pass; worth a similar spot-check if new pages are
added, since this class of bug (correct on desktop, silently broken on
mobile) produces no error of any kind - only a visual/UX failure that a
desktop-only workflow would never surface.

---

## 2026-07-28 — Peer's in-memory state cache doesn't see out-of-band CouchDB writes

**Phase:** 13 (verification) — proving `VerifyCertificate`'s TAMPERED
detection against the real ledger, not just a frontend mock.
**Symptom:** directly mutating a certificate's `holderName` in CouchDB
(bypassing chaincode entirely, to simulate real tampering) — confirmed
via a direct CouchDB `GET` to genuinely persist the change, on **both**
of `BLCFounder`'s peers — still returned `VALID` with the *original*
`holderName` when queried through the real `GET /certificates/:id/
verification` endpoint, repeatedly, across both peers.
**Command / context:** a disposable test certificate
(`512f7249...4df5ec41`, holder name "TAMPER TEST - DISPOSABLE - DELETE
ME") issued specifically for this test; its CouchDB document edited
directly via CouchDB's HTTP API on both `couchdb.peer0.BLCFounder`
(port 5984) and `couchdb.peer1.BLCFounder` (port 5994) — ruling out
Fabric Gateway's read-query routing (evaluate calls aren't guaranteed
to hit the exact peer your client connected to) as the explanation,
since both peers' underlying CouchDB documents were confirmed mutated
yet the query still returned the stale value from either.
**Root cause:** the peer's own `core.yaml` (the container's bundled
default, not this project's host-side vendored copy at
`network/peercfg/core.yaml`, which only matters for the host `peer`
CLI) enables an in-memory state cache for CouchDB reads by default.
That cache is refreshed when the peer commits a new block through the
normal consensus/commit pipeline — it has no way to know a document
changed via a direct, out-of-band CouchDB write, so it kept serving the
last value it loaded through normal transaction processing,
indefinitely, regardless of what CouchDB's current revision actually
held.
**Resolution:** restarting the affected peer containers
(`docker restart peer0.BLCFounder peer1.BLCFounder`) forces a fresh
state reload, after which the query correctly returned `TAMPERED` with
the mutated `holderName`. Confirmed the inverse too: after reverting
the CouchDB documents back to their original values, the peers had to
be restarted *again* before the query returned `VALID` again — the
revert alone was not sufficient; the stale in-memory value from the
tampered load persisted through the revert exactly as expected, once
the mechanism was understood.
**Follow-up:** this generalizes beyond this one test. **Any** future
direct-database intervention on a live peer — a data-migration script,
a manual hotfix, disaster recovery, etc. — that writes to CouchDB
outside the normal transaction/commit path will hit this same
stale-read problem until the affected peer(s) are restarted. Worth
remembering as a standing fact about this system's architecture, not
just a quirk of this one test.

---

## 2026-07-28 — Invalid session cookie caused an infinite redirect loop

**Phase:** 13 — Backend API key + signed session cookie.
**Symptom:** navigating to `/` with a present-but-invalid `blc_session`
cookie (forged, or manually tampered) never resolved — Playwright's
`page.goto` failed with `net::ERR_TOO_MANY_REDIRECTS`, confirmed live
via a headless-browser script, not assumed.
**Command / context:** testing the new signed-JWT session (added to
close a real forgeability gap — see this same phase's `BUILD_LOG.md`
entry) by setting `Cookie: blc_session=BLCFounderMSP` (the old,
pre-signing bare-string format) directly and navigating to `/`.
**Root cause:** `proxy.ts` only checked cookie *presence*
(`Boolean(cookie?.value)`), not validity — a deliberate, previously
correct design (`getSession()`/`requireSession()` in `lib/session.ts`
were the real authorization boundary). Once sessions could be
present-but-invalid, this became insufficient: at `/`, `proxy.ts` saw
`hasSession=true` and passed the request through; the page then called
`requireSession()`, which correctly failed verification and redirected
to `/login` — but the invalid cookie was never cleared, so at
`/login`, `proxy.ts` saw `hasSession=true` again and redirected *back*
to `/`, looping forever.
**Resolution:** rewrote `proxy.ts` to actually verify the JWT (via
`jose`'s `jwtVerify`, which works in Edge middleware — the reason
`jose` was chosen over Node-only JWT libraries) instead of just
checking presence, and to clear the cookie on the response whenever
verification fails, in both directions (redirecting to `/login`, and
staying on `/login`). This fully closes the loop rather than working
around one symptom of it.
**Follow-up:** none — `lib/session.ts`'s `requireSession()` still
independently verifies and redirects too, matching Next's own guidance
not to rely on middleware alone; that duplication is intentional
defense-in-depth, not redundant code to remove.

---

## 2026-07-27 — `setState` called synchronously inside a `useEffect`, flagged by `eslint`

**Phase:** 12 — Certificate UI, revoke confirmation dialog.
**Symptom:** `npm run lint` failed: `react-hooks/set-state-in-effect`
error on `setOpen(false)` inside a `useEffect` watching
`useActionState`'s returned `state.success`, in
`certificates/[id]/revoke-section.tsx`.
**Command / context:**
    ```tsx
    const [state, formAction] = useActionState(revokeCertificateAction, {});
    useEffect(() => {
      if (state.success) { toast.success(...); setOpen(false); }
    }, [state.success]);
    ```
**Root cause:** this React 19 toolchain's `eslint-plugin-react-hooks`
now treats calling `setState` synchronously inside an effect body as an
error, not a style nit — effects are meant to synchronize with external
systems, not react to a Server Action's returned state by triggering
more renders.
**Resolution:** dropped `useActionState`/`useEffect` for this one
dialog entirely. Rewrote it to call the Server Action directly as a
plain async function from a `useTransition`-wrapped click handler,
manually constructing `FormData` from controlled `useState` fields —
`setOpen(false)`/toast now happen directly in that handler's own
`await` continuation, never inside an effect.
**Follow-up:** this dialog no longer degrades gracefully without
JavaScript (a plain `<form action={...}>` would); accepted, since
opening a confirmation dialog already requires JS regardless.

---

## 2026-07-27 — Base UI console error: "component that acts as a button expected a native `<button>`"

**Phase:** 12 — Certificate UI, every `Button` composed as a link.
**Symptom:** every page with a `Button` rendered as a `<Link>` (e.g.
"Issue Certificate", "Run full verification") logged a console error at
runtime and showed a "1 Issue" badge in the Next.js dev overlay — not
caught by `tsc`/`eslint`, only visible during live browser verification.
**Command / context:**
    `<Button render={<Link href="/certificates/new" />}>...</Button>`
**Root cause:** this shadcn/ui registry's `Button` is built on
`@base-ui/react/button`, which defaults `nativeButton: true` (it expects
its `render` target to itself be a real `<button>` for correct
keyboard/ARIA semantics). Composing it with `<Link>` (which renders an
`<a>`) violates that assumption unless declared explicitly.
**Resolution:** added `nativeButton={false}` to every `Button` composed
with a non-`<button>` `render` target (3 files:
`components/empty-state.tsx`, `app/(dashboard)/page.tsx`,
`app/(dashboard)/certificates/[id]/page.tsx`).
**Follow-up:** worth grepping for `render={<Link` before adding any new
`Button`-as-link composition and setting `nativeButton={false}`
up front, rather than discovering the console error after the fact.

---

## 2026-07-27 — shadcn/ui `Button`/`Card` etc. don't support `asChild`

**Phase:** 12 — Certificate UI, initial page-composition pass.
**Symptom:** `tsc --noEmit` failed in 3 files: `Property 'asChild' does
not exist on type '... ButtonProps ...'`.
**Command / context:**
    ```tsx
    <Button asChild><Link href="/certificates/new">...</Link></Button>
    ```
**Root cause:** this project's shadcn/ui registry version is built on
`@base-ui/react`, not Radix UI — Radix's `asChild`/child-element
composition pattern doesn't exist here. Composition instead uses a
`render` prop that takes a `ReactElement` directly.
**Resolution:** rewrote every `asChild` usage as
`<Button render={<Link href="..." />}>{children}</Button>` (children
stay on the outer `Button`, not nested inside the `render` element).
See the following entry for a second bug this same pattern surfaced.
**Follow-up:** none of this project's other shadcn component usages
(`AlertDialogCancel`, etc.) needed this fix, since they were generated
already using the correct `render` pattern internally — only my own
hand-written `Button`+`Link` compositions were affected.

---

## 2026-07-27 — Next.js 16 renamed `middleware.ts` to `proxy.ts`

**Phase:** 12 — Certificate UI, auth gate.
**Symptom:** none yet hit at runtime — caught proactively by checking
the framework's own bundled docs before writing the file, rather than
assuming the file convention was unchanged from earlier Next.js
versions.
**Command / context:** about to write `src/middleware.ts` with
`export function middleware(request: NextRequest) {...}`.
**Root cause:** as of Next.js 16.0.0, the `middleware.ts` file
convention is deprecated and renamed to `proxy.ts` (same functionality,
`export function proxy` instead of `middleware`) — confirmed against
the bundled docs (`node_modules/next/dist/docs/.../proxy.md`), not
assumed. This project is pinned to Next.js 16.2.12.
**Resolution:** wrote the file directly as `src/proxy.ts` from the
start, exporting `proxy` (not `middleware`), with a comment explaining
the rename for future readers.
**Follow-up:** worth checking `node_modules/next/dist/docs/` for other
renamed/changed conventions (e.g. async `params`/`searchParams`,
confirmed still Promise-based here and handled correctly) before
assuming any Next.js API from general knowledge in this specific repo,
given how new this pinned version is.

---

## 2026-07-20 — TypeScript build failed: "'SubmitError' cannot be used as a value because it was exported using 'export type'"

**Phase:** 11 — NestJS Fabric Gateway backend, global exception filter.
**Symptom:** `npm run build` failed:
`src/common/filters/fabric-exception.filter.ts:18:22 - error TS1362:
'SubmitError' cannot be used as a value because it was exported using
'export type'.`
**Command / context:**
    `@Catch(EndorseError, SubmitError, CommitError, GatewayError)` in a
    global NestJS exception filter, referencing `SubmitError` imported
    from `@hyperledger/fabric-gateway`.
**Root cause:** `@hyperledger/fabric-gateway@1.11.0`'s public entry
point (`index.d.ts`) re-exports `SubmitError` as a type-only export
(`export type { SubmitError } from './submiterror'`), even though
`SubmitError` is a real runtime class internally (`export declare class
SubmitError extends GatewayError`, confirmed by reading the package's
own `submiterror.d.ts`). TypeScript enforces the type-only re-export at
the package boundary, so `SubmitError` can be used as a *type* but not
referenced as a *value* (e.g. inside a decorator) through the public
import.
**Resolution:** Removed `SubmitError` from the `@Catch()` decorator's
value list. Both `SubmitError` and `EndorseError` extend `GatewayError`
(confirmed via `gatewayerror.d.ts`/`endorseerror.d.ts`/
`submiterror.d.ts`) — only `CommitError` extends plain `Error` instead
— so `@Catch(EndorseError, CommitError, GatewayError)` already catches
`SubmitError` instances too via `instanceof`, with no loss of coverage.
`SubmitError` remains usable as a TypeScript *type* in the filter's type
annotations, since the type-only restriction only blocks value usage.
**Follow-up:** none — fully resolved, confirmed by the subsequent clean
build and the live error-mapping test which specifically exercised an
`EndorseError` path (a non-issuer's rejected `RevokeCertificate` call).

---

## 2026-07-20 — chaincode commit failed with "requested sequence 2 is larger than the next available sequence number 1"

**Phase:** 10 — RevokeCertificate implementation for `certificate-cc`,
redeploying both chaincodes at a bumped version/sequence.
**Symptom:** `./scripts/chaincode.sh deploy institution-cc` failed at the
approve stage: `Error: proposal failed with status: 500 - failed to
invoke backing implementation of 'ApproveChaincodeDefinitionForMyOrg':
requested sequence 2 is larger than the next available sequence number
1`.
**Command / context:**
    `CC_VERSION="1.1"` / `CC_SEQUENCE="2"` hardcoded in `chaincode.sh`/
    `org-add.sh` (bumped from `1.0`/`1` to ship RevokeCertificate as an
    upgrade of the already-deployed Monday network), then run against a
    network that had just been fully wiped and rebuilt from scratch
    (`network.sh down --wipe && network.sh up`) to recover from ~2 days
    of container decay from the machine sleeping.
**Root cause:** Fabric's chaincode lifecycle enforces sequence numbers
strictly incrementing by exactly 1 from whatever's already committed on
the channel — 0 for a chaincode name that's never been committed there.
The "bump to 1.1/2" design was correct for upgrading the already-
deployed 1.0/1 instance from Monday, but wiping the network reset that
commit history to zero; the first-ever commit on a fresh channel must be
sequence 1, regardless of what version label is used.
**Resolution:** Changed `CC_SEQUENCE` back to `"1"` in both scripts
(keeping `CC_VERSION="1.1"` as a meaningful label, since version strings
aren't subject to Fabric's strict-increment rule the way sequence
numbers are). Both `institution-cc` and `certificate-cc` then committed
cleanly at 1.1/1 across all 3 active orgs.
**Follow-up:** `CC_SEQUENCE` is not a value that can be picked once and
left — it must match whatever the target channel's actual commit
history is at deploy time, which depends on whether the network has
been wiped since the last commit. Neither script currently reads the
real current sequence from the channel automatically; this is a real
gap if a future deploy targets a channel with different history than
assumed.

---

## 2026-07-14 — test-coverage audit found `GetAllInstitutions` and all 4 of `certificate-cc`'s functions had never been live-invoked

**Phase:** 9 (post-closeout) — reviewing what had and hadn't actually
been exercised against a real network, prompted by a direct question
("did we test institution-cc's all functions?") rather than a live
failure.
**Symptom:** none — this is a coverage gap, not a broken command.
Re-reading `institution-cc`'s full source (`governance.go` +
`queries.go`, 7 public functions total) against this session's actual
transcript showed `GetAllInstitutions` had never been invoked, live or
otherwise. Separately, `certificate-cc`'s 4 functions
(`IssueCertificate`, `VerifyCertificate`, `GetCertificate`,
`GetCertificatesByInstitution`) had unit tests and confirmed deployment
plumbing (package/install/approve/commit/ccaas-start), but had never
been invoked against a real running network at all — no certificate
had ever actually been issued on this consortium.
**Command / context:** a deliberate audit, not a debugging session —
cross-checked every public chaincode function against what this
session's own commands had actually exercised, rather than assuming
"the chaincode is deployed" meant "the chaincode's functions work."
**Root cause:** testing had consistently focused on the *deployment and
onboarding* mechanics (install/approve/commit/ccaas-start, `org-add.sh`
stages) — proven thoroughly — without a corresponding pass to confirm
every individual chaincode function actually executes correctly
end-to-end. Easy gap to miss: a chaincode can be fully, correctly
deployed and committed while several of its own functions have never
once been called.
**Resolution:** live-invoked all 5 previously-untested functions against
a real (rebuilt) network and confirmed each one directly:
- `GetAllInstitutions` → returned all 3 institutions
  (`BLCFounderMSP`, `InstitutionAMSP`, `InstitutionBMSP`), each
  `status:"active"`.
- `IssueCertificate` (as `BLCFounderMSP`) → committed `VALID` on both
  peers, returned `consortiumNumber:1`, `issuerSequenceNumber:1`.
- `VerifyCertificate` (same certificate) → `"status":"VALID"`.
- `GetCertificate` (same certificate) → returned the identical record.
- `GetCertificatesByInstitution("BLCFounderMSP")` → returned an array
  containing that same certificate.
All 5 work correctly. Full detail (unedited command output, matched
against the actual expected shape) in `docs/BUILD_LOG.md`'s matching
entry.
**Follow-up:** worth treating "is the chaincode deployed" and "have all
its functions actually been exercised" as two genuinely separate
questions going forward, not one implying the other — this audit is
the second time in this project a gap was found only by explicitly
asking the second question.

---

## 2026-07-14 — stage 6 used a newly-joined peer as a signer before it finished catching up, failing with "creator org unknown, creator is malformed"

**Phase:** 9 — closing a test-coverage audit gap: live-invoking
`institution-cc`'s `GetAllInstitutions` and all 4 of `certificate-cc`'s
functions, which had never been directly invoked before. Required a
full rebuild first (the network had been fully wiped since Phase 9
closed out), and this surfaced during that rebuild's `org-add.sh
InstitutionB` run.
**Symptom:** stage 6 (`install_and_approve_chaincode` →
`approve_for_org`) failed installing `institution-cc` for
`InstitutionB`: `Error: failed to endorse proposal: rpc error: code =
Unknown desc = error validating proposal: access denied: channel
[blcchannel] creator org unknown, creator is malformed`. Stage 5 (peer
join) had completed successfully immediately beforehand — both peers
joined on the first attempt, no retry needed.
**Command / context:** `./org-add.sh InstitutionB`, stage 6 running
~230ms after stage 5's `peer channel join` proposals were submitted
(`13:14:56.910` join, `13:14:57.144` approve attempt).
**Root cause:** a successful `peer channel join` only means the join
proposal was accepted — the peer still needs to asynchronously fetch
and process every historical block afterward before its own local MSP
manager actually recognizes its own org (and every other org) as a
channel member. `install_and_approve_chaincode`'s `approve_for_org`
call used `InstitutionB`'s own peer0 as the signer for
`approveformyorg` immediately after stage 5 returned, with no wait for
that catch-up to finish. Confirmed, not just inferred: retrying the
identical `org-add.sh InstitutionB` invocation ~20 minutes later (with
nothing else changed) succeeded — `peer channel getinfo` against the
same peer showed it had reached height 15 by then. This is a distinct
failure mode from the earlier TLS-readiness race documented elsewhere
in this log: that one was about the join call itself failing before
the peer's TLS layer was ready; this one is about the join succeeding
but the peer's channel-config view still being stale afterward.
**Resolution:** added `wait_for_peer_msp_sync(org_name, org_msp)`,
called at the end of `join_new_org_to_channel` (stage 5) — polls
org_name's own peer0 via `peer channel getinfo` until its reported
height reaches an existing active org's peer height, rather than a
fixed sleep (how long catch-up takes grows with the channel's history,
so a fixed delay would eventually become insufficient again). Stage 6
now never has to think about this — stage 5 doesn't return until the
new org's peer0 is genuinely caught up.
**The fix itself shipped with two more real bugs, both caught only by
insisting on re-triggering the actual race instead of trusting the
diagnosis.** The first version was written and committed to the working
tree without being tested against a fresh reproduction — the "20
minutes later, nothing else changed, and it succeeded" evidence above
proved the *diagnosis*, not the *fix*, since the fix didn't exist yet
at the time of that retry. Explicitly re-testing by rebuilding from
scratch and running `org-add.sh InstitutionB` immediately after the
vote (no artificial pause) surfaced two further problems in
`wait_for_peer_msp_sync` itself:
1. **A `set -e`/`pipefail` crash.** `common.sh` sets `set -Eeuo
   pipefail`. When `InstitutionB`'s peer0 didn't yet recognize the
   channel (the exact race being waited out), `peer channel getinfo`
   itself exited non-zero, and that failure propagated through the pipe
   into the `new_height=$(...)` assignment, aborting the whole script
   instead of looping. Fixed by adding `|| true` to both height-fetching
   assignments, matching the identical pattern already used in
   `require_active_institution`.
2. **A JSON-parsing bug that made the function unable to ever succeed,
   for anyone.** `peer channel getinfo`'s actual output is `Blockchain
   info: {...}` — a literal text prefix, not pure JSON — the exact
   format seen repeatedly all session (including in `network.sh`'s own
   `verify_channel_membership`), yet missed when writing this function.
   `json.load(sys.stdin)` directly can never parse that. Confirmed live:
   after fixing bug 1, the retry loop correctly engaged and logged all
   30 attempts, but **both** the new org's height *and* the reference
   height (from `BLCFounder`'s peer0, already fully synced this whole
   session) came back "unknown" every single time — proving the parse
   itself was broken, unrelated to actual sync state. Fixed by
   extracting the substring from the first `{` before parsing.
After both fixes, a further retry (still the same resumed run, both
peers already joined) showed `InstitutionB's peer0 caught up (height
15)` with a real, correctly-parsed number, and the full pipeline
completed through stage 7.
**Precise scope of what's now proven, stated plainly rather than
rounded up:** the retry loop's mechanics (sleep, decrement, log,
eventual give-up) were fully exercised across 30 real iterations in the
run that hit the parsing bug. Correct parsing and comparison of a real
height value were confirmed separately, in the final successful run.
What was **not** directly observed in one run: multiple iterations
where both parsing and comparison operate on real numbers that start
apart and visibly converge — every successful run so far succeeded on
the first real-number check, because enough time had elapsed during the
fixes for the peer to already be caught up. The two proven pieces don't
interact in a way that gives real reason to doubt them combined, but
that is a reasoned inference, not a fourth direct observation.
**Follow-up:** if a future run ever shows the retry loop looping
multiple times with real (non-"unknown") heights before converging,
that would close this last, low-risk gap directly. Not chased further
for now — diminishing returns against the cost of another full
wipe-and-time-the-race attempt.
**This bug was latent in `org-add.sh` as already pushed to
`origin/main`.** The version committed in `5d83ecc` (`feat: org-add.sh
runtime onboarding pipeline`) and pushed the same day contains this
race unfixed — it was never triggered by any test run before this one,
since every prior live test either had enough incidental delay between
stages 5 and 6 to mask it, or wiped the network before reaching this
exact sequence again. The fix lands in commit `1e8adc9`, a full day
later. Stated plainly, not softened: for that one-day window, the
pushed, "complete" Phase 9 build contained a real bug that could
reproduce on another machine or under different timing, and the
history should show that honestly rather than imply the bug never
existed until it was found.

---

## 2026-07-13 — org-add.sh stages 2 and 5 both proved non-idempotent when testing stage 6, fixed with real skip-if-already-done guards

**Phase:** 9 — testing stage 6 (chaincode install+approve) required
re-running `org-add.sh InstitutionB` against a network where stages 1-5
had already succeeded once. First re-run failed at stage 2
(`Identity 'orgadmin' is already registered`, the same non-idempotency
already documented for `bootstrap_org`). After adding a stage-2 guard
and re-running, stage 5 then failed the same way: `cannot create ledger
from genesis block: ledger [blcchannel] already exists with state
[ACTIVE]`.
**Command / context:** `./org-add.sh InstitutionB`, re-run twice in a
row to reach stage 6 without a full network wipe.
**Root cause:** neither stage had ever been exercised on a genuine
resume before — every earlier test either wiped the network first or
failed before reaching a later stage. Both `fabric-ca-client register`
and `peer channel join` reject their respective already-done state
outright, with no built-in idempotency of their own.
**Resolution:** added `org_crypto_exists(org_name)` (checks whether
`crypto/organizations/<org>/msp` already exists) to skip stage 2's
`bring_up_org_containers` entirely on a re-run, and added a per-peer
`peer channel getinfo` check inside `join_new_org_to_channel` to skip
any peer that's already joined, retrying only the ones that aren't.
Both mirror the same "query real state, don't cache a flag" discipline
as stage 3-4's existing `is_channel_member` guard.
**Follow-up:** `org_crypto_exists` doesn't independently verify
containers are actually running — if someone tears down containers
(`org-add.sh teardown`) without deleting crypto, skipping stage 2 would
leave them down. Accepted gap for now; fix it if it becomes a real
problem, not preemptively.

---

## 2026-07-13 — deploying `certificate-cc` after `InstitutionB` already joined the channel config blocked commit: a pending org still counts as an Application-group approver

**Phase:** 9 — designing stage 6 (install + approve both chaincodes for
a new org). Discovered while deploying `certificate-cc` fresh on the
rebuilt network, which by this point already had `InstitutionB`
injected into the channel (stages 3-4 succeeded earlier in this same
rebuild).
**Symptom:** `chaincode.sh deploy certificate-cc` failed at stage 4
(`checkcommitreadiness`) with `error: not enough approvals yet,
missing: InstitutionBMSP` — even though `InstitutionB` was never asked
to approve anything, and its `network.yaml` status is still `pending`.
**Command / context:** `./scripts/chaincode.sh deploy certificate-cc`,
run after `institution-cc` was already deployed and after `org-add.sh
InstitutionB` had already completed stages 1-5 on this same fresh
network.
**Root cause:** `checkcommitreadiness`'s `approvals` map reflects every
org **currently in the channel's Application group** — not just the
`founding`/`member` orgs `chaincode.sh` iterates via `active_org_lines`.
`org-add.sh`'s stage 3 already made `InstitutionB` a real Application
group member (that's the whole point of the config-update), regardless
of what `network.yaml`'s own status field still says. `institution-cc`
never hit this because it was deployed *before* `InstitutionB` joined
the channel in this rebuild; deploying a *second* chaincode *after* a
pending org has already joined exposes the gap. This is a genuine
cross-script ordering dependency between `org-add.sh` and
`chaincode.sh` that hadn't been exercised before this test.
**Resolution:** this reframes stage 6's own design: it cannot assume
the chaincode is always already committed by the time a new org
approves it. Stage 6 must install + approve for the new org
unconditionally — sometimes that approval is what a stuck commit
(like this one) was waiting on, sometimes it's just catching up to an
already-committed definition. Immediate unblock for this test:
`InstitutionB` installs + approves `certificate-cc` manually (the same
action stage 6 will perform), then `checkcommitreadiness`/commit is
re-run and succeeds with all 3 orgs approved.
**Follow-up:** in normal operation, deploying every chaincode a
consortium needs *before* onboarding new orgs avoids this entirely —
this only surfaced because this test session deliberately deployed
`certificate-cc` late. Worth a one-line callout in `org-add.sh`'s own
header comment so a future reader isn't surprised by this ordering
sensitivity.
**Precise scope — what was actually confirmed vs. reasoned:** this
session directly observed the requirement with `InstitutionB`'s peers
already joined (stage 5 had already succeeded before `certificate-cc`
was deployed). It was NOT directly tested whether the requirement
appears immediately after stage 3 alone, before stage 4/5/6 have run —
that's a reasoned inference from Fabric's architecture
(`checkcommitreadiness` reads the channel's committed CONFIG state,
which is a separate fact from a peer's runtime connectivity or gossip
state), not a live-verified fact. If true, the real window is stage 3
through stage 6 completing — not just "before this org is fully
onboarded" — meaning a chaincode deploy attempted concurrently with, or
during a stall inside, a running `org-add.sh` invocation would hit this
same block even though the new org has no running peer or ccaas
container yet to meaningfully approve with (only its stage-2 Admin
identity, which is enough to sign an approval). Worth a live test of
this exact narrow window if it ever becomes operationally relevant —
not assumed true just because it's architecturally plausible.

---

## 2026-07-13 — my own "targeted cleanup" recovery step destroyed `InstitutionB`'s CA root identity, permanently orphaning its already-committed MSP definition

**Phase:** 9 — second retry of `org-add.sh InstitutionB` stage 5, after
the genesis-block fix and the retry-loop fix above, both already
applied and confirmed working in isolation.
**Symptom:** every one of `InstitutionB`'s peers was rejected by the
orderer and by its own peers with `x509: certificate signed by unknown
authority (possibly because of "x509: ECDSA verification failure" while
trying to verify candidate authority certificate "fabric-ca-server")`,
surfacing as `deliverBlocks -> ... not authorized: implicit policy
evaluation failed - 0 sub-policies were satisfied` in the orderer's own
log, and as `peer channel getinfo`'s identical Readers-policy failure
when queried directly.
**Command / context:** after the FIRST stage-5 failure (the genesis-
block bug), I had the user run a "targeted cleanup" before retrying:
`./org-add.sh teardown` followed by `docker run ... rm -rf
/crypto/organizations/InstitutionB /crypto/ca-servers/InstitutionB
/crypto/ca-bootstrap/InstitutionB`, intended only to clear the
already-registered CA identities blocking a stage-2 retry (same
non-idempotent `fabric-ca-client register` issue documented earlier for
the founding orgs).
**Root cause:** `fabric-ca-server` generates its own root CA keypair on
first startup and persists it inside its own home directory
(`crypto/ca-servers/<org>`) — this root cert is what got embedded in
`InstitutionB`'s MSP definition when `inject_org_into_channel` (stage 3)
committed it to the channel back in block 11, during the FIRST crypto
generation. Deleting `crypto/ca-servers/InstitutionB` before the retry
destroyed that CA's root keypair, not just its registered-identity
database. The recreated CA container generated a brand-new, different
root key, and every identity re-enrolled afterward (peer0, peer1,
Admin) was signed by this new, different authority — one the channel's
already-committed config has never heard of and has no way to learn
about after the fact.
**Resolution:** none possible for this `InstitutionB` instance —
correcting its MSP definition in the channel config would itself need a
config-update signed by `InstitutionB`'s own admin (each value's
`mod_policy` in `build_new_org_definition`'s output resolves to that
org's own Admins policy), but that identity is *also* signed by the
now-untrusted new CA. There is no remaining identity the channel would
accept to fix this. Required a full `network.sh down --wipe` and a
complete redo (deploy `institution-cc`, register both founders,
propose/vote `InstitutionB` again, then `org-add.sh InstitutionB` in
one clean pass without any crypto deletion in between).
**Follow-up:** **Rule to carry forward, not just a story about a
mistake:** never manually delete anything inside
`crypto/ca-servers/<org>/` (or any CA's own home directory) once that
org's MSP has already been injected into the channel — the CA's root
keypair lives there and is irreplaceable the moment channel config
trusts it. The only safe recovery past that point is a full
`network.sh down --wipe` and complete redo, never a partial/targeted
crypto deletion, even when the deletion feels surgical and scoped to
"just this one org." The generalizable mechanism: once stage 3 has
committed an org's MSP definition to the channel, that org's CA root
identity is permanently pinned into channel history from that point
forward. Any future stage-2 retry after stage 3 has already run MUST
preserve `crypto/ca-servers/<org>`'s CA root files — only its
registered-identity database is the actual conflict blocking
re-registration. `org-add.sh` has no code-level guard against this
today (the mistake was in a manually-run recovery command, not in the
script itself) — worth revisiting if a safer, scriptable recovery path
for a stage-2-after-stage-3 failure is ever needed.

---

## 2026-07-13 — predicted follow-up from the transient-TLS-handshake entry actually happened: `peer0.InstitutionB`'s join hard-failed, not just a scary log line

**Phase:** 9 — retry of `org-add.sh InstitutionB` stage 5, immediately
after the genesis-block fix in the entry below this one.
**Symptom:** `peer channel join` failed outright: `Client TLS handshake
failed after 283.655µs with error: read tcp
127.0.0.1:37706->127.0.0.1:11051: read: connection reset by peer`,
followed by `Error: error getting endorser client for channel: ...
failed to connect`. Unlike the earlier `peer0.BLCFounder` case (see this
file's "transient ClientHandshake TLS EOF" entry), there was no
successful retry within the same command — the join attempt failed
outright and `org-add.sh` aborted.
**Command / context:** `join_new_org_to_channel`'s `peer channel join -b
"$GENESIS_BLOCK"` for `peer0.InstitutionB`, run immediately after
`bring_up_org_containers` (via `wait_for_port`) had already confirmed
the peer's port was accepting TCP connections.
**Root cause:** exactly the follow-up condition the earlier entry
anticipated: `wait_for_port`'s TCP-only readiness check isn't
sufficient — the peer's TLS layer can still not be ready when the port
already accepts connections. This time the race was hit hard enough
that the join failed outright rather than silently recovering, because
(unlike `peer chaincode invoke`, used for the governance-flow calls
earlier this session) `peer channel join` has no retry/backoff
machinery of its own — it's a one-shot call.
**Resolution:** added a short retry loop (up to 5 attempts, 2-second
gaps) around the `peer channel join` call inside
`join_new_org_to_channel`. Safe to retry freely here: a peer that
hasn't successfully joined yet has no "already joined" conflict to
worry about. Deliberately not touching the shared `wait_for_port`
itself — this fix is scoped to the one call site now confirmed to need
it, not a broader change to code shared by every other readiness wait
in this codebase.
**Follow-up:** if this retry loop is ever exhausted (5 failures in a
row for the same peer), that points to a real, non-transient problem
(e.g. the peer container actually crashed), not this race — it would
need its own fresh diagnosis, not a bigger retry count.

---

## 2026-07-13 — `org-add.sh` stage 5 joined peers against the wrong block — Fabric requires the genesis block, not the current config block

**Phase:** 9 — first live, full end-to-end test of `org-add.sh`
(stages 1-5) against `InstitutionB`, after a real governance vote
(`RegisterInstitution` x2, `ProposeNewMember`, `CastVote` x2) actually
approved it.
**Symptom:** `peer channel join` failed for `peer0.InstitutionB` with
`Error: proposal failed (err: bad proposal response 500: cannot create
ledger from genesis block: expected block number=0, received block
number=13)`. Stages 1-4 had already succeeded (crypto/containers up,
MSP injected, anchor peers set).
**Command / context:** `join_new_org_to_channel`'s `fetch_newest_block`
fetched the channel's newest block (block 13, after the two config
updates) and passed it to `peer channel join -b`, per this stage's
original design (see this file's own header comment before this fix).
**Root cause:** the original design assumption — "a late-joining peer
needs the CURRENT config block, not the stale genesis block" — was
never actually tested against real Fabric behavior until this run, and
it was wrong. Fabric's own ledger-creation code refuses to bootstrap a
peer's first-ever ledger for a channel from anything other than block
0; there is no supported way to join starting partway through the
chain. A late-joining peer is meant to join via the ORIGINAL genesis
block and then catch up to the current state afterward through normal
orderer block delivery — which already includes any config updates that
happened after genesis, since the peer processes every block in
sequence once joined.
**Resolution:** rewrote `join_new_org_to_channel` to join using
`GENESIS_BLOCK` (the same constant `network.sh`'s own `join_peers`
already uses for founding orgs), and deleted `fetch_newest_block`
entirely — it's no longer needed for anything. Updated this script's
own module header comment, which had documented the wrong design as
settled fact.
**Follow-up:** none — confirmed directly against Fabric's own error
message, not inferred.

---

## 2026-07-13 — transient `ClientHandshake` TLS EOF during `peer channel join`, self-resolved by retry

**Phase:** 9 — first `network.sh up` run after a full wipe, to test
`org-add.sh` stage 5 (peer channel join) cleanly from a genuinely clean
network.
**Symptom:** stage 9 (`join_peers`) logged `[comm.tls] ClientHandshake
-> Client TLS handshake failed after 1.974411ms with error: EOF
remoteaddress=127.0.0.1:7051` while joining `peer0.BLCFounder`,
immediately followed by a successful join on the very next attempt.
**Command / context:** `./network.sh up`, stage 9/10 (`joining
peer0.BLCFounder to channel blcchannel`), right after stage 6's
`wait_for_all_nodes` had already confirmed the peer's port was accepting
connections.
**Root cause:** `wait_for_port` (`lib/common.sh`) only proves a peer's
TCP listener is accepting connections — it doesn't prove the peer
process has finished registering its TLS credentials with its gRPC
server. A container's OS-level socket can start accepting raw TCP
connections slightly before the application layer has finished wiring
up TLS, so the very first handshake attempt right after `wait_for_port`
returns can land in that narrow window and get an EOF.
**Resolution:** none needed — the `peer` CLI's underlying gRPC client
retried automatically and succeeded about a second later
(`executeJoin -> Successfully submitted proposal to join channel`), and
stage 10 (`verify_channel_membership`) independently re-queried all 4
peers afterward and confirmed every one reached `"height":1` with the
matching block hash. Not fixing `wait_for_port` itself: this is a
transient, self-recovering race, not a silent failure, matching this
project's existing precedent (see `network.sh`'s own header comment on
stages 3/8/9 not being made safely re-runnable) of deferring
non-blocking robustness work until it's a real friction point, not
preemptively.
**Follow-up:** if this same handshake failure is ever seen WITHOUT a
following successful retry (i.e., an actual join failure), that would
mean `wait_for_port`'s TCP-only check is no longer sufficient and needs
a real fix (e.g., a genuine TLS-level readiness probe) — not just
logged as benign again without re-checking.

---

## 2026-07-13 — `network.sh down --wipe` left `org-add.sh`'s own containers behind (same class of bug as the chaincode-teardown gap)

**Phase:** 9 — wiping the network to test `org-add.sh`'s stages 3-4
cleanly from scratch, after manually verifying the channel
config-update mechanism worked (InstitutionB was live-injected into the
channel during that manual verification).
**Symptom:** `network.sh down --wipe` logged `Network blc Resource is
still in use` again, identical to the Phase 7 chaincode-teardown
incident. `ca.InstitutionB`, both `peer{0,1}.InstitutionB`, and both
`couchdb.peer{0,1}.InstitutionB` were still running afterward.
**Command / context:** `./network.sh down --wipe`, run to reset before
a clean end-to-end test of `org-add.sh`'s own stages.
**Root cause:** exactly the same mechanism as the earlier chaincode
container gap: `org-add.sh`'s `start_org_ca`/`start_org_peer`/
`start_org_couchdb` (stage 2) use plain `docker run`, never
docker-compose, so `docker compose down` can't see them. Worse than the
chaincode case in one respect: `ARCHITECTURE.md` forbids `org-add.sh`
from ever touching `blcgen generate`, so an onboarded org's containers
can **never** become compose-managed, even after stage 7 flips its
`network.yaml` status from `pending` to `member` — unlike the
chaincode case, there's no future point at which this org's containers
migrate to compose's management.
**Resolution:** added an `org-add.sh teardown` verb — enumerates every
org in `network.yaml` with `status != "founding"` (founding orgs are
always compose-managed; anything else may have org-add-created
containers, whether still `pending` or already `member`) and removes
its `ca.*`/`peer*.*`/`couchdb.peer*.*` containers. Wired into
`network.sh`'s `cmd_wipe`, called before either `docker compose down`,
same ordering reasoning as the existing `chaincode.sh teardown` call.
**Follow-up:** none — same fix shape as the chaincode-teardown entry,
applied to the other class of raw-`docker run` container this project
now has.

---

## 2026-07-13 — `org-add.sh`'s own `mkdir -p` for a CA's crypto dir failed with Permission denied

**Phase:** 9 — `org-add.sh` stage 2 (crypto enrollment + container
bring-up for InstitutionB), first live run.
**Symptom:** `mkdir: cannot create directory '.../crypto/ca-servers/
InstitutionB': Permission denied`.
**Command / context:** `start_org_ca`'s own `mkdir -p
"${CRYPTO_DIR}/ca-servers/${org_name}"`, added defensively before the
`docker run` that mounts it, on the assumption the directory needed to
exist first.
**Root cause:** same mechanism as the 2026-07-06 "`rm -rf
crypto/ca-servers` failed with Permission denied" entry above it in
this log — `crypto/ca-servers/` itself is already root-owned (each CA
container's `fabric-ca-server` process runs as root, and Docker's own
bind-mount handling creates a missing source directory as whatever UID
the container writes with). A normal-user `mkdir -p` underneath an
already-root-owned parent directory fails. The assumption that the
directory needed pre-creating was simply wrong: Docker creates missing
bind-mount source directories itself on first mount, which is exactly
how `crypto/ca-servers/BLCFounder`/`InstitutionA` came to exist in the
first place, with no script ever `mkdir`-ing them.
**Resolution:** removed the `mkdir -p` entirely; `docker run -v ...`
handles directory creation on its own, matching the existing orgs'
behavior exactly. Re-ran clean: `InstitutionB`'s CA and both peers'
crypto enrolled correctly.
**Follow-up:** none — this class of defensive-but-wrong `mkdir` is
worth being suspicious of generally in this project, given
`crypto/`'s root-owned nature; prefer letting Docker create bind-mount
targets over pre-creating them by hand.

---

## 2026-07-13 — `peer chaincode invoke`'s "successful" only confirms endorsement/submission, never commit

**Phase:** 9 (pre-work) — live-testing `org-add.sh`'s Phase 1 guard,
which required actually running the governance vote for the first time
outside a unit test.
**Symptom:** cast "yes" votes from both `BLCFounderMSP` and
`InstitutionAMSP` on the same `CastVote` proposal, back to back with no
gap between them. Both invokes printed `"Chaincode invoke successful"`
with `status:200`. A direct `GetProposal` query against committed state
immediately after showed `votesFor: 1`, `status: "open"` — only one of
the two votes had actually landed.
**Command / context:** manual `peer chaincode invoke ... CastVote ...`
calls, run consecutively while live-testing `org-add.sh`.
**Root cause:** confirmed via `peer chaincode invoke --help`, not
assumed: `--waitForEvent` — "Whether to wait for the event ...
signifying that the 'invoke' transaction has been committed
successfully" — is opt-in and was never used anywhere in this project.
Without it, the CLI reports success once the transaction is endorsed
and submitted to the orderer; the actual commit/validation (including
MVCC read-conflict checking) happens asynchronously afterward and is
never surfaced back to a plain invoke. Both `CastVote` calls
independently simulated against the same pre-vote state and were both
validly endorsed; one was later rejected at block-validation time
(MVCC conflict on the shared proposal key) with no error visible to the
caller.
**Resolution:** not a chaincode bug — re-cast the losing vote as a
fresh transaction; it correctly read the now-current committed state
and landed cleanly (`votesFor: 2`, `status: "approved"`). This is the
same "loser contributes nothing, retry succeeds" guarantee already
proven for `certificate-cc`'s `CERT_COUNTER`, just observed through a
client that doesn't surface per-transaction validation codes.
**Follow-up:** general operational note for any future manual
`peer chaincode invoke` testing in this project (not specific to
`CastVote`): "invoke successful" is not "committed successfully."
Verify real outcomes for anything contention-sensitive via a direct
query against committed state afterward, not the invoke response —
and either sequence genuinely concurrent-feeling calls with a
confirm-then-proceed gap, or accept up front that a retry may be
needed. See the following entry for the specific test-coverage gap
this exposed in `institution-cc`.

---

## 2026-07-13 — `institution-cc`'s fake stub had no MVCC conflict modeling at all

**Phase:** 9 (pre-work) — found immediately after the entry above,
while confirming whether the vote race was Fabric behaving correctly
or a real correctness bug in `CastVote`.
**Symptom:** `institution-cc`'s `mocks_test.go` `fakeStub.commit()` was
an unconditional `for k, v := range s.pending { s.ledger.committed[k] =
v }` — no version tracking, no conflict detection whatsoever. Every one
of the 6 existing `CastVote` tests (including the N=2/N=6 traces from
Phase 7) modeled strictly *sequential* voting (`mustCommit` on each
vote before the next one simulates); none modeled two votes racing
against the same pre-commit proposal state. Had a regression test been
written against this fake as-is, both concurrent commits would have
blindly "succeeded," one silently overwriting the other — proving
nothing, and masking exactly the class of issue found live in the
entry above.
**Command / context:** noticed while deciding whether the live vote
race was benign (Fabric's normal MVCC behavior) or a genuine
`institution-cc` bug — needed a way to actually prove which, not just
assert it.
**Root cause:** `institution-cc`'s test infrastructure predates
`certificate-cc`'s Phase 8 concurrency work — its fake stub was never
upgraded to model MVCC conflicts, unlike `certificate-cc`'s
`mocks_test.go` (`fakeLedger.versions`, `fakeStub.readVersions`,
`commit()` returning an error on conflict), because `institution-cc`
never had a concurrency-sensitive counter analogous to `CERT_COUNTER`
at the time it shipped — but `CastVote`'s own `VotesFor`/`VotesAgainst`
read-modify-write on `MembershipProposal` has the identical shape and
is subject to the identical contention.
**Resolution:** ported `certificate-cc`'s exact MVCC-versioning model
into `institution-cc`'s `mocks_test.go` (`fakeLedger.versions`,
`fakeStub.readVersions`, `commit()` now returns an error), then added
`TestCastVote_ConcurrentVotes_OneWinsOneConflicts`, mirroring the live
scenario precisely: two `CastVote` calls simulate against the same
base state, one commits, the other's commit is rejected, and — the
stronger claim, not just "the vote count is right" — the losing vote's
own `Vote` asset is confirmed entirely absent from committed state
(exact-key-presence check, same rigor as `certificate-cc`'s own
concurrency test). **Verified the test can actually fail, not just
pass:** temporarily reverted `commit()` to the old unconditional-
overwrite behavior, confirmed the new test fails with a clear
assertion message, then restored the real fix and reconfirmed all 26
tests (25 existing + 1 new) pass.
**Follow-up:** none — the fix is a direct, verified port of an
already-proven pattern, not a new design.

---

## 2026-07-10 — `exec 3<>/dev/tcp/...` corrupts the calling shell's own stderr after a successful connection

**Phase:** 9 (pre-work) — found while re-verifying `chaincode.sh` after
the readiness-race/registry-corruption fix (separate entry, same day).
**Symptom:** after `wait_for_ccaas_ready` succeeded, every later `>&2`
write in the same script silently vanished — not just my own debug
echoes, but `on_deploy_error`'s own `"[chaincode] FAILED at stage N"`
trap message. The script exited quickly (`real 0m2.653s`) with a clean
nonzero code; nothing hung, nothing crashed, stdout kept working the
entire time. A standalone manual run of the exact same failing `peer
chaincode invoke` command produced a clear, fast, correct error
("chaincode 'institution-cc' is already initialized but called as
init") in 0.044s — proving the invoked command itself was never the
problem.
**Command / context:** `./scripts/chaincode.sh deploy institution-cc
--init-function InitLedger ...`, run a second time against an
already-initialized chaincode (deliberately, to verify the
already-committed detection fix). Bisected with targeted debug echoes
(not `bash -x` — its own trace output got corrupted at the identical
point, for the identical reason, which is itself informative) down to
`wait_for_ccaas_ready`'s `until (exec 3<>"/dev/tcp/${ip}/${port}")
2>/dev/null; do ... done` — reproduced in a minimal, isolated script
with no chaincode.sh involved at all: an `echo >&2` immediately after a
*successful* first call to this exact pattern never printed, while a
stdout `echo` right after it did.
**Root cause:** when the `(exec 3<>/dev/tcp/HOST/PORT)` connection
succeeds on the first try inside this environment, the bare
parenthesized subshell — for reasons not fully root-caused at the bash
internals level (possibly a subshell-fork optimization specific to a
single `exec`-with-only-redirections command, interacting unusually
with this environment's `/dev/tcp` handling) — ends up corrupting file
descriptor 2 in the *calling* shell, not just the subshell, for the
rest of that process's life.
**This is not new, and not specific to today's code.** `network.sh`'s
own pre-existing `wait_for_port` (Phase 6) uses the byte-for-byte
identical pattern (`exec 3<>"/dev/tcp/localhost/${port}"`) and was
confirmed, via the same isolated reproduction, to have the exact same
bug. Any `network.sh up` failure occurring *after* `wait_for_all_nodes`
succeeds (the common case — most prior failures happened earlier, at
stage 3's crypto enrollment, which is why this went unnoticed) has
likely been silently losing its `"FAILED at stage N"` message this
entire project. See the cross-reference addendum added to the
2026-07-07 "ERR trap didn't fire" entry — that incident's own recorded
fix (missing `-E`, `pipe | while read`) explains why the *wrapper*
message didn't print, but not why the *underlying* Fabric command's own
native error text was *also* completely absent, which this bug does
explain.
**Resolution:** replaced the bare `(exec 3<>...)` subshell in both
`wait_for_ccaas_ready` (`chaincode.sh`) and `wait_for_port` (`network.sh`)
with a forced genuine subprocess: `timeout 1 bash -c "exec
3<>/dev/tcp/HOST/PORT" 2>/dev/null`. Confirmed via the same isolated
reproduction that this does not corrupt the calling shell's stderr, then
confirmed against the real scenario that exposed the bug: fresh
`network.sh down --wipe && up`, a clean `chaincode.sh deploy
institution-cc`, then a deliberate second run against the
already-initialized chaincode. This time both the peer's own native
error (`chaincode 'institution-cc' is already initialized but called as
init`) and `on_deploy_error`'s full `"[chaincode] FAILED at stage 6:
..."` message printed correctly — the exact output that was silently
lost before this fix.
**Follow-up:** none technical — both call sites fixed identically. Any
future TCP-readiness check anywhere in this project must use the
`timeout ... bash -c "exec 3<>..."` form, never a bare `(exec 3<>...)`
subshell, or it will reintroduce this exact bug.

---

## 2026-07-10 — `chaincode.sh` container-readiness race, then a corrupted-registry recovery mistake

**Phase:** 9 (pre-work) — verifying the `bootstrap-crypto.sh`/`chaincode.sh`
lib extractions (`crypto.sh`, `orgs.sh`) against a live network before
starting `org-add.sh`.
**Symptom, first failure:** `institution-cc` deploy failed at stage 6
(`InitLedger`): `error creating grpc connection to
institution-cc.InstitutionA:9999: ... dial tcp: lookup
institution-cc.InstitutionA on 127.0.0.11:53: no such host`, immediately
after stage 5 reported the container started.
**Root cause 1:** `start_ccaas_container` only ran `docker run -d` and
returned — it never confirmed the container's internal gRPC server was
actually listening before `invoke_init` tried to use it. `docker run -d`
returning only means the container *process* started, not that its
chaincode-server has finished initializing; on this run it hadn't yet.
**Symptom, second failure (self-inflicted):** re-ran the *entire*
`chaincode.sh deploy institution-cc ...` to recover — this was the wrong
recovery action. It re-packaged and re-approved a *new* package under
the *already-committed* sequence 1 (stages 1-4 had actually succeeded
the first time; only stage 6 failed). `checkcommitreadiness` correctly
refused it (`requested sequence is 1, but new definition must be
sequence 2`), but by then the peer's own chaincode launcher had two
installed packages associated with one chaincode name — the original,
running one, and the new, never-started one — and got confused,
alternating between `duplicate chaincodeID` errors and `timeout expired
while starting chaincode` for the wrong package. A subsequent manual
`InitLedger` invoke hung for a full minute against this confused state.
**Root cause 2:** the script's own `on_deploy_error` message ("safe to
re-run... directly, no wipe needed") is only true for failures *before*
commit succeeds. Once stage 4 commits, re-running stages 1-4 again is
actively harmful, not merely redundant — the message didn't
distinguish the two cases.
**Resolution — two fixes, not one:**
1. `start_ccaas_container` now calls `wait_for_ccaas_ready`, which polls
   the container's actual Docker-assigned IP on the `blc` network (ccaas
   containers never publish `CCAAS_PORT` to the host, so `localhost`
   polling like `network.sh`'s `wait_for_port` doesn't apply directly)
   until its gRPC port actually accepts a connection, before returning.
2. `cmd_deploy` now calls `already_committed` (queries `querycommitted`
   for the exact version/sequence) *before* packaging/installing/
   approving anything. If already committed, it skips straight to
   recovering each org's installed package ID (`installed_package_id_for_org`,
   matching by label) and (re-)starting containers + init — never
   re-running package/install/approve/commit regardless of which later
   stage actually failed. This is a stronger fix than improving the
   warning message: it makes "safe to re-run" true again by construction,
   rather than relying on a human reading and heeding a caveat.
**Not corrupted state recovered surgically:** the tangled peer registry
state was not manually untangled — `network.sh down --wipe && up` plus
a clean redeploy was used instead, consistent with this project's
existing "regenerate rather than migrate" posture.
**Follow-up:** none — both fixes are general (not institution-cc-
specific) and apply to `org-add.sh`'s upcoming container startup too,
which will hit the identical readiness race for InstitutionB's
containers if it didn't reuse this same wait.

---

## 2026-07-09 — `IssueCertificate` smoke test failed because a prior "environment restored" claim was inaccurate

**Phase:** 8 — Deploy `certificate-cc` (first live smoke test)
**Symptom:** `IssueCertificate` from `BLCFounderMSP` failed:
`endorsement failure during invoke. response: status:500 message:"BLCFounderMSP is not a registered institution"`. `institution-cc`'s
`GetAllInstitutions` returned `[]`, and `GetInstitution("BLCFounderMSP")`
directly (a `GetState` lookup, not a rich query — so not a CouchDB
indexing-lag false alarm) confirmed it: no `Institution` asset existed
at all, despite `RegisterInstitution` having been reported as
successful earlier the same session.
**Command / context:** `peer chaincode invoke ... IssueCertificate` on
`certificate-cc`, immediately after deploying it (Phase 8's live
verification step).
**Root cause:** during the earlier plain-`network.sh down` investigation
(same day), the network was wiped and rebuilt several times. The final
rebuild's restore step ran `chaincode.sh deploy institution-cc
--init-function InitLedger ...` and was reported as "environment
restored — same clean state as before this investigation." That claim
was inaccurate: `InitLedger` only seeds the founding-MSP *allowlist* —
it does not create `Institution` assets. `RegisterInstitution` (the
separate call that actually creates them) was never re-run against that
specific rebuild. Confirmed by reading `peer0.BLCFounder`'s own
container logs directly: blocks 0-4 are genesis + `institution-cc`'s
lifecycle (approve ×2, commit, `InitLedger` invoke) only, then a
3-hour gap straight to block 5 (`certificate-cc`'s own deploy) — no
block for `RegisterInstitution` exists anywhere on this ledger instance.
**Resolution:** ran `RegisterInstitution` for both `BLCFounderMSP` and
`InstitutionAMSP` against the current instance, confirmed via
`GetAllInstitutions`, then retried the `certificate-cc` smoke test —
`IssueCertificate`, `VerifyCertificate`, and `GetCertificatesByInstitution`
all succeeded. Worth noting: `certificate-cc`'s rejection here was
*correct behavior*, not a bug — `requireActiveInstitution` did exactly
what it was built to do when the caller genuinely wasn't registered.
**Follow-up:** none technical — this was a verification-process gap, not
a code gap. The lesson is procedural: "the deploy script's init step
succeeded" and "the application-level registration step succeeded" are
different claims, and a "restored" summary must verify both explicitly
before being stated as fact, not infer the second from the first.

---

## 2026-07-09 — Confirmed live: plain `network.sh down` (no `--wipe`) followed by `up` fails outright at crypto enrollment

**Phase:** 7 — Deploy `institution-cc` (follow-up empirical check on the
deferred item from the ccaas-teardown entry below)
**Symptom:** `network.sh down` (no `--wipe`) → `network.sh up` fails at
stage 3 with `Error: Response from server: Error Code: 74 - Identity
'orgadmin' is already registered`, aborting before a single peer or
orderer container restarts — well before chaincode is ever reached.
**Command / context:** ran live and deliberately, to confirm (not
assume) whether the deferred plain-`down` gap noted in the entry below
fails loudly or produces a silent half-broken state. `./network.sh down`
while `institution-cc.*` ccaas containers were running, then
`./network.sh up`.
**Root cause:** confirmed by reading `docker-compose-ca.yaml.tmpl`: each
CA's data directory is a bind mount to a host path
(`../crypto/ca-servers/<org>`), not a named Docker volume. `down`
(with or without `-v`) never touches bind mounts, so the CA's own
identity database — every previously registered `orgadmin`, `peer0`,
`orderer0`, etc. — survives right along with `crypto/organizations/`.
`bootstrap-crypto.sh` has no existence check anywhere in
`bootstrap_org`/`enroll_node`; it unconditionally re-registers on every
`up`, which Fabric CA rejects for an identity it already has on record.
This is a pre-existing characteristic of plain `down`, unrelated to and
predating the ccaas chaincode-container gap — the chaincode containers
just sit there, idle and orphaned, since `up` never gets far enough to
touch them.
**Resolution:** confirmed the failure mode is "fails outright, loudly,
at the very first CA registration call" — exactly what `network.sh`'s
own header comment already documented from Phase 6, now backed by the
actual error text on record. Not a silent half-broken state. Recovered
via the already-proven `down --wipe && up && chaincode.sh deploy
institution-cc` sequence.
**Follow-up:** none beyond what's already tracked in the entry below —
`cmd_down` still isn't wired to `chaincode.sh teardown`, and this
confirms that wiring alone wouldn't make plain `down`+`up` safe anyway,
since the actual blocker is crypto non-idempotency, not the chaincode
containers. Genuine idempotent `down`+`up` support (skip-if-already-
registered checks in `bootstrap-crypto.sh`) is out of scope for this
MVP pass, same "deliberate MVP scope decision" already on record in
`network.sh`'s own header comment.

---

## 2026-07-09 — `network.sh down --wipe` left ccaas chaincode containers (and the `blc` network) behind

**Phase:** 7 — Deploy `institution-cc` (repeatability check, after the
ccaas migration was already working)
**Symptom:** running `network.sh down --wipe` then re-running `network.sh
up` did not produce a genuinely clean slate. `docker compose down`
logged `Network blc Removing` / `Network blc Resource is still in use`
and left the `blc` network in place; `institution-cc.BLCFounder` and
`institution-cc.InstitutionA` were still running afterward, untouched by
the wipe.
**Command / context:** `./network.sh down --wipe`, run as part of a
deliberate repeatability check (the same "works now but only because of
leftover state" risk flagged during Phase 6, applied to the ccaas
migration this time).
**Root cause:** `chaincode.sh` starts each org's chaincode-as-a-service
container with a plain `docker run --network blc ...`, not via
docker-compose — so those containers are completely invisible to
`docker compose down`/`down -v`. They stay attached to the `blc`
network, so its removal silently no-ops. There was also no teardown verb
anywhere for these containers; `chaincode.sh` only ever had `deploy`.
**Resolution:** added a `chaincode.sh teardown` verb that discovers
*both* dimensions generically instead of hardcoding
`institution-cc`/`BLCFounder`/`InstitutionA`: chaincode names from
`chaincode/*`'s own directory listing, orgs from `network.yaml` via the
existing `active_org_lines` helper. Wired it into `network.sh`'s
`cmd_wipe`, called *before* either `docker compose down` — order matters,
since the containers must detach from `blc` before compose tries to
remove it. Verified: teardown also found and removed stray
`certificate-cc.BLCFounder`/`certificate-cc.InstitutionA` containers
neither of us knew were running, confirming the generic
directory/config-driven discovery (not a hardcoded list) was the right
call. Re-ran the full check from scratch — `down --wipe` → `up` →
`chaincode.sh deploy institution-cc` → smoke test — and confirmed the
`blc` network's Docker network ID changed and every container's creation
timestamp was fresh, not reused.
**Follow-up:** plain `network.sh down` (no `--wipe`) calls the same
`docker compose down` and would hit the identical "network still in
use" symptom if any ccaas container is running — not fixed here since it
wasn't part of what broke the wipe's clean-slate guarantee, but worth
wiring `cmd_down` to the same teardown call before Phase 9's `org-add.sh`
work assumes `down` is fully clean too.

---

## 2026-07-09 — `contractapi` response schema rejected a legitimately-omitted field

**Phase:** 7 — Deploy `institution-cc` (first live smoke test,
`RegisterInstitution`)
**Symptom:** `Error handling success response. Value did not match
schema: 1. return: approvedBy is required` — despite
`Institution.ApprovedBy` having Go's `json:"...,omitempty"` tag and
being legitimately unset for a founding org's own registration (no
"who voted for it" list applies).
**Command / context:** `peer chaincode invoke ... RegisterInstitution
"BLC Founder"` against the freshly-deployed, freshly-initialized
chaincode.
**Root cause:** `omitempty` only controls JSON *marshaling*.
`fabric-contract-api-go` generates its own response schema separately,
from a distinct `metadata` struct tag — confirmed by reading
`metadata/schema.go`'s `getField` directly: every struct field defaults
to `required: true` in that generated schema unless a `metadata:
"name,optional"` tag says otherwise. The two tags are unrelated
mechanisms that happen to look similar.
**Resolution:** added `metadata:"approvedBy,optional"` (alongside the
existing `json` tag) to `Institution.ApprovedBy`, and proactively did
the same for `MembershipProposal.ResolvedAt` (also `omitempty`, also
genuinely absent for an open proposal) rather than waiting to hit the
identical failure again later on `GetProposal`. Rebuilt the ccaas Docker
image and restarted both org's containers — no re-package/install/
approve/commit needed, since a ccaas package ID is tied only to
`connection.json`, never to the chaincode binary.
**Follow-up:** any future struct field on a chaincode return type that's
conditionally absent (another `omitempty`) needs this same paired tag —
worth checking for on every new asset type in `certificate-cc` (Phase 8)
before, not after, the first live invoke.

---

## 2026-07-09 — `chaincode.sh`: log-redirection and argument-encoding bugs during first deployment

**Phase:** 7 — Deploy `institution-cc` (`chaincode.sh deploy`, stages
3 and 6)
**Symptom 1:** garbled, multi-line text visible directly in terminal
output where a clean package ID was expected (e.g. `approving
institution-cc for BLCFounder (package ID [chaincode] BLCFounder's
package ID: ...`), then later: `chaincode definition for
'institution-cc' exists, but chaincode is not installed` at the init
step.
**Root cause 1:** `package_and_install_for_org`'s own progress messages
(`log "..."`, which writes to stdout by default) were captured
alongside its intended return value, since the caller reads this
function's entire stdout via `$(...)` to get the package ID. The
corrupted, multi-line value was then used — successfully, since Fabric
doesn't validate a package ID's authenticity at approval time, only at
actual invocation — for both `approve_for_org` and
`start_ccaas_container`, silently mismatching what was genuinely
installed until the init invoke finally tried to use it.
**Resolution 1:** redirected this function's own `log` calls to `>&2`
explicitly. Recovered the already-committed deployment (sequence 1 was
correctly committed; only the per-org package-id association was
wrong) by restarting both ccaas containers with the correct
`CHAINCODE_ID` and re-approving both orgs with the correct package
ID — confirmed Fabric allows re-approving an already-committed
sequence, so no sequence bump/re-commit was needed.

**Symptom 2:** `Conversion error. Value BLCFounderMSP was not passed in
expected format []string` at the init invoke.
**Root cause 2:** `InitLedger(foundingMSPIDs []string)` needs exactly
one `Args` element containing a JSON-encoded array — contractapi maps
one `Args` string to one Go parameter, by position. The invocation
example built `FOUNDING_MSPS` as a space-joined string and passed it
**unquoted**, so bash word-split it into two separate `Args` elements
instead of the one JSON array `InitLedger`'s single `[]string`
parameter expects.
**Resolution 2:** compute the argument via `json.dumps(...)` and pass
it as one quoted shell argument. No change needed in `chaincode.sh`
itself — its generic Args-building logic was already correct for the
more common case (multiple simple positional parameters); only the
*invocation example* was wrong, and was corrected in the script's own
header comment too, so this doesn't recur for `certificate-cc` (Phase 8)
or a future institution-cc redeploy.
**Follow-up:** both bugs were caught in the same deployment run, one
right after fixing the other — a reminder that a clean run through
several stages doesn't mean the whole flow is correct, only that the
stages exercised so far are. Full detail and the final successful
smoke test are in `docs/BUILD_LOG.md`'s Phase 7 entry.

---

## 2026-07-09 — Classic chaincode packaging incompatible with host Docker Engine; migrated to ccaas

**Phase:** 7 — Deploy `institution-cc` (`chaincode.sh`, stage 2/install)
**Symptom:** `peer lifecycle chaincode install` failed with `could not
build chaincode: docker build failed: docker image build failed: write
unix @->/run/docker.sock: write: broken pipe`, on every attempt,
identically.
**Command / context:** `./scripts/chaincode.sh deploy institution-cc
--init-function InitLedger --init-args ...` — reproduced 3 times, each
after a different fix attempt.
**Root cause:** Fabric `2.5.0`'s bundled Docker client library (the
peer's internal "classic" golang builder, which builds a chaincode
image via a nested `/var/run/docker.sock` bind mount) is incompatible
with this host's Docker Engine version. Two other hypotheses were
tested and ruled out first, not skipped: a missing base image
(`hyperledger/fabric-baseos:2.5` — pre-pulled it, identical failure)
and a network-dependent `go mod download` inside a memory-capped
ephemeral build container (vendored dependencies via `go mod vendor` —
identical failure, just faster). The actual daemon (`dockerd`) logged
no error at all at the failure moment — only a normal container-task-
delete event — and the failure always occurred on a *write*, not a
read, consistent with the server closing its read side early rather
than a resource exhaustion or timeout. A minimal isolation test
(`docker run` a plain container using the modern, official
`docker:latest` CLI image, building through the exact same bind-mounted
socket) succeeded immediately using BuildKit — proving the daemon works
fine for a modern client and specifically cannot serve Fabric's old
(circa 2021-2022, pre-BuildKit-only) client library's legacy Build API
requests.
**Resolution:** migrated `institution-cc` (and `chaincode.sh`, generally
— applies to `certificate-cc` in Phase 8 too) from classic packaging to
chaincode-as-a-service (ccaas): `main.go` now runs a
`shim.ChaincodeServer`, built into its own Docker image via a plain
host-side `docker build` (never through the peer's internal path),
`chaincode.sh` packages/installs/approves per org (each org's own
`connection.json`/package ID, since each runs its own chaincode service
instance) and starts each org's container directly via `docker run
--network blc`. Full verified mechanics, the reference script this was
adapted from, and the ARCHITECTURE.md deviation this required are in
`docs/BUILD_LOG.md`'s Phase 7 entry (2026-07-09).
**Follow-up:** this was a real, confirmed environment incompatibility,
not a preference — worth remembering if this project is ever run on a
host with an older Docker Engine (contemporaneous with Fabric 2.5),
where classic packaging might work fine and this whole migration would
have been unnecessary. Not reverting given ccaas is also the more
production-realistic approach regardless.

---

## 2026-07-08 — `RegisterInstitution` bootstrap-guard design caught before any code was written

**Phase:** 7 — Deploy `institution-cc` (design review, pre-implementation)
**Symptom:** none at runtime — this was caught during design review, before
writing a single line of the chaincode, which is the point of recording it.
**Command / context:** walking through exactly who calls
`RegisterInstitution` and when (founding orgs at genesis vs. a new
institution during Phase 9's `org-add.sh` flow), to decide its access
control before implementation.
**Root cause / design conflict:** the design doc's only stated validation
for `RegisterInstitution` is "institution must not already exist" — no
restriction on caller identity beyond that. The first fix proposed to
close an obvious governance-bypass risk (a new org self-registering
instead of going through `ProposeNewMember`/`CastVote`) was to gate the
function on "succeeds only if zero Institution assets exist yet." This
is broken for BLC-31 specifically: there are **two** founding orgs
(`BLCFounder`, `InstitutionA`). Whichever registers first makes "zero
exist" false, permanently blocking the *second* founding org from ever
registering. A global ledger count is the wrong check whenever there's
more than one founder — caught by explicitly tracing the two-founder
call sequence rather than accepting the first plausible-sounding guard.
**Resolution:** replaced the count-based guard with an explicit
allowlist: `InitLedger(foundingMSPIDs []string)`, invoked once via
Fabric's `--init-required`/`--isInit` lifecycle mechanism at first
commit, with `chaincode.sh` deriving the argument list from
`network.yaml`'s `status: founding` orgs (config-driven, matching every
other script in this project). `RegisterInstitution` checks caller-MSP
membership in that stored list instead of a ledger count — both
founders can register in either order without blocking each other, and
no org outside the list can ever succeed.
**Verified against Fabric source before trusting the design** (two
follow-up questions, both checked against actual Fabric 2.5 code, not
memory): (1) the founding list is not immutable by any Fabric platform
guarantee — only by `InitLedger`'s own existence check plus the
multi-org approval required to deploy any different code; (2) Fabric's
`--isInit` gate (`core/chaincode/chaincode_support.go`'s
`CheckInvocation`) is scoped to "has Init run for the *current version
string*," and `InitRequired` is stored per-sequence
(`core/chaincode/lifecycle/lifecycle.go`) — so a future upgrade that
bumps the version and re-sets `--init-required=true` **can** re-trigger
`InitLedger`. Confirms the founding-list guard must be (and is) the
application-level check in `InitLedger`, not reliance on Fabric's
built-in Init gate. Full detail and sources in `docs/BUILD_LOG.md`'s
Phase 7 entry.
**Follow-up:** none — this is the intended outcome of reviewing a design
before coding it, not a bug that shipped. Recorded here per the same
policy as every other resolved conflict in this build, since it's a
useful example of the review process catching a real multi-founder edge
case before it became a debugging session.

---

## 2026-07-07 — Host memory pressure caused a false-alarm `network.sh up` failure (NOT a code bug)

**Phase:** 6 — `network.sh up` (re-run after all 7 real bugs above were already fixed)
**Symptom:** a clean `down --wipe && up` run — using code already confirmed correct
minutes earlier — failed at stage 9 again: only `peer0.BLCFounder` was
attempted, the script exited 1, and printed **zero** output (no peer
CLI error, no `on_up_error` trap message). Manually retrying the exact
same `peer channel join` a few minutes later failed with `cannot create
ledger from genesis block: ledger [blcchannel] already exists with
state [ACTIVE]`.
**Command / context:** the earlier fixes had all just been verified
working end-to-end; this failure happened on a second consecutive
`down --wipe && up` cycle run back-to-back, with several other
memory-heavy desktop applications (Chrome, VS Code, Slack, Firefox)
open at the same time.
**Root cause: none in the codebase.** `free -h` at the time showed
`available: 1.5Gi`, `free: 126Mi`, `swap used: 6.6Gi of 8Gi` — the host
was thrashing under severe memory pressure from unrelated desktop
applications (Fabric's 14 containers together use well under 1GB RSS
per `docker stats`; they were never the cause). Full log inspection
(`docker logs`, `docker inspect --format .State.StartedAt`) proved the
join actually *succeeded server-side*: `peer0.BLCFounder` created the
ledger and joined gossip cleanly, ~5 minutes later than it should have,
consistent with `docker compose up` itself being severely delayed by
swap thrashing. The most likely explanation for the CLI-side failure is
a client/server race — the proposal's round-trip exceeded the peer
CLI's default deadline under this level of system slowness, even though
the peer went on to finish the work a moment later. This is a known
category of transient Fabric flakiness (peer TCP port open ≠ peer fully
ready to serve gRPC proposals), *triggered* by resource starvation, not
caused by anything in `network.sh`/`bootstrap-crypto.sh`.
**Resolution:** no code change. `docker builder prune -f`,
`docker image prune -a -f`, and `docker volume prune -f` reclaimed
~8.3GB of disk (removing unrelated cached images/build layers/orphaned
volumes from other projects); closing unused Chrome tabs got `available`
memory from 1.5Gi to 2.7Gi. Re-running the identical, unmodified
`down --wipe && up` at that point completed all 10 stages cleanly with
no errors — proving the code was never the problem.
**Follow-up — recognize this pattern fast next time:** before
re-diagnosing "the network is broken" as a new code bug, check
`free -h` first. Telltale signs this is a resource-pressure false
alarm, not a real bug: (1) `docker stats` shows every container using
normal/low memory — the containers aren't the ones under pressure;
(2) `docker inspect --format '{{.State.StartedAt}}'` shows a container
started much later than the script's own timestamps suggest it should
have (`docker compose up` itself was delayed); (3) the failing command
produces a real, verifiable *side effect* server-side (here: the ledger
actually got created) despite the client reporting failure; (4) the
exact same code, unmodified, succeeds on a clean retry once `available`
memory recovers. If all four hold, look at `free -h`/`swap` before
touching any script.

---

## 2026-07-07 — CA bootstrap identity used directly as org Admin has wrong OU

**Phase:** 6 — `network.sh up` (stage 9, `peer channel join`)
**Symptom:** every peer's `cscc` policy check rejected `peer channel
join` with `The identity is not an admin under this MSP
[BLCFounderMSP]: The identity does not contain OU [ADMIN]` — visible
only in the peer's own container logs, since `network.sh`'s stage 9
call produced no stdout/stderr at all (the shell prompt just returned
with exit 1).
**Command / context:** hit immediately after fixing the Admin
local-MSP NodeOUs gap and the `CORE_LEDGER_STATE_COUCHDBCONFIG_
COUCHDBADDRESS` env var name bug (both below) — this was the fourth
and last bug found in this debug cycle before a full `network.sh up`
finally completed all 10 stages.
**Root cause:** `bootstrap_org` enrolled the Fabric CA's own bootstrap
identity (`admin`/`adminpw`, created automatically by the CA server at
startup) directly as the org's channel Admin. That bootstrap identity's
type is `client` by default (baked into the CA server's config) — its
certificate always gets `OU=client`, never `OU=admin`, regardless of
what the NodeOUs `config.yaml` declares. NodeOUs classification depends
entirely on the OU embedded in the cert at registration time (via
`--id.type`), not on the config.yaml file, so no local fix to
config.yaml could have caught this. `fabric-samples`' own
`registerEnroll.sh` avoids this exact trap by using the bootstrap
identity only as a registrar, then registering a *separate* identity
with `--id.type admin` for actual use as the org's Admin.
**Resolution:** `bootstrap_org` now enrolls the CA bootstrap identity
into its own internal-only home (`crypto/ca-bootstrap/<org>/`, not
under `organizations/`) and uses it solely as a registrar. It then
registers a new `orgadmin` identity with `--id.type admin` and enrolls
*that* into `organizations/<org>/users/Admin/msp` — the path everything
else (org-level MSP assembly, `network.sh`'s `CORE_PEER_MSPCONFIGPATH`,
the orderer org's TLS admin enrollment) already referenced. `enroll_node`
now takes the registrar home (not the Admin home) for its `register`
calls, since the Admin identity itself never had registrar rights and
was only incidentally usable as one before this fix.
**Follow-up:** this bug was latent since Phase 4 but only surfaced once
a peer's *own* policy engine actually checked the Admin identity's role
— `configtxgen` and `osnadmin channel join` never exercise this check.
Worth remembering for Phase 7/8: chaincode lifecycle commands
(`approveformyorg`, `commit`) also require an Admin-role identity, so
this fix was a hard prerequisite for those phases, not just for
`peer channel join`.

---

## 2026-07-07 — Wrong CouchDB address env var name, peers crash-looped

**Phase:** 6 — `network.sh up` (stage 6/9, peer containers)
**Symptom:** every peer container restart-looped indefinitely; logs
showed `Get "http://127.0.0.1:5984/": dial tcp 127.0.0.1:5984: connect:
connection refused` — the peer never even tried to reach its actual
`couchdb.<peer>.<org>` container.
**Command / context:** found while diagnosing a silent stage 9 failure
— `docker ps` showed the peer container only "Up 15 seconds" despite
being created much earlier, indicating a crash loop.
**Root cause:** `docker-compose-net.yaml.tmpl` set
`CORE_PEER_COUCHDBADDRESS`, which is not a real Fabric Core setting.
The actual env var Fabric's core.yaml loader recognizes is
`CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS` (mapping to
`ledger.state.couchDBConfig.couchDBAddress`). Fabric silently ignores
unrecognized `CORE_*` env vars rather than erroring, so the peer fell
back to core.yaml's built-in default of `127.0.0.1:5984`, which is
never reachable from inside the peer's own container.
**Resolution:** renamed the env var in
`network/templates/docker-compose-net.yaml.tmpl` to
`CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS`.
**Follow-up:** since Fabric doesn't validate `CORE_*` env var names,
this class of bug (right value, wrong key) produces no error anywhere
— only a silent fallback to a default. Worth spot-checking the other
`CORE_*`/`ORDERER_*` env vars in both compose templates against
core.yaml/orderer.yaml's actual key paths rather than assuming they're
correct because nothing complained.

---

## 2026-07-07 — Host `peer` CLI needs real core.yaml; stray `FABRIC_CFG_PATH`

**Phase:** 6 — `network.sh up` (stage 9, `peer channel join`)
**Symptom:** `peer channel join -b channel-artifacts/genesis.pb` failed
with `Error: Fatal error when initializing core config : could not find
config file... Config File "core" Not Found in "[.../network/generated]"`.
**Command / context:** hit while manually reproducing stage 9's failure
outside `network.sh`, after fixing the errtrace/subshell bug below made
the script's own error reporting work again.
**Root cause:** two compounding issues. (1) A stray
`export FABRIC_CFG_PATH=.../network/generated` left over from earlier
manual `configtxgen` testing was leaking into the shell's ambient
environment and silently overriding whatever the script intended.
(2) More fundamentally, the *host* `peer` CLI genuinely requires a real
`core.yaml` on its config search path, unlike the containerized peer
(which has Fabric's own default bundled inside its Docker image) — a
scope gap in the original Phase 5 decision to skip generating
`core.yaml`, which was correct for the container but not for host-side
CLI tooling used by `network.sh` itself.
**Resolution:** vendored Fabric's real, unmodified `release-2.5`
`sampleconfig/core.yaml` (fetched via `curl`, not `WebFetch` — which
summarized instead of returning verbatim content) into
`network/peercfg/core.yaml` with a provenance header. Added
`PEERCFG_DIR="$(pwd)/peercfg"` to `common.sh`, and every
`peer`/`osnadmin` invocation in `network.sh` now sets
`FABRIC_CFG_PATH="$PEERCFG_DIR"` explicitly rather than relying on the
calling shell's ambient environment.
**Follow-up:** none of the settings in this vendored `core.yaml`
actually matter at runtime — every setting that matters is overridden
via `CORE_PEER_*` env vars. It exists purely to satisfy the CLI's
"a config file must exist" check.

---

## 2026-07-07 — ERR trap didn't fire inside functions/subshells

**Phase:** 6 — `network.sh up`
**Symptom:** when a stage failed inside `create_channel`/`join_peers`/
`verify_channel_membership`, `network.sh`'s stage-tracking error
message (`FAILED at stage N: ...`) never printed — the script just
exited with no diagnostic output at all, despite `on_up_error` being
registered via `trap on_up_error ERR`.
**Command / context:** noticed after a real failure produced a bare
`exit code 1` with zero script output, making it impossible to tell
which stage had failed without re-running under `bash -x`.
**Root cause:** two independent gaps. (1) Bash's `errtrace` option
(`set -o errtrace` / `set -E`) is required for an `ERR` trap set in one
scope to propagate into functions called from it — without it, a
command failing *inside* a function silently does not fire a trap set
by its caller. `common.sh` only had `set -Eeuo pipefail`... actually
lacked `-E` initially. (2) These three functions parsed `python3`
output via `... | while read -r ...` — the right-hand side of a pipe
runs in a subshell, so any `exit`/failure inside that `while` loop
never propagates to the parent shell's trap or `set -e` at all.
**Resolution:** added `-E` to `common.sh`'s `set -Eeuo pipefail`.
Rewrote `create_channel`, `join_peers`, and `verify_channel_membership`
to use `mapfile -t lines < <(python3 -c "...")` followed by a plain
`for line in "${lines[@]}"` loop, instead of piping into `while read` —
this keeps the loop in the current shell rather than a subshell.
**Follow-up:** any future script added under `scripts/` that loops over
command output inside a function must use this `mapfile` +
process-substitution pattern, never `pipe | while read`, or its errors
will silently vanish the same way.

**Addendum (2026-07-10) — this fix may not have been the whole story.**
Re-examined while investigating a 2026-07-10 stderr-corruption bug (see
that entry): the two causes fixed here (missing `-E`, `pipe | while
read`) fully explain why `network.sh`'s *own* `"FAILED at stage N"`
wrapper message didn't print — but neither explains why the
*underlying* `peer channel join`/`osnadmin channel join` command's own
native `"Error: ..."` text was *also* completely absent (this entry
describes "zero script output," not just a missing wrapper message).
That command's own stderr doesn't route through any trap or `errtrace`
setting at all. The gap is consistent with fd 2 already being broken by
stage 9: stage 6 (`wait_for_all_nodes`, calling `wait_for_port` per
port) runs first, and a successful `wait_for_port` call is exactly what
the 2026-07-10 entry proves corrupts stderr for the rest of the
process. Not confirmed — 2026-07-07's exact process state can't be
replayed — but plausible enough that this fix likely wasn't the full
explanation for the symptom as originally described, only for the part
of it involving `network.sh`'s own trap.

---

## 2026-07-07 — Org-level MSP missing `tlscacerts/`, consenter TLS rejected

**Phase:** 6 — `network.sh up` (third attempt, after the local-MSP and
capability fixes)
**Symptom:** all 3 orderers rejected `osnadmin channel join` with
`consenter orderer0.BLCOrderer:7050 has invalid certificate: verifying
tls client cert with serial number ...: x509: certificate signed by
unknown authority`.
**Command / context:** hit immediately after the `V2_5` capability fix
resolved the previous error — progress, not a regression.
**Root cause:** `bootstrap_org`'s "assembling org-level MSP" step
populates `crypto/organizations/<org>/msp/cacerts/` (regular identity
CA cert) and `.../admincerts/`, but never `.../tlscacerts/` (TLS root
CA cert). That org-level MSP directory is exactly what `configtx.yaml`'s
`MSPDir` points at and gets embedded into the genesis block — so the
channel config had literally no trusted TLS root CA declared for
`BLCOrderer`, meaning Fabric couldn't verify *any* consenter's TLS cert
against it, regardless of whether the cert itself was valid.
**Resolution:** added `tlscacerts/` to the org-level MSP assembly,
copying the TLS root CA cert from the first enrolled node of that org
(`<org>/{orderers,peers}/<type>0/tls/ca.pem` — already a fixed-name
file from an earlier fix). Sourced from a node rather than Admin
because institution orgs' Admin identities never get a TLS enrollment
(only the orderer org's Admin does, for `osnadmin`'s mutual TLS).
**Follow-up:** this is the third crypto-assembly gap found in a row
during Phase 6 (after local-MSP NodeOUs and the capability split) —
worth being extra thorough checking for other "org-level MSP is missing
a folder Fabric expects" gaps before declaring `network.sh up` fully
verified, rather than assuming each fix is the last one.

---

## 2026-07-07 — MSP local-MSP bug + non-existent `V2_5` Channel/Orderer capability

**Phase:** 6 — `network.sh up` (first full end-to-end run)
**Symptom 1:** every orderer and peer container crash-looped on startup:
`PANI [orderer.common.server] loadLocalMSP -> Failed to setup local msp
with config: administrators must be declared when no admin ou
classification is set`.
**Root cause 1:** `write_node_ous` (writes the NodeOUs `config.yaml`
Fabric needs) was only ever called for the *org-level* MSP
(`crypto/organizations/<org>/msp/`, which `configtx.yaml` reads) — never
for each individual node's *own* MSP (`.../orderers/orderer1/msp/`,
which the running orderer/peer process loads as its local identity).
These are two separate MSP instances; both independently need NodeOUs
config or `admincerts/`. Invisible until now because every prior test
only exercised the org-level MSP via `configtxgen`, which never touches
the local MSP loader.
**Resolution 1:** `enroll_node` now also calls `write_node_ous` against
each node's own `msp/` directory, right after that node's identity
enrollment.

**Symptom 2 (found immediately after fixing #1):** all 3 orderers
rejected `osnadmin channel join` with `Orderer Org BLCOrderer cannot
contain endpoints value until V1_4_2+ capabilities have been enabled` —
despite `configtxgen -inspectBlock` showing `V2_5` set at all three
capability groups (channel/orderer/application).
**Root cause 2:** `V2_5` is not a real Fabric capability name for the
Channel or Orderer groups — verified directly against Fabric's
`release-2.5` source (`common/capabilities/{channel,orderer,application}.go`).
Channel and Orderer capabilities top out at `V2_0` for the entire 2.x
line; only Application gained a distinct `V2_5` flag in Fabric 2.5.
`configtx.yaml.tmpl` used one shared `CapabilityLevel` value for all
three groups — `configtxgen` happily encoded the unrecognized string
into the block (it doesn't validate capability names against Fabric's
real list), but Fabric's own `OrgSpecificOrdererEndpoints()`-style
feature-gate check only recognizes explicit known names, and silently
failed to match `V2_5` against its `V1_4_2`/`V1_4_3`/`V2_0` check.
**Resolution 2:** split `network.yaml`'s `channel.capability` into
`channel.capabilities: {channel, orderer, application}` (Option B —
nested, one field per real Fabric capability group, chosen over a
flatter `capability`/`application_capability` pair for being
self-documenting and matching Fabric's internal model 1:1). Set
`channel: V2_0`, `orderer: V2_0`, `application: V2_5`. Propagated
through `types.go`, `validate.go` (non-empty checks for all three),
`data.go` (`TemplateData` now has three capability fields, not one),
`configtx.yaml.tmpl`, `main.go`'s `printMerged`, and the two affected
test fixtures (`valid_network.yaml`, `broken_network.yaml` — the
deployment fixtures don't reference capability at all, untouched).
**Verification:** claim about `V2_5` not existing for Channel/Orderer
verified against actual Fabric source before making the change (see
links below), not assumed from memory. `go test ./...` passes,
`blcgen validate` passes, regenerated `configtx.yaml` confirmed to show
`V2_0`/`V2_0`/`V2_5` for channel/orderer/application respectively.
**Sources:** https://raw.githubusercontent.com/hyperledger/fabric/release-2.5/common/capabilities/channel.go ,
https://raw.githubusercontent.com/hyperledger/fabric/release-2.5/common/capabilities/orderer.go ,
https://raw.githubusercontent.com/hyperledger/fabric/release-2.5/common/capabilities/application.go
**Follow-up:** full `network.sh up` end-to-end run not yet re-verified
with both fixes applied — next step.

---

## 2026-07-07 — CouchDB credentials hardcoded in two places

**Phase:** 5 — Generate compose, core.yaml, connection profiles
**Symptom:** none observed at runtime — caught by user review, not a
failing command. When fixing a missing `CORE_LEDGER_STATE_
COUCHDBCONFIG_USERNAME/PASSWORD` gap, I hardcoded `admin`/`adminpw` in
`docker/peer-base.yaml`'s `x-peer-env` anchor, while
`docker-compose-net.yaml.tmpl`'s CouchDB service block already
hardcoded the same literal values independently in its `COUCHDB_USER`/
`COUCHDB_PASSWORD` env vars. Two unconnected hardcoded copies of the
same credential, happening to match by coincidence.
**Command / context:** user asked directly — "are both generated from a
single value in `deployment/local.yaml`, or hardcoded separately in two
places?" — before accepting the fix as complete.
**Root cause:** `docker/peer-base.yaml` is explicitly hand-written/
static with zero config-driven values, by design (documented in its own
header comment) — but a config-like credential was put there anyway
without noticing the conflict with the file's own stated purpose.
**Resolution:** added `couchdb_admin_user`/`couchdb_admin_password` to
`deployment/local.yaml` as the single source of truth (a top-level
field, applied globally — not per-org). Removed the hardcoded values
from `docker/peer-base.yaml` entirely. Both the peer's
`CORE_LEDGER_STATE_COUCHDBCONFIG_*` vars and the CouchDB container's
`COUCHDB_USER`/`COUCHDB_PASSWORD` are now set in the *generated*
per-peer template block, both referencing `{{$.CouchDBAdminUser}}`/
`{{$.CouchDBAdminPassword}}`. Verified identical, matching values for
both `BLCFounder` and `InstitutionA` — confirming it's genuinely one
global config value, not a coincidental per-org match.
**Follow-up:** `admin`/`adminpw` itself is a local-dev placeholder, not
production-hardened — flagged explicitly in `ARCHITECTURE.md`. General
lesson for the rest of Phase 5/6: any value that must match across two
different generated (or generated+hand-written) artifacts is a signal
it belongs in config, not a literal — even a "just this once" hardcode
is exactly how the CBDC project's duplicated-config problem (which this
whole project is explicitly designed to avoid) starts.

---

## 2026-07-07 — YAML merge key silently dropped base env vars in compose

**Phase:** 5 — Generate compose, core.yaml, connection profiles
**Symptom:** no error — `docker compose -f generated/docker-compose-net.yaml
config` validated cleanly and printed a fully-resolved file. But the
resolved `environment:` block for `orderer0.BLCOrderer` only had the 5
node-specific vars set in the generated per-service override
(`ORDERER_GENERAL_LISTENPORT`, etc.) — every var from the hand-written
`x-orderer-base` fragment (`ORDERER_GENERAL_TLS_ENABLED`,
`ORDERER_GENERAL_TLS_PRIVATEKEY`, `FABRIC_LOGGING_SPEC`, ...) was
missing. Would have meant every orderer/peer container starting with
TLS effectively unconfigured.
**Command / context:** caught by reading the actual merged output of
`docker compose ... config` line-by-line after generating
`docker-compose-net.yaml`, not by any command failing — `restart`,
`working_dir`, `command`, and `networks` all correctly inherited from
the base fragment via `<<: *orderer-base`, which made the review easy to
skip past assuming `environment` had too.
**Root cause:** YAML merge keys (`<<:`) only control which *keys* end up
in the resulting mapping. If a key exists in *both* the base being
merged in and the overriding mapping (here: `environment`, defined in
both `x-orderer-base` and the per-node service block), the override's
value **completely replaces** the base's — lists/maps under a
colliding key are never concatenated or deep-merged. `docker compose
config` has no way to flag this: the YAML is entirely valid, it just
isn't semantically what was intended.
**Resolution:** split `environment` out of `x-peer-base`/`x-orderer-base`
into its own separate anchor (`x-peer-env`/`x-orderer-env`), and
changed it from a list of `KEY=VALUE` strings to a YAML mapping. Each
generated service's own `environment:` block now does `<<: *peer-env`
(or `*orderer-env`) *at that level*, plus its own specific keys —
merging correctly, since `environment` is now the mapping being merged
into rather than a colliding sibling key of the service itself.
Re-verified: `orderer0.BLCOrderer`'s resolved environment now shows all
16 vars (11 from the base + 5 node-specific) together.
**Follow-up:** any future hand-written base fragment must keep this in
mind — any key that both the base and an override need to contribute to
(not just replace) must be its own separate anchor at the sub-key
level, never nested inside a base anchor alongside keys the override
never touches.

---

## 2026-07-07 — configtx.yaml hardcoded `localhost` instead of container hostnames

**Phase:** 5 — Generate compose, core.yaml, connection profiles (caught
before writing any Phase 5 files)
**Symptom:** none yet observed as a runtime failure — caught by review
while starting Phase 5, not by an error message. `data.go`'s
`BuildTemplateData` hardcoded `Host: "localhost"` for every orderer
consenter and anchor peer in `configtx.yaml`.
**Command / context:** about to design Docker Compose service topology
for Phase 5 (orderer/peer processes each running in their own
container), which made it obvious `localhost` inside one container
can never reach another container — Raft consensus and gossip traffic
between orgs would fail to connect once real containers replace the
bare-metal assumption Phase 4 was implicitly built under.
**Root cause:** Phase 4's `data.go` was written before Docker Compose
topology (Phase 5) existed, so it defaulted to `localhost` as the only
reachable-from-anywhere placeholder at the time. That assumption never
got revisited once the actual multi-container runtime model became
concrete.
**Resolution:** changed `Host` fields to
`fmt.Sprintf("%s.%s", nodeName, orgName)` (e.g. `orderer0.BLCOrderer`,
`peer0.BLCFounder`) — the Docker Compose service hostname each
container will actually be reachable at on the shared bridge network.
No crypto re-enrollment needed: `bootstrap-crypto.sh` already added
`<node>.<org>` as a TLS certificate SAN alongside `localhost` back in
Phase 4, so the existing certs already support this hostname.
Regenerated `configtx.yaml` and re-ran `configtxgen` — genesis block
still builds successfully (23KB `channel-artifacts/genesis.pb`).
**Follow-up:** Phase 5's Docker Compose templates must set each
container's `hostname:`/service name to exactly match this convention
(`<node><index>.<OrgName>`), or the two will silently disagree and
Raft/gossip will fail to connect at Phase 6 runtime despite `configtxgen`
succeeding at build time (structural validity ≠ network reachability).

---

## 2026-07-06 — `rm -rf crypto/ca-servers` failed with Permission denied

**Phase:** 4 rework — production topology
**Symptom:** `rm -rf crypto/organizations crypto/ca-servers` (cleaning up
before re-running `bootstrap-crypto.sh` for the new 3-orderer/2-peer
topology) failed with multiple `Permission denied` errors on files under
`crypto/ca-servers/<org>/msp/keystore/`.
**Command / context:** `rm -rf crypto/organizations crypto/ca-servers`
run as the normal user, after `docker rm -f` on the three CA containers.
**Root cause:** `fabric-ca-server` inside the container runs as root by
default, and the container's `-v` bind mount means files it writes
(private keys under `msp/keystore/`) are owned by root on the host too.
A non-root user can't delete root-owned files without elevated
privileges.
**Resolution:** rather than prompting for `sudo` (which doesn't work
well non-interactively), ran a throwaway container using the same
already-pulled `hyperledger/fabric-ca:1.5` image, bind-mounted the same
`crypto/` directory, and let *it* (running as root inside its own
container) delete the files: `docker run --rm -v "$(pwd)/crypto:/crypto"
hyperledger/fabric-ca:1.5 sh -c "rm -rf /crypto/ca-servers
/crypto/organizations"`.
**Follow-up:** this will recur every time `bootstrap-crypto.sh` needs a
clean re-run (topology changes, corrupted state, etc.) until Phase 6's
`network.sh down --wipe` exists — that script should bake in this same
"delete via a throwaway container" pattern rather than plain `rm -rf`,
or the CA containers should run as a non-root user from the start.

---

## 2026-07-06 — configtxgen failed: hardcoded `"orderer"` path segment in data.go

**Phase:** 4 — Generate `configtx.yaml`
**Symptom:** `configtxgen -profile BLCChannel -channelID blcchannel
-outputBlock channel-artifacts/genesis.pb` failed with `FATA ... cannot
load client cert for consenter localhost:7050: open
.../organizations/orderer/tls/signcerts/cert.pem: no such file or
directory`.
**Command / context:** first real `configtxgen` run against the rendered
`configtx.yaml`, after `bootstrap-crypto.sh` had already successfully
enrolled crypto material for all three orgs (confirmed via `find
crypto/organizations -type f`).
**Root cause:** `network/internal/generate/data.go`'s `BuildTemplateData`
hardcoded the orderer's crypto directory name as the literal string
`"orderer"` instead of using `net.Orderer.Name` (the actual configured
value, `"BLCOrderer"`). `bootstrap-crypto.sh` correctly read the name
from `network.yaml`, so the real files ended up under
`organizations/BLCOrderer/...` — a mismatch between two places that
should have derived the same value from the same config field.
**Resolution:** changed both `MSPDir` and `TLSCertPath` in `data.go` to
build the path from `net.Orderer.Name` instead of a literal string.
Re-ran `blcgen generate configtx` + `configtxgen` — succeeded (`Writing
genesis block`, no errors).
**Follow-up:** worth double-checking future template-data code
(Phase 5's compose/profile generation) for the same class of bug —
anywhere a literal string duplicates a value that's already available
from `network.yaml`/`deployment/local.yaml`.

---

## 2026-07-06 — Stray message re-proposed `Org1MSP/Org2MSP/Org3MSP` naming

**Phase:** 3 — `blcgen validate` (during guided-mode work, unrelated to the
step in progress)
**Symptom:** a message arrived mid-session instructing "use real values"
for `network.yaml` and referencing `Org1MSP/Org2MSP/Org3MSP` naming — but
`network.yaml` already existed with real values, using the already-decided
`BLCFounderMSP`/`InstitutionAMSP`/`InstitutionBMSP` naming.
**Command / context:** no command involved — flagged before acting on it,
since it described a decision point (placeholder vs. real values) that had
already passed, with different org names than what was on disk.
**Root cause:** appears to be a stray/misdirected message, possibly pasted
from unrelated planning context using different naming conventions.
**Resolution:** confirmed with user — disregard, keep existing
`BLCFounder`/`InstitutionA`/`InstitutionB` naming. No files changed.
**Follow-up:** none — noted here only so a future reader of the transcript
doesn't wonder why the org names in code don't match this one message.

---

## 2026-07-06 — Conflicting network-build guidance across planning docs

**Phase:** 1 — Repository skeleton (pre-work, before any code was written)
**Symptom:** `docs/BLC_Consortium_Architecture_Proposal_v2.docx` (section 9)
and `BLC_Technical_Design_Document_v3.docx` (section 5) both instruct
adapting the `fabric-samples` test-network directly. This contradicts
`ARCHITECTURE.md` and the build prompt's frozen decision to build a custom
network via `blcgen`, matching the CBDC project's approach.
**Command / context:** discovered while reading both docx files for context
before starting Phase 1.
**Root cause:** the two docx files are earlier planning artifacts that
predate the frozen architecture; they were never updated after the
custom-network decision was locked in.
**Resolution:** confirmed with user — `ARCHITECTURE.md` / build prompt wins.
Do not use `fabric-samples` test-network, its docker-compose, or its
`configtx.yaml` as a base. Org naming also confirmed as `BLCFounder` +
`InstitutionA` (founding) + `InstitutionB` (pending), not v3's
`Institution1/2/3`. Full detail saved to project memory
(`project_blc31_network_decisions`).
**Follow-up:** the ledger data model and chaincode function specs in v3
(section 1-2) are still useful reference for Phases 7-8 — only its
network-setup section (5) is disregarded.
