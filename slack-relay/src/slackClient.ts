import { SlackApiResponse, SlackConversationsRepliesResponse } from "./types";

export interface ThreadParent {
  text: string;
  /** True only for messages posted by a bot/webhook (e.g. requirements-nudge.yml's
   * nudge) - a human-started thread has no bot_id at all. Used to decide whether
   * the relay should engage with a thread in the first place, see relayHandler.ts. */
  isFromBot: boolean;
}

export class SlackClient {
  constructor(private readonly botToken: string) {}

  /**
   * Every Slack Web API method shares the same `{ok, error}` envelope,
   * including on HTTP 200 - a scope/auth/rate-limit failure (e.g. the bot
   * not yet invited to the channel, per Phase 1's own task 2.3) never
   * shows up as a thrown fetch error or a non-2xx status, only as
   * `ok: false` in an otherwise-successful response. Shared by both
   * transport methods below so every caller gets this for free.
   */
  private async parseSlackResponse<T extends SlackApiResponse>(
    response: Response,
    method: string,
  ): Promise<T> {
    const result = (await response.json()) as T;
    if (!result.ok) {
      throw new Error(`Slack API ${method} failed: ${result.error ?? "unknown error"}`);
    }
    return result;
  }

  private async call<T extends SlackApiResponse>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${this.botToken}`,
      },
      body: JSON.stringify(body),
    });
    return this.parseSlackResponse<T>(response, method);
  }

  /**
   * Some Slack Web API methods - conversations.replies confirmed live,
   * 2026-08-17 - do not accept a JSON POST body at all (returns
   * `invalid_arguments`, "missing required field" for every field, even
   * though they were sent) - they need query-string parameters instead.
   * chat.postMessage/reactions.add do accept JSON, which is why only this
   * one call needed its own method rather than fixing `call()` itself.
   */
  private async callWithQueryParams<T extends SlackApiResponse>(
    method: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const response = await fetch(`https://slack.com/api/${method}?${query.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
      },
    });
    return this.parseSlackResponse<T>(response, method);
  }

  /**
   * requirements-nudge.yml batches every blocked change into one Slack
   * message - the "parent" here is that original nudge, fetched fresh
   * rather than tracked separately, since Slack is the source of truth
   * for its own message content.
   */
  async fetchThreadParent(channel: string, threadTs: string): Promise<ThreadParent> {
    const result = await this.callWithQueryParams<SlackConversationsRepliesResponse>(
      "conversations.replies",
      { channel, ts: threadTs, limit: 1 },
    );
    if (!result.messages || result.messages.length === 0) {
      throw new Error("conversations.replies returned no messages for this thread");
    }
    const parent = result.messages[0];
    return { text: parent.text ?? "", isFromBot: Boolean(parent.bot_id) };
  }

  async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    await this.call<SlackApiResponse>("reactions.add", { channel, timestamp, name: emoji });
  }

  async postThreadReply(channel: string, threadTs: string, text: string): Promise<void> {
    await this.call<SlackApiResponse>("chat.postMessage", { channel, thread_ts: threadTs, text });
  }
}
