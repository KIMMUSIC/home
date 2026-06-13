import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("kanban card interaction source", () => {
  it("does not render a separate drag handle for kanban cards", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
    const stylesSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(pageSource).not.toContain("kanban-card-drag-handle");
    expect(pageSource).not.toContain("GripVertical");
    expect(stylesSource).not.toContain("kanban-card-drag-handle");
  });
});
