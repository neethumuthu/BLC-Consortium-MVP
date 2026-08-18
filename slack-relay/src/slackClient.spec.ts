import { SlackClient } from "./slackClient";

function mockFetchOnce(jsonBody: unknown): jest.SpyInstance {
  return jest.spyOn(global, "fetch").mockResolvedValueOnce({
    json: () => Promise.resolve(jsonBody),
  } as Response);
}

describe("SlackClient", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("fetchThreadParent", () => {
    it("returns the parent message's text and isFromBot:false when bot_id is absent (a human-started thread)", async () => {
      mockFetchOnce({ ok: true, messages: [{ ts: "1.0", text: "the original nudge" }] });
      const client = new SlackClient("xoxb-fake");

      await expect(client.fetchThreadParent("C1", "1.0")).resolves.toEqual({
        text: "the original nudge",
        isFromBot: false,
      });
    });

    it("returns isFromBot:true when the parent message has a bot_id - confirmed live 2026-08-17 this is how requirements-nudge.yml's own webhook-posted nudge is attributed (subtype bot_message, bot_id set, no user field at all)", async () => {
      mockFetchOnce({ ok: true, messages: [{ ts: "1.0", text: "a nudge", bot_id: "B0BM123MAJZ" }] });
      const client = new SlackClient("xoxb-fake");

      await expect(client.fetchThreadParent("C1", "1.0")).resolves.toEqual({
        text: "a nudge",
        isFromBot: true,
      });
    });

    it("calls conversations.replies as a GET with query-string params, not a JSON body - confirmed live 2026-08-17 that this endpoint rejects a JSON body with invalid_arguments even though every field was sent", async () => {
      const fetchSpy = mockFetchOnce({ ok: true, messages: [{ ts: "1.0", text: "x" }] });
      const client = new SlackClient("xoxb-fake");

      await client.fetchThreadParent("C1", "1.0");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://slack.com/api/conversations.replies?channel=C1&ts=1.0&limit=1");
      expect(options.method).toBe("GET");
      expect(options.body).toBeUndefined();
    });

    it("throws when Slack's API returns ok:false, even on an HTTP-level success", async () => {
      mockFetchOnce({ ok: false, error: "channel_not_found" });
      const client = new SlackClient("xoxb-fake");

      await expect(client.fetchThreadParent("C1", "1.0")).rejects.toThrow("channel_not_found");
    });

    it("throws when ok:true but no messages come back", async () => {
      mockFetchOnce({ ok: true, messages: [] });
      const client = new SlackClient("xoxb-fake");

      await expect(client.fetchThreadParent("C1", "1.0")).rejects.toThrow(
        "no messages",
      );
    });
  });

  describe("addReaction", () => {
    it("resolves cleanly on ok:true", async () => {
      mockFetchOnce({ ok: true });
      const client = new SlackClient("xoxb-fake");

      await expect(client.addReaction("C1", "1.0", "white_check_mark")).resolves.toBeUndefined();
    });

    it("still calls reactions.add as a JSON POST, unlike conversations.replies", async () => {
      const fetchSpy = mockFetchOnce({ ok: true });
      const client = new SlackClient("xoxb-fake");

      await client.addReaction("C1", "1.0", "white_check_mark");

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://slack.com/api/reactions.add");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({ channel: "C1", timestamp: "1.0", name: "white_check_mark" });
    });

    it("throws on ok:false instead of silently no-op'ing (e.g. bot not yet invited to the channel)", async () => {
      mockFetchOnce({ ok: false, error: "not_in_channel" });
      const client = new SlackClient("xoxb-fake");

      await expect(client.addReaction("C1", "1.0", "white_check_mark")).rejects.toThrow(
        "not_in_channel",
      );
    });
  });

  describe("postThreadReply", () => {
    it("resolves cleanly on ok:true", async () => {
      mockFetchOnce({ ok: true });
      const client = new SlackClient("xoxb-fake");

      await expect(client.postThreadReply("C1", "1.0", "hello")).resolves.toBeUndefined();
    });

    it("throws on ok:false instead of silently no-op'ing", async () => {
      mockFetchOnce({ ok: false, error: "invalid_auth" });
      const client = new SlackClient("xoxb-fake");

      await expect(client.postThreadReply("C1", "1.0", "hello")).rejects.toThrow("invalid_auth");
    });
  });
});
