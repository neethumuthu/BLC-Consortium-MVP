import { filterEvent } from "./eventFilter";
import { SlackMessageEvent } from "./types";

const PM_ID = "U_PM_12345";

function baseEvent(overrides: Partial<SlackMessageEvent> = {}): SlackMessageEvent {
  return {
    type: "message",
    channel: "C_TEAM_CHANNEL",
    user: PM_ID,
    text: "Let's go with option 1",
    ts: "1700000010.000100",
    thread_ts: "1700000000.000000",
    ...overrides,
  };
}

describe("filterEvent", () => {
  it("relays a plain threaded reply from the configured PM", () => {
    expect(filterEvent(baseEvent(), PM_ID)).toEqual({ relayable: true });
  });

  it("ignores messages from anyone other than the configured PM", () => {
    expect(filterEvent(baseEvent({ user: "U_SOMEONE_ELSE" }), PM_ID)).toEqual({
      relayable: false,
      reason: "wrong_user",
    });
  });

  it("ignores edited/deleted messages (they arrive with a subtype)", () => {
    expect(filterEvent(baseEvent({ subtype: "message_changed" }), PM_ID)).toEqual({
      relayable: false,
      reason: "has_subtype",
    });
  });

  it("ignores top-level (non-threaded) messages", () => {
    expect(filterEvent(baseEvent({ thread_ts: undefined }), PM_ID)).toEqual({
      relayable: false,
      reason: "not_threaded",
    });
  });
});
