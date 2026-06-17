import { describe, expect, it } from "vitest";
import {
  buildJiraSearchUrl,
  DEFAULT_JIRA_JQL,
  jiraAuthHeader,
  normalizeJiraIssues,
} from "./jira";

describe("buildJiraSearchUrl", () => {
  it("targets the enhanced /rest/api/3/search/jql endpoint and trims the base url", () => {
    const url = buildJiraSearchUrl(
      "https://nckorea.atlassian.net/",
      DEFAULT_JIRA_JQL,
      ["summary", "status"],
      20,
    );

    expect(url.startsWith("https://nckorea.atlassian.net/rest/api/3/search/jql?")).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("jql")).toBe(DEFAULT_JIRA_JQL);
    expect(parsed.searchParams.get("fields")).toBe("summary,status");
    expect(parsed.searchParams.get("maxResults")).toBe("20");
  });
});

describe("jiraAuthHeader", () => {
  it("produces a Basic header from base64(email:token)", () => {
    const header = jiraAuthHeader("me@example.com", "secret-token");
    const expected = Buffer.from("me@example.com:secret-token").toString("base64");
    expect(header).toBe(`Basic ${expected}`);
  });
});

describe("normalizeJiraIssues", () => {
  it("maps a full issue to a JiraTicket with a browse url", () => {
    const tickets = normalizeJiraIssues(
      {
        issues: [
          {
            key: "ABC-1",
            fields: {
              summary: "Fix the bug",
              updated: "2026-06-18T10:00:00.000+0000",
              status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
              priority: { name: "High" },
              issuetype: { name: "Bug" },
            },
          },
        ],
      },
      "https://nckorea.atlassian.net/",
    );

    expect(tickets).toEqual([
      {
        key: "ABC-1",
        summary: "Fix the bug",
        status: "In Progress",
        statusCategory: "indeterminate",
        priority: "High",
        issueType: "Bug",
        updatedAt: "2026-06-18T10:00:00.000+0000",
        url: "https://nckorea.atlassian.net/browse/ABC-1",
      },
    ]);
  });

  it("is defensive against missing fields and skips issues without a key", () => {
    const tickets = normalizeJiraIssues(
      {
        issues: [
          { key: "ABC-2", fields: { summary: "No status here" } },
          { fields: { summary: "Missing key" } },
        ],
      },
      "https://nckorea.atlassian.net",
    );

    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toEqual({
      key: "ABC-2",
      summary: "No status here",
      status: "",
      statusCategory: "",
      priority: undefined,
      issueType: undefined,
      updatedAt: "",
      url: "https://nckorea.atlassian.net/browse/ABC-2",
    });
  });

  it("returns an empty array for an empty or missing response", () => {
    expect(normalizeJiraIssues(null, "https://x.atlassian.net")).toEqual([]);
    expect(normalizeJiraIssues({}, "https://x.atlassian.net")).toEqual([]);
  });
});
