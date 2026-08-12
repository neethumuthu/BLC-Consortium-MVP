# Claude Tags (Claude in Slack) — Evaluation Notes

Status: Internal evaluation notes, for team review. Not a vendor deliverable.

## Background

Raised during standup (2026-08-03) as a question to look into alongside the AI SDLC Framework Brownfield Rollout work: whether Claude Tag, Anthropic's Slack integration, could complement or replace the webhook-based Slack notifications (`requirements-nudge.yml`, `project-sync.yml`) already built for that rollout. This is a lightweight, single-topic investigation — not a structured evaluation on the scale of the Stage B report, and it should not be read as one.

## What it is

Claude Tag (public beta) lets users invoke Claude in Slack with `@Claude <task>`. It reads channel/thread context, responds in-thread, runs in an ephemeral Anthropic-hosted sandbox, and accesses external systems only through administrator-configured Access bundles.

## Compared with the Slack App webhook

- **Slack App webhook** (already built for this rollout): one-way, automated CI notifications — fixed messages, no interaction.
- **Claude Tag**: interactive, conversational follow-up after a notification lands. Can answer questions, reason over context, and use connected tools if granted access.

## Confirmed constraints

Verified directly against Anthropic's official documentation (`claude.com/docs/claude-tag/overview`, `claude.com/docs/claude-tag/concepts/security-and-data`), not secondhand summary:

- Requires a Claude Team or Enterprise plan. Not available on Free/Pro/Max individual plans, or for third-party deployments.
- Setup must be performed by a Claude organization Owner specifically — not any admin.
- Not compatible with Zero Data Retention (ZDR): Claude Tag retains channel memory and session transcripts, and organizations with ZDR enabled cannot use it at all.
- Channel/thread usage is billed against the organization's configured usage balance (an Owner-funded budget with an Owner-set spend limit); direct messages are billed separately, to the individual user's own Claude account.
- External systems (e.g. GitHub) are not accessible by default — must be explicitly granted through scoped Access bundles.

## Recommendation

- Continue using the Slack App webhook for deterministic CI notifications (`requirements-nudge`, `project-sync`). It already works, needs no extra plan or permissions.
- Consider Claude Tag as a complementary capability for conversational follow-up after those notifications land — e.g. discussing a spec change or reviewing implementation context in the same thread. Not a replacement for the webhook.
- Adoption is an organization-level decision, not something to self-serve, requiring:
  1. Confirmation the organization is on a Claude Team or Enterprise plan.
  2. Confirmation ZDR is not, and will not be, a requirement — this is a hard blocker if it ever is, not a reduced-feature tradeoff.
  3. A Claude organization Owner to run setup and configure any Access bundles.

## Conclusion

For the current Brownfield Rollout, the existing Slack App webhook remains the appropriate solution for automated workflow notifications. Claude Tag is best considered as a future enhancement for collaborative discussion once the organizational prerequisites are met.
