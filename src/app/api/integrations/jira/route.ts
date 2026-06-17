import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";

const INTEGRATION_JIRA_TABLE = "integration_jira";

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Jira 연동 요청을 처리하지 못했습니다.";
}

const connectSchema = z.object({
  baseUrl: z.string().url().refine((value) => value.startsWith("https://"), {
    message: "base URL은 https로 시작해야 합니다.",
  }),
  email: z.string().min(1),
  apiToken: z.string().min(1),
  jql: z.string().optional(),
});

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
    .select("base_url, email, jql")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  const row = data as { base_url?: string | null; email?: string | null; jql?: string | null } | null;
  return Response.json({
    connected: Boolean(row),
    email: row?.email ?? null,
    baseUrl: row?.base_url ?? null,
    jql: row?.jql ?? null,
  });
}

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문을 읽지 못했습니다." }, { status: 400 });
  }

  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 400 });
  }

  const jql = parsed.data.jql?.trim() ? parsed.data.jql.trim() : null;
  const { error } = await supabase.from(INTEGRATION_JIRA_TABLE).upsert(
    {
      user_id: user.id,
      base_url: parsed.data.baseUrl,
      email: parsed.data.email,
      api_token: parsed.data.apiToken,
      jql,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  return Response.json({
    connected: true,
    email: parsed.data.email,
    baseUrl: parsed.data.baseUrl,
    jql,
  });
}

export async function DELETE() {
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

  const { error } = await supabase.from(INTEGRATION_JIRA_TABLE).delete().eq("user_id", user.id);
  if (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  return Response.json({ connected: false });
}
