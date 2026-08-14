import { SlackMessageEvent } from "./types";

export type FilterResult =
  | { relayable: true }
  | { relayable: false; reason: "not_a_message" | "has_subtype" | "wrong_user" | "not_threaded" };

/**
 * Only a plain (no subtype), threaded reply from the configured PM counts.
 * Everything else - edits/deletes (reshaped as subtypes), other users'
 * messages, top-level (non-threaded) messages - is deliberately ignored.
 */
export function filterEvent(event: SlackMessageEvent, pmSlackId: string): FilterResult {
  if (event.type !== "message") {
    return { relayable: false, reason: "not_a_message" };
  }
  if (event.subtype) {
    return { relayable: false, reason: "has_subtype" };
  }
  if (event.user !== pmSlackId) {
    return { relayable: false, reason: "wrong_user" };
  }
  if (!event.thread_ts) {
    return { relayable: false, reason: "not_threaded" };
  }
  return { relayable: true };
}
