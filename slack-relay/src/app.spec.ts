import { createHmac } from "crypto";
import request from "supertest";
import { createApp } from "./app";
import { RelayHandler } from "./relayHandler";

const SIGNING_SECRET = "test-signing-secret";

function sign(timestamp: string, rawBody: string): string {
  const base = `v0:${timestamp}:${rawBody}`;
  return `v0=${createHmac("sha256", SIGNING_SECRET).update(base).digest("hex")}`;
}

function signedRequest(app: ReturnType<typeof createApp>, body: object) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return request(app)
    .post("/slack/events")
    .set("X-Slack-Request-Timestamp", timestamp)
    .set("X-Slack-Signature", sign(timestamp, rawBody))
    .set("Content-Type", "application/json")
    .send(rawBody);
}

describe("POST /slack/events", () => {
  let relayHandler: jest.Mocked<RelayHandler>;

  beforeEach(() => {
    relayHandler = { handle: jest.fn().mockResolvedValue({ action: "duplicate_event" }) } as
      unknown as jest.Mocked<RelayHandler>;
  });

  it("rejects a request with no signature headers at all", async () => {
    const app = createApp(SIGNING_SECRET, relayHandler);
    const response = await request(app)
      .post("/slack/events")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "event_callback" }));

    expect(response.status).toBe(401);
    expect(relayHandler.handle).not.toHaveBeenCalled();
  });

  it("rejects a request signed with the wrong secret", async () => {
    const app = createApp(SIGNING_SECRET, relayHandler);
    const body = JSON.stringify({ type: "event_callback" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const wrongSignature = `v0=${createHmac("sha256", "wrong-secret").update(`v0:${timestamp}:${body}`).digest("hex")}`;

    const response = await request(app)
      .post("/slack/events")
      .set("X-Slack-Request-Timestamp", timestamp)
      .set("X-Slack-Signature", wrongSignature)
      .set("Content-Type", "application/json")
      .send(body);

    expect(response.status).toBe(401);
    expect(relayHandler.handle).not.toHaveBeenCalled();
  });

  it("echoes the challenge back at 200 for a correctly signed url_verification request", async () => {
    const app = createApp(SIGNING_SECRET, relayHandler);
    const response = await signedRequest(app, {
      type: "url_verification",
      challenge: "abc123",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ challenge: "abc123" });
    expect(relayHandler.handle).not.toHaveBeenCalled();
  });

  it("acknowledges a correctly signed event_callback immediately and hands it to the relay handler", async () => {
    const app = createApp(SIGNING_SECRET, relayHandler);
    const response = await signedRequest(app, {
      type: "event_callback",
      event_id: "Ev001",
      event: { type: "message", channel: "C1", user: "U1", ts: "1.0", thread_ts: "0.0" },
    });

    expect(response.status).toBe(200);
    // The handler runs asynchronously after the response is sent - give
    // the pending promise a tick to resolve before asserting on it.
    await new Promise((resolve) => setImmediate(resolve));
    expect(relayHandler.handle).toHaveBeenCalledTimes(1);
  });

  it("responds ok on /healthz without touching signature verification", async () => {
    const app = createApp(SIGNING_SECRET, relayHandler);
    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.text).toBe("ok");
  });
});
