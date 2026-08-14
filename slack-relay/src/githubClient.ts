export class GithubClient {
  constructor(
    private readonly token: string,
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  /**
   * Posts the exact same `@claude <answer>` comment the PM would otherwise
   * have typed directly on GitHub - proposal-answer-sync.yml's own trigger
   * and scope are completely unchanged by this relay existing.
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
