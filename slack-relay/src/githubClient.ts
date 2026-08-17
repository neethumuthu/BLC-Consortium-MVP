export class GithubClient {
  constructor(
    private readonly token: string,
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  /**
   * Posts an `@claude ...` comment carrying the PM's answer - not the
   * exact bytes they typed in Slack (relayHandler.ts prefixes it with an
   * attribution line, since this posts via a personal PAT with no
   * "on behalf of" concept). proposal-answer-sync.yml's own trigger and
   * scope are completely unchanged by this relay existing - it reads the
   * answer via an LLM prompt, not a strict parser, so the added prefix
   * doesn't affect it.
   */
  async postIssueComment(issueNumber: string, body: string): Promise<void> {
    const response = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub comment failed (${response.status}): ${text}`);
    }
  }
}
