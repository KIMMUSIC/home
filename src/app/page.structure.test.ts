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
});
