const EXPLICIT_ISSUE_MENTION_RE = /#(\d+)\b/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scoped to exactly this configured repo, not any GitHub issue link - a
 * stray cross-repo reference in the thread (someone pasting an unrelated
 * link) must never become a disambiguation candidate that ends up
 * resolving to the wrong issue number in *this* repo.
 */
function issueLinkPattern(owner: string, repo: string): RegExp {
  return new RegExp(
    `github\\.com/${escapeRegExp(owner)}/${escapeRegExp(repo)}/issues/(\\d+)`,
    "gi",
  );
}

// Words too common to count as a distinctive disambiguation signal.
const STOPWORDS = new Set([
  "open",
  "question",
  "the",
  "this",
  "that",
  "with",
  "from",
  "your",
  "please",
  "answer",
  "issue",
  "change",
]);

interface Candidate {
  issueNumber: string;
  contextLine: string;
}

export type ResolveResult =
  | { status: "resolved"; issueNumber: string }
  | { status: "none" }
  | { status: "ambiguous"; candidates: string[] };

function extractCandidates(parentText: string, owner: string, repo: string): Candidate[] {
  const issueLinkRe = issueLinkPattern(owner, repo);
  const seen = new Map<string, string>();
  for (const line of parentText.split("\n")) {
    const matches = line.matchAll(issueLinkRe);
    for (const match of matches) {
      const issueNumber = match[1];
      if (!seen.has(issueNumber)) {
        seen.set(issueNumber, line);
      }
    }
  }
  return Array.from(seen.entries()).map(([issueNumber, contextLine]) => ({
    issueNumber,
    contextLine,
  }));
}

function distinctiveWords(line: string): string[] {
  // Splits on hyphens too (unlike the issue-link regex above) so a
  // compound token like "governance-threshold" contributes its parts as
  // independent disambiguation signals, not one opaque string.
  return line
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

/**
 * requirements-nudge.yml batches every currently-blocked change into one
 * Slack message, so the parent can link more than one issue. Exactly one
 * link resolves trivially; more than one tries an explicit "#<n>" mention
 * in the reply, then a distinctive-word overlap with each candidate's own
 * line, and refuses to guess if that still leaves more than one candidate.
 */
export function resolveIssueNumber(
  parentText: string,
  replyText: string,
  owner: string,
  repo: string,
): ResolveResult {
  const candidates = extractCandidates(parentText, owner, repo);

  if (candidates.length === 0) {
    return { status: "none" };
  }
  if (candidates.length === 1) {
    return { status: "resolved", issueNumber: candidates[0].issueNumber };
  }

  const candidateNumbers = new Set(candidates.map((c) => c.issueNumber));
  const explicitMentions = new Set(
    Array.from(replyText.matchAll(EXPLICIT_ISSUE_MENTION_RE))
      .map((match) => match[1])
      .filter((n) => candidateNumbers.has(n)),
  );
  if (explicitMentions.size === 1) {
    return { status: "resolved", issueNumber: Array.from(explicitMentions)[0] };
  }
  if (explicitMentions.size > 1) {
    return { status: "ambiguous", candidates: Array.from(explicitMentions) };
  }

  const replyWords = new Set(distinctiveWords(replyText));
  const wordMatches = candidates.filter((c) =>
    distinctiveWords(c.contextLine).some((word) => replyWords.has(word)),
  );
  if (wordMatches.length === 1) {
    return { status: "resolved", issueNumber: wordMatches[0].issueNumber };
  }

  return {
    status: "ambiguous",
    candidates: candidates.map((c) => c.issueNumber),
  };
}
