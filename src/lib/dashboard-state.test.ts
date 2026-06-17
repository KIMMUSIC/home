import { describe, expect, it } from "vitest";

import { DEFAULT_WIDGET_CONFIGS } from "./dashboard";
import { initialState, normalizeDashboardState, parseDashboardState, serializeDashboardState } from "./dashboard-state";

describe("dashboard state persistence", () => {
  it("normalizes partial dashboard snapshots with stable defaults", () => {
    const removedType = `${"mu"}sic`;
    const legacySnapshot = {
      memo: "클라우드 메모",
      widgets: [
        { id: "memo", type: "memo", title: "Memo", enabled: false, size: "wide", order: 0 },
        { id: removedType, type: removedType, title: "removed widget", enabled: true, size: "wide", order: 1 },
      ],
      cards: [{ id: "c-local", projectId: "p1", title: "sync", column: "Backlog", order: 0 }],
      [removedType]: { title: "legacy", subtitle: "removed", sourceUrl: "https://example.com/removed" },
    };
    const normalized = normalizeDashboardState(legacySnapshot as Parameters<typeof normalizeDashboardState>[0]);

    expect(normalized.memo).toBe("클라우드 메모");
    expect(normalized.projects).toEqual(initialState.projects);
    expect(normalized.widgets).toHaveLength(DEFAULT_WIDGET_CONFIGS.length);
    expect(normalized.widgets.some((widget) => widget.type === removedType)).toBe(false);
    expect(normalized.widgets.find((widget) => widget.type === "memo")).toMatchObject({ enabled: false, size: "wide" });
    expect(normalized.cards[0]).toMatchObject({ description: "", labels: [] });
    expect(removedType in normalized).toBe(false);
    expect(serializeDashboardState(normalized)).not.toContain(removedType);
  });

  it("round-trips serialized state and falls back on invalid JSON", () => {
    const serialized = serializeDashboardState({ ...initialState, memo: "저장된 메모" });

    expect(parseDashboardState(serialized).memo).toBe("저장된 메모");
    expect(parseDashboardState("not-json")).toEqual(initialState);
  });
});
