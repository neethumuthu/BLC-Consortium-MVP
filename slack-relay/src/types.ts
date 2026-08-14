export interface SlackMessageEvent {
  type: "message";
  subtype?: string;
  channel: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
}

export interface SlackEventCallback {
  type: "event_callback";
  event_id: string;
  event: SlackMessageEvent;
}

export interface SlackUrlVerification {
  type: "url_verification";
  challenge: string;
}

export type SlackEventPayload = SlackEventCallback | SlackUrlVerification;

export interface SlackConversationsRepliesResponse {
  ok: boolean;
  messages?: Array<{ ts: string; text?: string; thread_ts?: string }>;
  error?: string;
}
