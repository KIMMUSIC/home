import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard page structure", () => {
  const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  const stylesSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  it("does not render a separate drag handle for kanban cards", () => {
    expect(pageSource).not.toContain("kanban-card-drag-handle");
    expect(pageSource).not.toContain("GripVertical");
    expect(stylesSource).not.toContain("kanban-card-drag-handle");
  });

  it("keeps theme controls scoped to Settings", () => {
    const themeToggleCalls = pageSource.match(/setTheme\(theme === \"light\" \? \"dark\" : \"light\"\)/g) ?? [];

    expect(themeToggleCalls).toHaveLength(1);
    expect(pageSource).not.toContain("<PageHeader view={view} theme");
    expect(pageSource).toContain("settings-theme-button");
  });

  it("uses a polished custom kanban project picker", () => {
    expect(pageSource).toContain("kanban-toolbar");
    expect(pageSource).not.toContain("kanban-toolbar card");
    expect(pageSource).toContain("project-picker");
    expect(pageSource).toContain("project-select-shell");
    expect(pageSource).toContain("project-select-trigger");
    expect(pageSource).toContain("project-select-menu");
    expect(pageSource).not.toContain("project-picker-summary");
    expect(pageSource).not.toContain("<select value={selectedProjectId}");
    expect(pageSource).toContain("ChevronDown");
    expect(stylesSource).toContain(".project-select-trigger");
    expect(stylesSource).toContain(".project-select-menu");
    expect(stylesSource).toContain("grid-column: 3");
    expect(stylesSource).toContain("white-space: nowrap");
  });

  it("renders dashboard edit mode and widget management controls", () => {
    expect(pageSource).toContain("isDashboardEditing");
    expect(pageSource).toContain("dashboard-edit-actions");
    expect(pageSource).toContain("WidgetManagerDrawer");
    expect(pageSource).toContain("widget-manager-drawer");
    expect(pageSource).toContain("widget-edit-panel");
    expect(pageSource).toContain("dashboard-empty-state");
    expect(pageSource).toContain("memo-widget-input");
    expect(stylesSource).toContain(".widget-size-switch");
    expect(stylesSource).toContain(".widget-manager-item");
    expect(stylesSource).toContain(".widget-wide");
  });

  it("renders account sync controls with local fallback copy", () => {
    expect(pageSource).toContain("SyncCard");
    expect(pageSource).toContain("Account sync");
    expect(pageSource).toContain("settings-account-card");
    expect(pageSource).toContain("dashboard_states JSONB sync");
    expect(stylesSource).toContain(".settings-account-card");
    expect(stylesSource).toContain(".sync-card-action");
  });

  it("does not delete calendar events when the event row itself is clicked", () => {
    expect(pageSource).not.toContain("onClick={() => removeEvent(event.id)} title=\"클릭하면 삭제됩니다\"");
    expect(pageSource).toContain("calendar-event");
    expect(pageSource).toContain("calendar-event-delete");
    expect(pageSource).toContain("일정 삭제");
    expect(stylesSource).toContain(".calendar-event");
    expect(stylesSource).toContain(".calendar-event-delete");
  });

  it("opens a kanban-like calendar event detail drawer from an event row", () => {
    expect(pageSource).toContain("selectedEventId");
    expect(pageSource).toContain("CalendarEventDetailDrawer");
    expect(pageSource).toContain("selectEvent={setSelectedEventId}");
    expect(pageSource).toContain("onClick={() => selectEvent(event.id)}");
    expect(pageSource).toContain("event-detail-drawer");
    expect(pageSource).toContain("event-detail-editor-card");
    expect(pageSource).toContain("일정 상세");
    expect(pageSource).toContain("시작 시간");
    expect(pageSource).toContain("종료 시간");
    expect(stylesSource).toContain(".event-detail-drawer");
    expect(stylesSource).toContain(".event-detail-editor-card");
  });

  it("removes the retired player widget and top bar surfaces", () => {
    const retiredName = String.fromCharCode(77, 117, 115, 105, 99);
    const retiredClass = String.fromCharCode(109, 117, 115, 105, 99);
    const retiredEmbedHost = String.fromCharCode(121, 111, 117, 116, 117, 98, 101);

    expect(pageSource).not.toContain(`Top${retiredName}Player`);
    expect(pageSource).not.toContain(`${retiredName}Widget`);
    expect(pageSource).not.toContain(`${retiredName}SettingsDrawer`);
    expect(pageSource).not.toContain(`${retiredEmbedHost}-${retiredClass}`);
    expect(pageSource).not.toContain(`${retiredEmbedHost[0].toUpperCase()}${retiredEmbedHost.slice(1)} ${retiredName}`);
    expect(pageSource).not.toContain(`${retiredClass}Resource`);
    expect(stylesSource).not.toContain(`.top-${retiredClass}-bar`);
    expect(stylesSource).not.toContain(`.${retiredClass}-player`);
    expect(stylesSource).not.toContain(`.${retiredClass}-widget-card`);
    expect(stylesSource).not.toContain(`.${retiredEmbedHost}-embed-shell`);
    expect(stylesSource).toContain("min-height: 100vh");
  });
});
