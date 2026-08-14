import { slackTextToPlainText } from "./slackText";

describe("slackTextToPlainText", () => {
  it("leaves plain text with nothing special in it unchanged", () => {
    expect(slackTextToPlainText("let's go with option 1")).toBe("let's go with option 1");
  });

  it("unescapes Slack's HTML-entity-escaped ampersand and angle brackets", () => {
    expect(slackTextToPlainText("docs &amp; spec")).toBe("docs & spec");
    expect(slackTextToPlainText("a &lt; b &gt; c")).toBe("a < b > c");
  });

  it("converts a labeled link into readable text with the URL kept", () => {
    expect(
      slackTextToPlainText(
        "see <https://github.com/neethumuthu/BLC-Consortium-MVP/issues/6|issue 6> for context",
      ),
    ).toBe("see issue 6 (https://github.com/neethumuthu/BLC-Consortium-MVP/issues/6) for context");
  });

  it("unwraps a bare (unlabeled) auto-linked URL", () => {
    expect(slackTextToPlainText("see <https://github.com/x/y/issues/6> for context")).toBe(
      "see https://github.com/x/y/issues/6 for context",
    );
  });

  it("converts a user mention into a plain @-mention", () => {
    expect(slackTextToPlainText("thanks <@U12345>, agreed")).toBe("thanks @U12345, agreed");
  });

  it("converts a channel mention into a plain #-mention", () => {
    expect(slackTextToPlainText("see <#C12345|team-blockchain>")).toBe("see #team-blockchain");
  });

  it("converts a special mention like @here into plain text", () => {
    expect(slackTextToPlainText("<!here> please review")).toBe("@here please review");
  });

  it("handles a realistic reply combining several of the above", () => {
    const input =
      "For #21, let's use option 1 &amp; loop in <@U12345> - see <https://github.com/x/y/issues/21|the issue> for the full context";
    expect(slackTextToPlainText(input)).toBe(
      "For #21, let's use option 1 & loop in @U12345 - see the issue (https://github.com/x/y/issues/21) for the full context",
    );
  });
});
