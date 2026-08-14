## Architecture

1. **Extend the existing Slack App** ("AI SDLC Pipeline Bot," already
   installed, already holds `SLACK_WEBHOOK_PIPELINE`) — add a Bot User
   (`channels:history`, `chat:write` scopes) and Event Subscriptions on
   `message.channels`. One app, not two.
2. **A new relay service** (`slack-relay/`, TypeScript + Express, compiled
   to `dist/` via `tsc` — matches `backend/`'s own toolchain, not a new
   runtime) running as a new systemd unit (`blc-slack-relay`) on the
   existing Azure staging VM, reachable via a new Caddy `handle
   /slack/events*` block inside the existing site block.
3. **Relay logic**, in order:
   - Verify Slack's request signature (HMAC-SHA256 + timestamp, `v0=...`)
     on every request; reject stale (>5 min) or invalid ones.
   - Handle the one-time `url_verification` challenge.
   - Filter: `event.subtype` must be absent, `event.user` must equal the
     configured PM Slack ID, `event.thread_ts` must be present.
   - Resolve the parent message via `conversations.replies` —
     `requirements-nudge.yml` batches every currently-blocked change into
     one message, so the parent can link more than one issue. Exactly one
     link resolves trivially; more than one tries an explicit `#<n>`
     mention in the reply, then a distinctive-word overlap between the
     reply and each candidate's own line; still ambiguous → post a
     clarifying reply in-thread and stop, never guess.
   - Dedupe on two layers: `event_id` (in-memory, covers Slack's own
     short-window redelivery retries) and thread `ts` (persisted to a
     small JSON file on disk, survives a service restart — the real
     guarantee against relaying the same thread twice; a follow-up
     fragment in an already-relayed thread gets an "already relayed"
     notice instead of opening a second PR).
   - On success: `POST /repos/{owner}/{repo}/issues/{number}/comments`
     with body `@claude <the PM's reply text>`, run through
     `slackTextToPlainText()` first — Slack HTML-escapes `&`/`<`/`>` and
     wraps links/mentions in its own markup, which must never leak into
     the relayed comment (Ring 2 finding on PR #20, fixed). Posted via a
     dedicated fine-grained PAT scoped to this one repo, Issues read/write
     only. Stored only in the relay's own `.env` on the VM, never a
     GitHub Actions secret (nothing in Actions consumes it).
   - On success, `reactions.add` a ✅ on the PM's message.

### Why a new PAT, not `DISPATCH_TOKEN`

`DISPATCH_TOKEN` is a broad classic `repo`-scope PAT, created specifically
for firing `repository_dispatch` from inside Actions. Reusing it here
breaks this repo's established single-purpose-credential pattern and
moves a broad, Actions-only secret onto an external VM's disk — a
meaningfully larger blast radius than a fine-grained, Issues-only PAT
proportionate to "post one comment."

### Why Express, not the backend's NestJS

The backend is a multi-module Fabric-gateway service with real DI needs;
this is a single headless HTTP receiver with one route. NestJS's
decorator/module machinery would add ceremony with no matching benefit
here — plain Express matches the actual shape of the problem. The
compiled-`dist/`-then-`node dist/main.js` deployment pattern still matches
the backend's own systemd convention exactly.

### Why not fold this into one of the three existing backend instances

Each existing backend instance is scoped to one institution's own Fabric
identity (`MSP_ID`, admin credentials, one org's gateway connection). The
Slack relay is a cross-org, PM-facing concern with no natural institution
owner — bolting it onto e.g. BLCFounder's backend would be a scope
mismatch, the same reasoning already applied to keeping
`context-gardener`/`context-drift-check` as separate jobs from each other
despite sharing a dispatcher.

## Phased plan

- **Phase 0 (done, this change)** — relay service written and unit-tested
  against synthetic payloads; the `ai-pr-review.yml` guard fix applied.
  Zero Slack dependency, fully buildable and testable without any live
  credentials.
- **Phase 1 (blocked on Dominik/workspace-admin)** — enable Events API +
  bot scopes on the existing Slack app, capture the bot token/signing
  secret, invite the bot into the destination channel. Sequenced *after*
  Phase 2's deploy, since Slack's Request URL verification needs the
  relay already live and responding.
- **Phase 2 (deploy)** — new systemd unit + Caddy block + reload, new
  `.env`, enable the service.
- **Phase 3 (live end-to-end test)** — a real Slack thread reply from the
  actual PM account, confirmed to land as a GitHub comment, confirmed
  `proposal-answer-sync.yml` fires and opens the expected PR, confirmed
  the ✅ reaction appears.
