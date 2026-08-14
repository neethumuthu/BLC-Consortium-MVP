import { connectSocketMode, handleSocketMessage, SocketMessageEventArgs } from "./socketReceiver";
import { RelayHandler } from "./relayHandler";
import { SlackEventCallback } from "./types";

function buildArgs(overrides: Partial<SocketMessageEventArgs> = {}): SocketMessageEventArgs {
  const body: SlackEventCallback = {
    type: "event_callback",
    event_id: "Ev001",
    event: {
      type: "message",
      channel: "C1",
      user: "U1",
      text: "let's go with option 1",
      ts: "1.0",
      thread_ts: "0.0",
    },
  };
  return {
    ack: jest.fn().mockResolvedValue(undefined),
    envelope_id: "Env001",
    body,
    event: body.event,
    ...overrides,
  };
}

describe("handleSocketMessage", () => {
  it("acknowledges the envelope and hands the body to the relay handler", async () => {
    const relayHandler = { handle: jest.fn().mockResolvedValue({ action: "relayed" }) } as unknown as jest.Mocked<RelayHandler>;
    const args = buildArgs();

    await handleSocketMessage(relayHandler, args);

    expect(args.ack).toHaveBeenCalledWith();
    expect(relayHandler.handle).toHaveBeenCalledWith(args.body);
  });

  it("acknowledges before running the relay work, not after", async () => {
    const callOrder: string[] = [];
    const args = buildArgs({
      ack: jest.fn().mockImplementation(async () => {
        callOrder.push("ack");
      }),
    });
    const relayHandler = {
      handle: jest.fn().mockImplementation(async () => {
        callOrder.push("handle");
        return { action: "relayed" };
      }),
    } as unknown as jest.Mocked<RelayHandler>;

    await handleSocketMessage(relayHandler, args);

    expect(callOrder).toEqual(["ack", "handle"]);
  });

  it("does not let a relay handler failure propagate out of the listener", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const relayHandler = {
      handle: jest.fn().mockRejectedValue(new Error("boom")),
    } as unknown as jest.Mocked<RelayHandler>;

    await expect(handleSocketMessage(relayHandler, buildArgs())).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("relay handler failed", expect.any(Error));

    consoleError.mockRestore();
  });
});

describe("connectSocketMode", () => {
  it("wires a 'message' listener, and adds our own 'error' listener on top of the client's own internal one, without starting the connection", () => {
    // SocketModeClient registers its own internal 'error' listener before
    // any caller does, so the baseline count for a bare, unwired client is
    // already 1 - assert connectSocketMode adds exactly one more, not that
    // the total is 1.
    const relayHandler = {} as unknown as RelayHandler;
    const { SocketModeClient } = jest.requireActual("@slack/socket-mode");
    const baselineErrorListeners = new SocketModeClient({
      appToken: "xapp-fake",
    }).listenerCount("error");

    const client = connectSocketMode("xapp-fake", relayHandler);

    expect(client.listenerCount("message")).toBe(1);
    expect(client.listenerCount("error")).toBe(baselineErrorListeners + 1);
  });
});
