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

  describe("fetchThreadParentText", () => {
    it("returns the parent message's text on a successful, ok:true response", async () => {
      mockFetchOnce({ ok: true, messages: [{ ts: "1.0", text: "the original nudge" }] });
      const client = new SlackClient("xoxb-fake");

      await expect(client.fetchThreadParentText("C1", "1.0")).resolves.toBe(
        "the original nudge",
      );
    });

    it("throws when Slack's API returns ok:false, even on an HTTP-level success", async () => {
      mockFetchOnce({ ok: false, error: "channel_not_found" });
      const client = new SlackClient("xoxb-fake");

      await expect(client.fetchThreadParentText("C1", "1.0")).rejects.toThrow("channel_not_found");
    });

    it("throws when ok:true but no messages come back", async () => {
      mockFetchOnce({ ok: true, messages: [] });
      const client = new SlackClient("xoxb-fake");

      await expect(client.fetchThreadParentText("C1", "1.0")).rejects.toThrow(
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
