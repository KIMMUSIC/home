---
title: Next Dashboard Kanban and Calendar UI Refinement with Stale CSS Cache Recovery
date: 2026-06-14
category: ui-bugs
module: diy-home-dashboard
problem_type: ui_bug
component: development_workflow
symptoms:
  - "Kanban cards exposed bottom status and delete controls instead of drag-to-change status and hover delete."
  - "Kanban cards lacked a Jira-like detail drawer for editing dates and metadata."
  - "Calendar lacked weekly and monthly planning modes."
  - "Next.js dev server served stale CSS chunks after source styles and build output were already correct."
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags:
  - nextjs
  - kanban
  - calendar
  - css-cache
  - ui-polish
---

# Next Dashboard Kanban and Calendar UI Refinement with Stale CSS Cache Recovery

## Problem

The DIY Home Dashboard needed a more polished, Jira-like Kanban and calendar experience. Kanban cards used always-visible bottom controls for status changes and deletion, while the Calendar had only a simple view; after implementing the UI changes, the browser still showed stale styles because the Next.js dev server was serving an old CSS chunk.

## Symptoms

- Kanban cards exposed a status select and trash button under each card, making the board feel more like a form than a drag-based workspace.
- Clicking a Kanban card did not open a detailed issue panel for editing description, dates, assignee, reporter, priority, or labels.
- Calendar did not support separate weekly and monthly planning modes.
- Source CSS and production build contained the new `.calendar-board`, `.card-detail-drawer`, and `.kanban-card-delete` styles, but browser computed styles still showed stale defaults.

## What Didn't Work

- Re-checking source files alone was not enough. `src/app/globals.css` already contained the new calendar, drawer, and Kanban styles.
- Rebuilding alone did not explain the browser behavior. `npm run build` succeeded, which showed the source was valid but did not clear the dev server's stale runtime CSS chunk.
- Browser inspection showed the loaded stylesheet did not include the new rules, so the problem was not the CSS selectors themselves.

## Solution

### Move Kanban state changes into drag/drop behavior

Kanban state changes were centralized in a helper instead of being controlled by a per-card select element:

```ts
export function moveKanbanCardToColumn(cards: KanbanCard[], cardId: string, column: KanbanColumnName) {
  const targetCard = cards.find((card) => card.id === cardId);
  if (!targetCard) return cards;

  const nextOrder =
    Math.max(
      -1,
      ...cards
        .filter((card) => card.projectId === targetCard.projectId && card.column === column && card.id !== cardId)
        .map((card) => card.order),
    ) + 1;

  return cards.map((card) =>
    card.id === cardId
      ? {
          ...card,
          column,
          order: nextOrder,
          updatedAt: getDateKey(new Date()),
        }
      : card,
  );
}
```

`KanbanView` now uses `dnd-kit` so each column is a droppable target and each card is sortable. This gives smoother pointer/keyboard interactions, a drag overlay, empty-column placeholders, and same-column reordering:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCorners}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
  <div className="kanban-board">
    {columns.map((column) => (
      <KanbanColumn key={column.name} column={column} />
    ))}
  </div>
  <DragOverlay>{activeCard ? <KanbanCardBody card={activeCard} /> : null}</DragOverlay>
</DndContext>
```

### Make deletion hover-only

The card's delete action moved from a bottom control to a top-right `X` that appears only on hover:

```tsx
<button
  className="kanban-card-delete"
  aria-label="카드 삭제"
  onClick={(event) => {
    event.stopPropagation();
    removeCard(card.id);
  }}
>
  <X size={14} />
</button>
```

```css
.kanban-card {
  position: relative;
}

.kanban-card-delete {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  opacity: 0;
  pointer-events: none;
}

.kanban-card:hover .kanban-card-delete {
  opacity: 1;
  pointer-events: auto;
}
```

### Add a Jira-like detail drawer

Card detail editing was moved into a drawer opened by clicking a Kanban card. The drawer supports editable issue-like fields while keeping status read-only so status remains a board interaction:

```tsx
<KanbanDetailDrawer
  card={selectedCard}
  project={selectedProject}
  onClose={() => setSelectedCardId(null)}
  onUpdate={updateCard}
/>
```

The update path is centralized through `updateKanbanCardDetails`:

```ts
type KanbanCardDetailChanges = Partial<
  Pick<KanbanCard, "title" | "description" | "assignee" | "reporter" | "priority" | "labels" | "startDate" | "dueDate">
>;

export function updateKanbanCardDetails(
  cards: KanbanCard[],
  cardId: string,
  changes: KanbanCardDetailChanges,
) {
  return cards.map((card) =>
    card.id === cardId
      ? {
          ...card,
          ...changes,
          updatedAt: getDateKey(new Date()),
        }
      : card,
  );
}
```

### Add weekly and monthly Calendar modes

Calendar rendering was made deterministic with one helper that returns either a Monday-first week or a stable 42-cell month grid:

```ts
export function getCalendarDays(mode: CalendarMode, anchorDateKey: string): CalendarDay[] {
  const anchor = parseDateKey(anchorDateKey);
  const currentMonth = anchor.getUTCMonth();
  const rangeLength = mode === "week" ? 7 : 42;
  const monthStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));

  const start = mode === "week"
    ? addDays(anchor, -mondayStartOffset(anchor))
    : addDays(monthStart, -mondayStartOffset(monthStart));

  return Array.from({ length: rangeLength }, (_, index) => {
    const date = addDays(start, index);
    const dateKey = formatDateKey(date);
    return {
      dateKey,
      dayNumber: date.getUTCDate(),
      weekday: date.getUTCDay(),
      inCurrentMonth: mode === "week" ? true : date.getUTCMonth() === currentMonth,
      isToday: dateKey === anchorDateKey,
    };
  });
}
```

The UI uses a segmented control to switch modes:

```tsx
<div className="segmented">
  <button className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}>주간</button>
  <button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>월간</button>
</div>
```

### Clear stale Next.js dev CSS cache

When the browser still did not load the new CSS rules, the fix was to stop the old dev server, delete the generated `.next` cache, and restart development mode:

```bash
# Stop the running dev server first, for example with Ctrl+C.
# If it is stuck, kill the specific Node/Next process.
taskkill //PID <next-dev-server-pid> //F
rm -rf .next
npm run dev
```

After restart, browser inspection showed `.calendar-board` rules were loaded and applied.

## Why This Works

The Kanban UI now matches the user's mental model: cards move between columns to change status, destructive actions stay visually quiet until hover, and detailed editing happens in a focused drawer. Centralizing card movement and detail updates in helper functions keeps the UI behavior testable instead of spreading mutation rules across components.

The Calendar now has deterministic view generation: week mode always renders seven Monday-first days, and month mode always renders a complete six-week grid. This makes planning UI predictable and easy to test.

The stale CSS issue was caused by the dev server serving generated assets from `.next` that no longer matched source files. Removing `.next` forced Next.js/Turbopack to regenerate the CSS chunk, which made the browser load the current `.calendar-board`, `.card-detail-drawer`, and `.kanban-card-delete` rules.

## Prevention

- Keep status changes as board interactions for Kanban-style UI; avoid always-visible per-card status controls when drag/drop is the intended model.
- Put destructive card actions behind hover or an explicit detail view to reduce visual noise.
- Keep issue-like metadata in a focused detail drawer instead of expanding cards until the board becomes cluttered.
- Test date and board helpers directly:

```bash
NODE_ENV=development npm test
```

- If source CSS and build output are correct but browser styles are stale, inspect the loaded CSS chunk before rewriting selectors. If the expected rules are absent, stop the dev server, remove `.next`, and restart. Treat cache deletion as a recovery step, not the first debugging step.
- Verify UI changes at three levels: tests, lint/build, and browser computed behavior.

## Related Issues

- No existing `docs/solutions/` entry covered this problem. Related-doc overlap was low because the project did not yet have a solutions knowledge store.
- GitHub issue search was skipped because the repository has no configured remote and GitHub CLI was not authenticated.
