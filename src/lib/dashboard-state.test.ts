import { describe, expect, it } from "vitest";

import { DEFAULT_WIDGET_CONFIGS } from "./dashboard";
import { initialState, normalizeDashboardState, parseDashboardState, serializeDashboardState } from "./dashboard-state";

describe("dashboard state persistence", () => {
  it("normalizes partial dashboard snapshots with stable defaults", () => {
    const normalized = normalizeDashboardState({
      memo: "클라우드 메모",
      widgets: [{ id: "memo", type: "memo", title: "Memo", enabled: false, size: "wide", order: 0 }],
      cards: [{ id: "c-local", projectId: "p1", title: "sync", column: "Backlog", order: 0 }],
      music: { title: "  ", subtitle: "집중 플레이리스트", sourceUrl: " https://music.youtube.com/playlist?list=PLdemo " },
    });

    expect(normalized.memo).toBe("클라우드 메모");
    expect(normalized.projects).toEqual(initialState.projects);
    expect(normalized.widgets).toHaveLength(DEFAULT_WIDGET_CONFIGS.length);
    expect(normalized.widgets.find((widget) => widget.type === "memo")).toMatchObject({ enabled: false, size: "wide" });
    expect(normalized.cards[0]).toMatchObject({ description: "", labels: [] });
    expect(normalized.music).toMatchObject({ title: initialState.music.title, subtitle: "집중 플레이리스트", sourceUrl: "https://music.youtube.com/playlist?list=PLdemo" });
  });

  it("round-trips serialized state and falls back on invalid JSON", () => {
    const serialized = serializeDashboardState({ ...initialState, memo: "저장된 메모" });

    expect(parseDashboardState(serialized).memo).toBe("저장된 메모");
    expect(parseDashboardState("not-json")).toEqual(initialState);
  });
});
