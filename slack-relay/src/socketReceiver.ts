import { SocketModeClient } from "@slack/socket-mode";
import { RelayHandler } from "./relayHandler";
import { SlackEventCallback } from "./types";

/**
 * The shape SocketModeClient actually emits on 'message' - confirmed by
 * reading its own runtime source (node_modules/@slack/socket-mode/dist/src/
 * SocketModeClient.js), not assumed from docs prose: for an `events_api`
 * envelope, it emits `event.payload.event.type` (e.g. "message") with
 * `{ack, envelope_id, body, event, ...}`, where `body` is the full
 * event_callback-shaped payload (`type`, `event_id`, `event`) - the exact
 * same shape the original HTTP-webhook transport delivered. The package
 * itself exports no type for this listener argument, so it's declared here.
 */
export interface SocketMessageEventArgs {
  ack: (response?: unknown) => Promise<void>;
  envelope_id: string;
  body: SlackEventCallback;
  event: SlackEventCallback["event"];
  retry_num?: number;
  retry_reason?: string;
  accepts_response_payload?: boolean;
}

/**
 * Acknowledges immediately - the Socket Mode equivalent of responding HTTP
 * 200 right away, before the (possibly slower) relay work runs - then hands
 * the envelope's body straight to the unchanged RelayHandler. Exported
 * separately from connectSocketMode so it's directly unit-testable without
 * a real WebSocket connection, the same way the old app.ts's route handler
 * was tested via supertest.
 */
export async function handleSocketMessage(
  relayHandler: RelayHandler,
  args: SocketMessageEventArgs,
): Promise<void> {
  await args.ack();
  try {
    const outcome = await relayHandler.handle(args.body);
    // eslint-disable-next-line no-console
    console.log("relay outcome", outcome);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("relay handler failed", error);
  }
}

/**
 * Builds and wires the client but does not start() it - matches the old
 * createApp()/app.listen() split, so main.ts controls when the connection
 * actually opens.
 */
export function connectSocketMode(appToken: string, relayHandler: RelayHandler): SocketModeClient {
  const client = new SocketModeClient({ appToken });

  client.on("message", (args: SocketMessageEventArgs) => {
    void handleSocketMessage(relayHandler, args);
  });

  client.on("error", (error: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Socket Mode client error:", error);
  });

  return client;
}
