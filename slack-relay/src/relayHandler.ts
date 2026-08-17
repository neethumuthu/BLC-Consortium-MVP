import { Config } from "./config";
import { DedupeStore } from "./dedupeStore";
import { filterEvent } from "./eventFilter";
import { GithubClient } from "./githubClient";
import { resolveIssueNumber } from "./linkResolver";
import { SlackClient } from "./slackClient";
import { slackTextToPlainText } from "./slackText";
import { SlackEventCallback } from "./types";

const CHECKMARK_EMOJI = "white_check_mark";

export type RelayOutcome =
  | { action: "ignored"; reason: string }
  | { action: "duplicate_event" }
  | { action: "already_relayed"; issueNumber: string }
  | { action: "no_issue_link_found" }
  | { action: "ambiguous"; candidates: string[] }
  | { action: "relayed"; issueNumber: string }
  | { action: "relay_failed"; issueNumber: string; error: string }
  | { action: "concurrent_reply_in_progress" }
  | { action: "thread_lookup_failed"; error: string };

export class RelayHandler {
  constructor(
    private readonly config: Config,
    private readonly slack: SlackClient,
    private readonly github: GithubClient,
    private readonly dedupe: DedupeStore,
  ) {}

  /**
   * Every PM-facing notice below is best-effort: it must never itself
   * throw and mask the outcome that's actually being returned, or crash
   * the handler for a reason unrelated to the real failure being
   * reported. If Slack can't even take the notice (missing scope, bot
   * not yet invited to the channel - a real near-term state per Phase
   * 1's own task 2.3), that's a server-side signal to log, not something
   * to propagate.
   */
  private async notifyThread(channel: string, threadTs: string, text: string): Promise<void> {
    try {
      await this.slack.postThreadReply(channel, threadTs, text);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to post a notice to Slack thread ${threadTs}:`, error);
    }
  }

  async handle(payload: SlackEventCallback): Promise<RelayOutcome> {
    if (this.dedupe.isDuplicateEvent(payload.event_id)) {
      return { action: "duplicate_event" };
    }

    const filterResult = filterEvent(payload.event, this.config.pmSlackMemberId);
    if (!filterResult.relayable) {
      return { action: "ignored", reason: filterResult.reason };
    }

    const { channel, thread_ts: threadTs, text: rawReplyText = "" } = payload.event;
    // A human typing directly on GitHub types plain text - Slack's own
    // escaped/mrkdwn representation must never leak into the relayed
    // comment, or into the disambiguation match against it.
    const replyText = slackTextToPlainText(rawReplyText);

    const existing = this.dedupe.alreadyRelayed(threadTs!);
    if (existing) {
      await this.notifyThread(
        channel,
        threadTs!,
        `Already relayed to GitHub issue #${existing.issueNumber} (at ${existing.relayedAt}) - not opening a second one.`,
      );
      return { action: "already_relayed", issueNumber: existing.issueNumber };
    }

    // Synchronous check-and-set, before any `await` below - closes the
    // race where two near-simultaneous replies in the same thread (e.g.
    // a quick correction right after the first answer) could both pass
    // the `alreadyRelayed` read above before either finishes the async
    // work that would make the second one see it. Same technique
    // `isDuplicateEvent` already uses for `event_id`, applied to
    // `thread_ts` too.
    if (!this.dedupe.claimThread(threadTs!)) {
      await this.notifyThread(
        channel,
        threadTs!,
        "Another reply in this thread is already being relayed right now - not opening a second one.",
      );
      return { action: "concurrent_reply_in_progress" };
    }

    let parentText: string;
    try {
      parentText = await this.slack.fetchThreadParentText(channel, threadTs!);
    } catch (error) {
      // Claimed but never fulfilled - must be released, or every future
      // reply in this thread gets concurrent_reply_in_progress forever
      // with no comment ever posted and no way to recover short of a
      // service restart.
      this.dedupe.releaseClaim(threadTs!);
      const message = error instanceof Error ? error.message : String(error);
      await this.notifyThread(
        channel,
        threadTs!,
        `Couldn't look up this thread's original message (${message}) - please answer directly on the issue instead.`,
      );
      return { action: "thread_lookup_failed", error: message };
    }

    const resolution = resolveIssueNumber(
      parentText,
      replyText,
      this.config.githubOwner,
      this.config.githubRepo,
    );

    if (resolution.status === "none") {
      // No relay happened - release the claim so a genuine follow-up
      // reply in this thread (e.g. the PM clarifying) isn't permanently
      // blocked by a claim nothing ever fulfilled.
      this.dedupe.releaseClaim(threadTs!);
      await this.notifyThread(
        channel,
        threadTs!,
        "Couldn't find a linked GitHub issue in this thread - not relaying. Please answer directly on the issue instead.",
      );
      return { action: "no_issue_link_found" };
    }

    if (resolution.status === "ambiguous") {
      this.dedupe.releaseClaim(threadTs!);
      const list = resolution.candidates.map((n) => `#${n}`).join(", ");
      await this.notifyThread(
        channel,
        threadTs!,
        `This thread links more than one issue (${list}) and I can't tell which one your reply answers - please answer directly on the right issue instead, or mention its number (e.g. "#${resolution.candidates[0]}") in your reply.`,
      );
      return { action: "ambiguous", candidates: resolution.candidates };
    }

    try {
      await this.github.postIssueComment(
        resolution.issueNumber,
        `@claude Relayed from ${this.config.pmDisplayName}'s Slack reply: ${replyText}`,
      );
    } catch (error) {
      // The PM must know their answer did NOT make it to GitHub - silence
      // here would contradict the whole point of this relay (reliably
      // producing the comment a human would type). Deliberately not
      // recorded in the dedupe store, and the claim is released, so a
      // retry (theirs or Slack's) can still succeed.
      this.dedupe.releaseClaim(threadTs!);
      const message = error instanceof Error ? error.message : String(error);
      await this.notifyThread(
        channel,
        threadTs!,
        `Couldn't relay this to GitHub issue #${resolution.issueNumber} (${message}) - please answer directly on the issue instead.`,
      );
      return { action: "relay_failed", issueNumber: resolution.issueNumber, error: message };
    }

    try {
      this.dedupe.recordRelayed(threadTs!, resolution.issueNumber, new Date().toISOString());
    } catch (error) {
      // The GitHub comment already posted successfully - telling the PM
      // it failed would be a lie. But an unrecorded relay means a later
      // follow-up in this thread could produce a duplicate GitHub
      // comment, which is exactly what this persisted store exists to
      // prevent (dedupeStore.ts's own header comment). Loud server-side
      // signal instead, since this is an ops-level disk/permissions
      // problem (e.g. a bad RELAYED_STORE_PATH on the VM), not something
      // the PM can act on.
      // eslint-disable-next-line no-console
      console.error(
        `DEDUPE PERSISTENCE FAILED after a successful relay (issue #${resolution.issueNumber}, thread ${threadTs}) - a later reply in this thread may cause a duplicate GitHub comment:`,
        error,
      );
    }

    try {
      await this.slack.addReaction(channel, payload.event.ts, CHECKMARK_EMOJI);
    } catch (error) {
      // The relay itself already fully succeeded - a missing confirmation
      // emoji is a nice-to-have, not a reason to report failure for a
      // comment that genuinely landed. Log-only, same principle as the
      // dedupe-persistence-failure case just above.
      // eslint-disable-next-line no-console
      console.error(`Failed to add the confirmation reaction in thread ${threadTs}:`, error);
    }

    return { action: "relayed", issueNumber: resolution.issueNumber };
  }
}
