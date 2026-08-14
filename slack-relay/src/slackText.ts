/**
 * Slack's Events API sends message text HTML-entity-escaped
 * (& < >) and with links/mentions wrapped in its own markup
 * (<url|label>, <@U123>, <#C123|general>, <!here>). A human typing an
 * answer directly on GitHub types plain text, not this representation -
 * relaying it verbatim would corrupt any reply containing those
 * characters, silently contradicting the whole point of "the relay only
 * ever posts the same comment a human would already type."
 * https://api.slack.com/reference/surfaces/formatting
 */
export function slackTextToPlainText(text: string): string {
  return text
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .replace(/<@([A-Z0-9]+)>/g, "@$1")
    .replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2")
    .replace(/<!([a-z]+)>/g, "@$1")
    .replace(/&(amp|lt|gt);/g, (_match, entity: string) => {
      switch (entity) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        default:
          return _match;
      }
    });
}
