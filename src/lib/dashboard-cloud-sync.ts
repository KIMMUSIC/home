import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeDashboardState, type DashboardState } from "./dashboard-state";

export const DASHBOARD_STATE_TABLE = "dashboard_states";

export type CloudDashboardState = {
  state: DashboardState | null;
  updatedAt: string | null;
};

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Supabase 요청을 처리하지 못했습니다.";
}

export async function loadDashboardStateFromCloud(client: SupabaseClient, userId: string): Promise<CloudDashboardState> {
  const { data, error } = await client
    .from(DASHBOARD_STATE_TABLE)
    .select("state, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(getErrorMessage(error));

  const row = data as { state?: Partial<DashboardState> | null; updated_at?: string | null } | null;
  return {
    state: row?.state ? normalizeDashboardState(row.state) : null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveDashboardStateToCloud(client: SupabaseClient, userId: string, state: DashboardState) {
  const normalizedState = normalizeDashboardState(state);
  const { error } = await client.from(DASHBOARD_STATE_TABLE).upsert(
    {
      user_id: userId,
      state: normalizedState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw new Error(getErrorMessage(error));
  return normalizedState;
}
