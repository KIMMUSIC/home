export type JiraTicket = {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority?: string;
  issueType?: string;
  updatedAt: string;
  url: string;
};

export const DEFAULT_JIRA_JQL =
  "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function buildJiraSearchUrl(
  baseUrl: string,
  jql: string,
  fields: string[],
  maxResults: number,
) {
  const base = trimTrailingSlash(baseUrl);
  const params = new URLSearchParams();
  params.set("jql", jql);
  params.set("fields", fields.join(","));
  params.set("maxResults", String(maxResults));
  // Jira Cloud (2025) removed the legacy /rest/api/3/search endpoint in favour
  // of the enhanced /rest/api/3/search/jql endpoint.
  return `${base}/rest/api/3/search/jql?${params.toString()}`;
}

export function jiraAuthHeader(email: string, apiToken: string) {
  const token = Buffer.from(`${email}:${apiToken}`).toString("base64");
  return `Basic ${token}`;
}

type RawJiraIssue = {
  key?: unknown;
  fields?: {
    summary?: unknown;
    updated?: unknown;
    status?: { name?: unknown; statusCategory?: { key?: unknown } } | null;
    priority?: { name?: unknown } | null;
    issuetype?: { name?: unknown } | null;
  } | null;
};

type RawJiraSearchResponse = {
  issues?: RawJiraIssue[] | null;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function normalizeJiraIssues(
  rawSearchResponse: RawJiraSearchResponse | null | undefined,
  baseUrl: string,
): JiraTicket[] {
  const base = trimTrailingSlash(baseUrl);
  const issues = rawSearchResponse?.issues ?? [];

  return issues
    .map((issue): JiraTicket | null => {
      const key = asString(issue?.key);
      if (!key) return null;

      const fields = issue?.fields ?? {};
      return {
        key,
        summary: asString(fields.summary) ?? "",
        status: asString(fields.status?.name) ?? "",
        statusCategory: asString(fields.status?.statusCategory?.key) ?? "",
        priority: asString(fields.priority?.name),
        issueType: asString(fields.issuetype?.name),
        updatedAt: asString(fields.updated) ?? "",
        url: `${base}/browse/${key}`,
      };
    })
    .filter((ticket): ticket is JiraTicket => ticket !== null);
}
