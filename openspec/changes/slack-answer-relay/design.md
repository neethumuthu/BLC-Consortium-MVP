## Architecture

1. **Extend the existing Slack App** ("AI SDLC Pipeline Bot," already
   installed, already holds `SLACK_WEBHOOK_PIPELINE`) — Socket Mode is
   already enabled on this app; add a Bot User (`channels:history`,
   `chat:write` scopes), an Event Subscription on `message.channels`, and
   a new **App-Level Token** (`connections:write` scope) for the WebSocket
   connection. One app, not two.
2. **A new relay service** (`slack-relay/`, TypeScript, compiled to
   `dist/` via `tsc` — matches `backend/`'s own toolchain, not a new
   runtime) running as a new systemd unit (`blc-slack-relay`) on the
   existing Azure staging VM. No inbound network exposure at all — it
   opens the WebSocket connection outbound to Slack on startup.
3. **Relay logic**, in order:
   - Receive each event over `@slack/socket-mode`'s `SocketModeClient`
     `'message'` listener and call `ack()` immediately (see "Why Socket
     Mode" below for the exact, verified API).
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

### Why Socket Mode, and the exact verified API

Phase 0 (PR #20) built an HTTP-webhook receiver — Express, HMAC signature
verification, a public Request URL through Caddy. While starting Phase 1,
the Slack App's own Event Subscriptions page showed Socket Mode already
enabled ("Socket Mode is enabled. You won't need to specify a Request
URL."). Switched to it rather than disabling it: no public endpoint to
expose or secure, no Caddy/NSG change, and it's already the app's real
configured state — turning it off to keep the original design would have
been fighting the platform rather than using it.

**Verified against the installed `@slack/socket-mode` package's own
runtime source** (`node_modules/@slack/socket-mode/dist/src/
SocketModeClient.js`), not just docs prose, since the docs and the
package's own `.d.ts` files don't fully agree on the callback shape:

- `new SocketModeClient({ appToken })` — `appToken` is the App-Level Token
  (`xapp-...`, `connections:write` scope), a credential the original Phase
  1 plan didn't anticipate.
- For an `events_api` envelope, the client emits an event named after the
  inner event's own `type` (e.g. `'message'`), with a payload of
  `{ack, envelope_id, body, event, retry_num, retry_reason,
  accepts_response_payload}` — confirmed directly from the `emit()` call
  site, not inferred. **`body` is the full `event_callback`-shaped
  payload** (`type`, `event_id`, `event`) — byte-for-byte the same shape
  the original HTTP transport delivered, so it's passed straight into the
  existing, unmodified `RelayHandler.handle()` with no transformation.
- `ack` is `async (response?) => {...}`, sending `{envelope_id, payload:
  {...response}}` back over the socket. Called with no arguments for
  `message` events (no response payload is needed, unlike e.g. slash
  commands).
- The package exports no TypeScript type for this listener-argument shape
  (`SocketModeClient`'s own `.d.ts` has no generic event map), so
  `socketReceiver.ts` declares its own `SocketMessageEventArgs` interface
  matching the verified runtime shape above.

**What stayed, what left:** `RelayHandler`, `DedupeStore`, `linkResolver.ts`,
`slackText.ts`, `slackClient.ts`, `githubClient.ts` and all their existing
tests are untouched — Socket Mode only changes how events are *received*,
never how the relay calls the Slack/GitHub Web APIs to act, which stays
plain HTTPS via the existing hand-rolled `SlackClient`/`GithubClient`
(deliberately not swapped for `@slack/web-api`'s `WebClient` — the existing
clients already do exactly what's needed and were hardened through 7 Ring
2 review rounds; only the transport layer needed replacing).
`app.ts`/`app.spec.ts` (the Express receiver + its supertest coverage) and
`signature.ts`/`signature.spec.ts` (HMAC verification — Socket Mode's
connection is authenticated by the app-level token itself, there's no
per-request signature and no `url_verification` handshake in this
transport) are removed, replaced by a new `socketReceiver.ts` (+ its own
`.spec.ts`, testing the `{event, body, ack}` handling directly without a
real WebSocket connection).

### Why a new PAT, not `DISPATCH_TOKEN`

`DISPATCH_TOKEN` is a broad classic `repo`-scope PAT, created specifically
for firing `repository_dispatch` from inside Actions. Reusing it here
breaks this repo's established single-purpose-credential pattern and
moves a broad, Actions-only secret onto an external VM's disk — a
meaningfully larger blast radius than a fine-grained, Issues-only PAT
proportionate to "post one comment."

### Why not fold this into one of the three existing backend instances

Each existing backend instance is scoped to one institution's own Fabric
identity (`MSP_ID`, admin credentials, one org's gateway connection). The
Slack relay is a cross-org, PM-facing concern with no natural institution
owner — bolting it onto e.g. BLCFounder's backend would be a scope
mismatch, the same reasoning already applied to keeping
`context-gardener`/`context-drift-check` as separate jobs from each other
despite sharing a dispatcher.

## Phased plan

- **Phase 0 (done, merged — PR #20)** — relay service written and
  unit-tested (64 tests, 7 Ring 2 rounds) against the original
  HTTP-webhook design.
- **Phase 0.5 (done, this change)** — transport rework to Socket Mode:
  removed the HTTP receiver + signature verification, added
  `socketReceiver.ts`, updated `config.ts`/`main.ts`/`package.json`. All
  pre-existing business-logic tests pass unmodified; 58/58 total.
- **Phase 1 (Neethu has edit access on the Slack app — not blocked on
  Dominik)** — add `channels:history`/`chat:write` Bot Token scopes,
  subscribe to `message.channels` bot events, generate the App-Level
  Token, invite the bot into the destination channel. No ordering
  dependency on Phase 2 anymore (no Request URL handshake to wait for).
- **Phase 2 (deploy)** — code already pulled/built on the VM and the
  systemd unit already created (disabled, 2026-08-14); once this change
  merges and Phase 1's credentials exist: pull, rebuild, write `.env`,
  enable and start. No Caddy step.
- **Phase 3 (live end-to-end test)** — a real Slack thread reply from the
  actual PM account, confirmed to land as a GitHub comment, confirmed
  `proposal-answer-sync.yml` fires and opens the expected PR, confirmed
  the ✅ reaction appears.
