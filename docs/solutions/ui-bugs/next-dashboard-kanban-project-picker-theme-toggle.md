---
title: Next Dashboard Kanban Project Picker and Toolbar Polish
date: 2026-06-14
category: ui-bugs
module: diy-home-dashboard
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - "Kanban project selection used a native browser select whose OS-styled dropdown clashed with the beige Notion/Linear dashboard visual language."
  - "Kanban new-card input and Backlog button did not align with the page quick-add controls."
  - "Theme toggling appeared in the page header instead of being scoped to Settings."
root_cause: wrong_api
resolution_type: code_fix
severity: low
tags:
  - nextjs
  - react
  - kanban
  - project-picker
  - toolbar
  - theme-toggle
  - ui-polish
  - regression-test
---

# Next Dashboard Kanban Project Picker and Toolbar Polish

## Problem

The Kanban page controls did not match the dashboard's polished Notion/Linear-inspired visual language. The native project `<select>` exposed OS/browser styling, the Kanban card add controls did not line up with the page quick-add area, and the theme toggle lived in the page header even though it was a settings action.

## Symptoms

- The project picker opened as a native browser dropdown with blue OS selection styling, making the control feel disconnected from the beige dashboard UI.
- The Kanban add-card row reused generic form-row behavior, so the input and `Backlog에 추가` action did not share the same right edge as the top quick-add controls.
- The page header carried both quick-add and theme-toggle actions, increasing header clutter across every view.
- Existing structure tests protected the Kanban drag-handle decision but did not prevent reintroducing native project selection, header-scoped theme toggles, or toolbar wrapping/alignment regressions.

## What Didn't Work

- Styling a native `<select>` was not enough. Even if the closed control can be partially styled, the opened menu is still controlled by the browser/OS and can clash with a custom dashboard theme.
- Reusing `.form-row` kept the markup simple but could not express the Kanban toolbar's actual layout: project context on the left, creation controls aligned to the right.
- Keeping `theme` and `setTheme` in `PageHeader` made the toggle globally available, but it mixed settings with everyday page actions.
- Manual visual review alone would not prevent future refactors from bringing back the same structural problems.

## Solution

### Replace the native project select with a custom dropdown

The Kanban view now owns open/closed menu state and renders a styled trigger plus listbox-style menu instead of a native select.

```tsx
const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
const projectMenuRef = useRef<HTMLDivElement | null>(null);
const selectedProject = projects.find((project) => project.id === selectedProjectId);
const selectedProjectName = selectedProject?.name ?? "프로젝트 선택";
```

The dropdown closes on outside pointer-down and Escape:

```tsx
useEffect(() => {
  function handlePointerDown(event: PointerEvent) {
    if (!projectMenuRef.current?.contains(event.target as Node)) {
      setIsProjectMenuOpen(false);
    }
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key === "Escape") setIsProjectMenuOpen(false);
  }

  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("keydown", handleEscape);
  return () => {
    document.removeEventListener("pointerdown", handlePointerDown);
    document.removeEventListener("keydown", handleEscape);
  };
}, []);
```

The rendered control keeps the existing selected-project state flow while giving the UI full control over the trigger and menu styling:

```tsx
<div ref={projectMenuRef} className={isProjectMenuOpen ? "project-select-shell is-open" : "project-select-shell"}>
  <button
    type="button"
    className="project-select-trigger"
    aria-haspopup="listbox"
    aria-expanded={isProjectMenuOpen}
    aria-label="칸반 프로젝트 선택"
    onClick={() => setIsProjectMenuOpen((open) => !open)}
  >
    <strong>{selectedProjectName}</strong>
    <ChevronDown size={16} aria-hidden="true" />
  </button>

  {isProjectMenuOpen ? (
    <div className="project-select-menu" role="listbox" aria-label="칸반 프로젝트 목록">
      {projects.map((project) => (
        <button
          key={project.id}
          type="button"
          role="option"
          aria-selected={project.id === selectedProjectId}
          className={project.id === selectedProjectId ? "selected" : ""}
          onClick={() => handleProjectSelect(project.id)}
        >
          <span>{project.name}</span>
          <em>{project.progress}%</em>
        </button>
      ))}
    </div>
  ) : null}
</div>
```

### Give the Kanban controls a dedicated toolbar layout

The generic form row was replaced by a toolbar with a left project picker, flexible middle space, and right-aligned card creation controls.

```tsx
<div className="kanban-toolbar">
  <div className="project-picker">{/* custom project picker */}</div>

  <div className="kanban-add-card">
    <input value={newCard} onChange={(event) => setNewCard(event.target.value)} placeholder="새 칸반 카드" />
    <button className="primary-button" onClick={() => addCard("Backlog")}>Backlog에 추가</button>
  </div>
</div>
```

The desktop grid locks the add controls to the same 520px right-side track used by the header quick-add area:

```css
.kanban-toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 360px) minmax(0, 1fr) minmax(420px, 520px);
  gap: 18px;
  align-items: end;
  padding: 2px 0 6px;
}

.kanban-add-card {
  grid-column: 3;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 9px;
  flex-wrap: nowrap;
  justify-self: stretch;
}

.kanban-add-card .primary-button {
  flex: 0 0 auto;
  min-width: 118px;
  white-space: nowrap;
  justify-content: center;
}
```

On narrower screens the toolbar collapses back to one column so the controls remain usable:

```css
@media (max-width: 1180px) {
  .kanban-toolbar { grid-template-columns: 1fr; }
  .kanban-add-card { grid-column: auto; justify-content: flex-start; justify-self: stretch; }
  .kanban-add-card input { flex: 1 1 auto; }
}
```

### Scope theme switching to Settings

The header no longer receives `theme` or `setTheme`; it only renders page title/context and quick add.

```tsx
<PageHeader view={view} quickText={quickText} setQuickText={setQuickText} addTodo={addTodo} />
```

Settings now owns the theme action with a dedicated settings-style button:

```tsx
<button
  className="settings-theme-button"
  onClick={() => setTheme(theme === "light" ? "dark" : "light")}
>
  <span>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</span>
  <strong>{theme === "light" ? "다크모드로 전환" : "라이트모드로 전환"}</strong>
  <em>테마 변경은 Settings에서만 관리합니다.</em>
</button>
```

### Add structure regression coverage

The page structure test now guards the product decisions directly:

```ts
it("keeps theme controls scoped to Settings", () => {
  const themeToggleCalls = pageSource.match(/setTheme\(theme === \"light\" \? \"dark\" : \"light\"\)/g) ?? [];

  expect(themeToggleCalls).toHaveLength(1);
  expect(pageSource).not.toContain("<PageHeader view={view} theme");
  expect(pageSource).toContain("settings-theme-button");
});
```

```ts
it("uses a polished custom kanban project picker", () => {
  expect(pageSource).toContain("kanban-toolbar");
  expect(pageSource).not.toContain("kanban-toolbar card");
  expect(pageSource).toContain("project-select-trigger");
  expect(pageSource).toContain("project-select-menu");
  expect(pageSource).not.toContain("<select value={selectedProjectId}");
  expect(stylesSource).toContain("grid-column: 3");
  expect(stylesSource).toContain("white-space: nowrap");
});
```

The fix was verified with `npm test`, `npm run lint`, `npm run build`, browser visual inspection, and a console check with no errors.

## Why This Works

A custom dropdown removes the styling boundary imposed by native browser select popups while preserving the app's existing project selection state. The trigger, menu, hover state, selected state, border, radius, shadow, and colors all come from the same dashboard design language as the surrounding cards and buttons.

A dedicated toolbar grid expresses the actual hierarchy: project context belongs on the left, creation belongs on the right, and the middle can flex. This prevents the `Backlog에 추가` button from wrapping and makes the Kanban card creation affordance line up with the top quick-add affordance.

Moving theme switching into Settings keeps the page header focused on everyday page actions. Settings mutations remain available, but they no longer compete visually with quick task creation.

The source-level tests turn these UI decisions into guardrails. They catch structural regressions even when visual polish changes are otherwise easy to miss in code review.

## Prevention

- Avoid native form controls for design-critical dropdowns when the opened popup must match a custom visual system.
- Use dedicated toolbar classes when a page needs specific alignment; do not force distinct layouts through a generic `.form-row`.
- Keep global headers focused on navigation, context, and frequent actions; move settings mutations into Settings unless the product explicitly wants global access.
- Add regression tests for source structure after UI polish work, especially for absence of native controls, no-wrap actions, and settings/control scope.
- Verify UI polish at three levels: tests, production build, and browser-computed/visual behavior.
- If a future custom dropdown becomes more keyboard-heavy, add roving focus and ArrowUp/ArrowDown option navigation instead of relying only on trigger-level keyboard handling.

## Related Issues

- Related prior learning: [Next Dashboard Kanban and Calendar UI Refinement with Stale CSS Cache Recovery](./next-dashboard-kanban-calendar-css-cache.md). That doc covers earlier Kanban UI refinement, calendar modes, drag/drop, and stale Next.js CSS recovery.
- No related GitHub issues were found. `gh` was installed but unauthenticated, and unauthenticated GitHub API searches for Kanban picker, dropdown, toolbar, theme toggle, and quick-add terms returned no results.
- Relevant implementation commit: `bffea0d fix(ui): polish dashboard controls`.
