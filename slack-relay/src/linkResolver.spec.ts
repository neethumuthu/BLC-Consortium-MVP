import { resolveIssueNumber } from "./linkResolver";

const OWNER = "neethumuthu";
const REPO = "BLC-Consortium-MVP";

const SINGLE_LINK_PARENT = [
  "The following change is blocked on an open product question:",
  "",
  "- Open question: cert-licensing-vetting - https://github.com/neethumuthu/BLC-Consortium-MVP/issues/20",
  "",
  "Reply on the linked issue.",
].join("\n");

const MULTI_LINK_PARENT = [
  "The following changes are blocked on open product questions:",
  "",
  "- Open question: cert-licensing-vetting - https://github.com/neethumuthu/BLC-Consortium-MVP/issues/20",
  "- Open question: governance-threshold - https://github.com/neethumuthu/BLC-Consortium-MVP/issues/21",
  "",
  "Reply on the linked issue.",
].join("\n");

const NO_LINK_PARENT = "Just a regular message with no GitHub link in it at all.";

const CROSS_REPO_LINK_PARENT = [
  "- Open question: cert-licensing-vetting - https://github.com/neethumuthu/BLC-Consortium-MVP/issues/20",
  "See also https://github.com/someone-else/unrelated-repo/issues/999 for background.",
].join("\n");

function resolve(parentText: string, replyText: string) {
  return resolveIssueNumber(parentText, replyText, OWNER, REPO);
}

describe("resolveIssueNumber", () => {
  it("resolves trivially when the thread links exactly one issue", () => {
    expect(resolve(SINGLE_LINK_PARENT, "let's go with option 1")).toEqual({
      status: "resolved",
      issueNumber: "20",
    });
  });

  it("resolves via an explicit #<number> mention when the thread links several issues", () => {
    expect(resolve(MULTI_LINK_PARENT, "for #21, let's defer that decision")).toEqual({
      status: "resolved",
      issueNumber: "21",
    });
  });

  it("resolves via distinctive-word overlap when no explicit mention is given", () => {
    expect(
      resolve(MULTI_LINK_PARENT, "the governance threshold question - let's keep majority for now"),
    ).toEqual({ status: "resolved", issueNumber: "21" });
  });

  it("refuses to guess when multiple issues are linked and nothing disambiguates", () => {
    expect(resolve(MULTI_LINK_PARENT, "let's go with option 1 for both")).toEqual({
      status: "ambiguous",
      candidates: ["20", "21"],
    });
  });

  it("reports no candidates when the thread has no GitHub issue link at all", () => {
    expect(resolve(NO_LINK_PARENT, "sure, sounds good")).toEqual({ status: "none" });
  });

  it("ignores a link to a different repo entirely, resolving only against the configured one", () => {
    expect(resolve(CROSS_REPO_LINK_PARENT, "let's go with option 1")).toEqual({
      status: "resolved",
      issueNumber: "20",
    });
  });

  it("does not treat a same-owner, different-repo link as a candidate either", () => {
    const parent =
      "https://github.com/neethumuthu/some-other-repo/issues/5 and https://github.com/neethumuthu/BLC-Consortium-MVP/issues/20";
    expect(resolve(parent, "sure")).toEqual({ status: "resolved", issueNumber: "20" });
  });
});
