## Why

Today, `requirements-nudge.yml` notifies Dominik on Slack when a change is
blocked on a product question, with a link to a GitHub issue. He has to
click through and comment `@claude <answer>` **on GitHub** to trigger
`proposal-answer-sync.yml`, which resolves the proposal's Open Questions
section and opens a PR. Per the adoption plan's own decision log,
Dominik's *original* ask was for his **Slack** reply to sync automatically
— "answer on GitHub instead" was an implementation shortcut bundled into
the same scope-down conversation as "don't auto-resume implementation."

**Known risk, accepted, not tracked as an Open Question here on purpose:**
whether "answer on GitHub" was something Dominik separately chose, versus
an unconfirmed implementation shortcut, is still genuinely unresolved —
see `docs/AI_SDLC_FRAMEWORK_FINDINGS_REPORT.md` §6/§9 item 6. This is
deliberately *not* listed under `## Open Questions` below, because doing
so would make `requirements-nudge.yml` nudge Dominik about it automatically
— and the explicit decision (made twice now, 2026-08-13 and again
2026-08-14) is to build the missing direction without chasing that
sign-off first, not to force the question via automation. If this turns
out to answer the wrong problem, the fix is cheap: the relay only ever
posts the same `@claude <answer>` comment a human would already type.

## What Changes

- New capability: a small relay service (`slack-relay/`) that listens for
  the PM's threaded replies on the existing Slack nudge and posts the
  equivalent `@claude <answer>` comment on the linked GitHub issue
  automatically, with a ✅ reaction back in Slack on success.
- `proposal-answer-sync.yml`'s own scope, trigger, and behavior are
  completely unchanged — the relay produces the same comment a human
  would type; nothing downstream needs to know the difference.
- The `ai-pr-review.yml` PR-vs-tracking-issue guard fix originally
  planned as an adjacent fix here was **pulled out and landed separately,
  directly on `main`**, not as part of this change — GitHub Actions won't
  run a modified workflow file against the PR that changes it, so
  bundling it here would have meant this PR could never get a real Ring 2
  review of the actual relay code. See `docs/BUILD_LOG.md` for that fix.

**Transport pivot, mid-Phase-1 (2026-08-14):** the relay was originally
built (Phase 0, PR #20) as an HTTP-webhook receiver — Express, HMAC
signature verification, a public Request URL routed through Caddy. While
starting Phase 1, checking the Slack App's own Event Subscriptions page
found **Socket Mode already enabled** on "AI SDLC Pipeline Bot." Switched
to it rather than turning it off: no public endpoint, no Caddy/NSG change,
better security posture, and it's already the app's actual configured
state. `app.ts`/`signature.ts` (and their tests) were removed; a new
`socketReceiver.ts` wraps `@slack/socket-mode`'s `SocketModeClient` and
hands events to the same, otherwise-unmodified `RelayHandler` — the entire
business-logic layer (dedupe, link disambiguation, Slack-markup cleanup,
GitHub posting) is transport-agnostic and untouched. Full rationale and the
exact package API (verified against the installed package's own source,
not just docs) is in `design.md`.

## Capabilities

### New Capabilities
- `slack-answer-relay`: relays a PM's threaded Slack reply to the
  matching GitHub issue as an `@claude <answer>` comment.

### Modified Capabilities
(none — `proposal-answer-sync.yml` and `requirements-nudge.yml` are
consumed as-is, not changed)

**`skip_specs: true`** — this is process/CI tooling, the same category as
`ai-pr-review.yml`/`context-gardener.yml`/etc., none of which have
`openspec/specs/` coverage. It has no HTTP-reachable route on the actual
BLC-31 product and isn't part of the certificate/institution/governance
domain the existing specs describe.

## Impact

- New: `slack-relay/` (TypeScript service, own `package.json`).
- New (VM-only, not committed): systemd unit `blc-slack-relay` (created
  2026-08-14, disabled pending credentials), a `.env` with the app
  token/bot token/`SLACK_RELAY_GH_PAT`.
- No change to `requirements-nudge.yml` or `proposal-answer-sync.yml`.
- `.github/workflows/ai-pr-review.yml`'s guard fix landed separately,
  directly on `main`, not as part of this change (see "What Changes").
- **No Caddy change, no NSG change, no new DNS, no public port at all** —
  Socket Mode is an outbound connection from the relay to Slack, not an
  inbound one. The originally-planned Caddyfile edit is dropped entirely,
  not deferred.
