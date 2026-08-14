import { SlackConversationsRepliesResponse } from "./types";

export class SlackClient {
  constructor(private readonly botToken: string) {}

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${this.botToken}`,
      },
      body: JSON.stringify(body),
    });
    return (await response.json()) as T;
  }

  /**
   * requirements-nudge.yml batches every blocked change into one Slack
   * message - the "parent" here is that original nudge, fetched fresh
   * rather than tracked separately, since Slack is the source of truth
   * for its own message content.
   */
  async fetchThreadParentText(channel: string, threadTs: string): Promise<string> {
    const result = await this.call<SlackConversationsRepliesResponse>("conversations.replies", {
      channel,
      ts: threadTs,
      limit: 1,
    });
    if (!result.ok || !result.messages || result.messages.length === 0) {
      throw new Error(`Failed to fetch thread parent: ${result.error ?? "unknown error"}`);
    }
    return result.messages[0].text ?? "";
  }

  async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    await this.call("reactions.add", { channel, timestamp, name: emoji });
  }

  async postThreadReply(channel: string, threadTs: string, text: string): Promise<void> {
    await this.call("chat.postMessage", { channel, thread_ts: threadTs, text });
  }
}
