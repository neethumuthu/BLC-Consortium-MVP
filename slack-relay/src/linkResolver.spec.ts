import { resolveIssueNumber } from "./linkResolver";

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

describe("resolveIssueNumber", () => {
  it("resolves trivially when the thread links exactly one issue", () => {
    expect(resolveIssueNumber(SINGLE_LINK_PARENT, "let's go with option 1")).toEqual({
      status: "resolved",
      issueNumber: "20",
    });
  });

  it("resolves via an explicit #<number> mention when the thread links several issues", () => {
    expect(resolveIssueNumber(MULTI_LINK_PARENT, "for #21, let's defer that decision")).toEqual({
      status: "resolved",
      issueNumber: "21",
    });
  });

  it("resolves via distinctive-word overlap when no explicit mention is given", () => {
    expect(
      resolveIssueNumber(
        MULTI_LINK_PARENT,
        "the governance threshold question - let's keep majority for now",
      ),
    ).toEqual({ status: "resolved", issueNumber: "21" });
  });

  it("refuses to guess when multiple issues are linked and nothing disambiguates", () => {
    expect(resolveIssueNumber(MULTI_LINK_PARENT, "let's go with option 1 for both")).toEqual({
      status: "ambiguous",
      candidates: ["20", "21"],
    });
  });

  it("reports no candidates when the thread has no GitHub issue link at all", () => {
    expect(resolveIssueNumber(NO_LINK_PARENT, "sure, sounds good")).toEqual({ status: "none" });
  });
});
