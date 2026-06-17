import {
  buildJiraSearchUrl,
  DEFAULT_JIRA_JQL,
  jiraAuthHeader,
  normalizeJiraIssues,
} from "@/lib/jira";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const INTEGRATION_JIRA_TABLE = "integration_jira";
const JIRA_FIELDS = ["summary", "status", "priority", "issuetype", "updated"];
const JIRA_MAX_RESULTS = 20;

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from(INTEGRATION_JIRA_TABLE)
    .select("base_url, email, api_token, jql")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return Response.json({ connected: false, tickets: [], error: error.message });
  }

  const row = data as
    | { base_url?: string | null; email?: string | null; api_token?: string | null; jql?: string | null }
    | null;

  if (!row || !row.base_url || !row.email || !row.api_token) {
    return Response.json({ connected: false, tickets: [] });
  }

  const jql = row.jql?.trim() ? row.jql.trim() : DEFAULT_JIRA_JQL;
  const searchUrl = buildJiraSearchUrl(row.base_url, jql, JIRA_FIELDS, JIRA_MAX_RESULTS);

  let response: Response;
  try {
    response = await fetch(searchUrl, {
      headers: {
        Authorization: jiraAuthHeader(row.email, row.api_token),
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return Response.json({ connected: true, tickets: [], error: "Jira 서버에 연결하지 못했습니다." });
  }

  if (!response.ok) {
    return Response.json({
      connected: true,
      tickets: [],
      error: `Jira 요청 실패 (HTTP ${response.status})`,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return Response.json({ connected: true, tickets: [], error: "Jira 응답을 해석하지 못했습니다." });
  }

  const tickets = normalizeJiraIssues(payload as Parameters<typeof normalizeJiraIssues>[0], row.base_url);
  return Response.json({
    connected: true,
    tickets,
    email: row.email,
    baseUrl: row.base_url,
  });
}
