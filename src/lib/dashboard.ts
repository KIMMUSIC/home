export const KANBAN_COLUMN_ORDER = [
  "Backlog",
  "To Do",
  "Doing",
  "Waiting",
  "Review",
  "Done",
  "Later",
] as const;

export type KanbanColumnName = (typeof KANBAN_COLUMN_ORDER)[number];
export type CalendarMode = "week" | "month";

export type Project = {
  id: string;
  name: string;
  status: "active" | "paused" | "done" | "archived";
  progress: number;
  dueDate?: string;
};

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  date: string;
};

export type KanbanCard = {
  id: string;
  projectId: string;
  title: string;
  column: KanbanColumnName;
  order: number;
  priority?: "low" | "medium" | "high";
  description?: string;
  dueDate?: string;
  startDate?: string;
  labels?: string[];
  reporter?: string;
  assignee?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt?: string;
};

export type Bookmark = {
  id: string;
  title: string;
  url: string;
  pinned: boolean;
  category: string;
};

export type DashboardInput = {
  projects: Project[];
  todos: Todo[];
  cards: KanbanCard[];
  events: CalendarEvent[];
};

export type CalendarDay = {
  dateKey: string;
  dayNumber: number;
  weekday: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

export function getDateKey(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mondayStartOffset(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

export function calculateDashboardSummary(input: DashboardInput, todayKey = getDateKey(new Date())) {
  const activeProjects = input.projects.filter((project) => project.status === "active");
  const todayTodos = input.todos.filter((todo) => todo.date === todayKey);
  const todayEvents = input.events.filter((event) => getDateKey(event.startAt) === todayKey);
  const reviewCards = input.cards.filter((card) => card.column === "Review").length;
  const averageProgress = activeProjects.length
    ? Math.round(activeProjects.reduce((sum, project) => sum + project.progress, 0) / activeProjects.length)
    : 0;

  return {
    activeProjects: activeProjects.length,
    todayTodos: todayTodos.length,
    openTodayTodos: todayTodos.filter((todo) => !todo.completed).length,
    todayEvents: todayEvents.length,
    reviewCards,
    averageProgress,
  };
}

export function getKanbanColumns(cards: KanbanCard[], projectId: string) {
  return KANBAN_COLUMN_ORDER.map((name) => ({
    name,
    cards: cards
      .filter((card) => card.projectId === projectId && card.column === name)
      .sort((a, b) => a.order - b.order),
  }));
}

export function moveKanbanCardToColumn(cards: KanbanCard[], cardId: string, column: KanbanColumnName) {
  return moveKanbanCardForDnd(cards, cardId, { column });
}

export type KanbanDndTarget = {
  column: KanbanColumnName;
  overCardId?: string;
};

export type KanbanDragOverlayRect = {
  width?: number | null;
  height?: number | null;
};

export function getKanbanDragOverlayStyle(rect?: KanbanDragOverlayRect | null) {
  return rect?.width && Number.isFinite(rect.width) ? { width: rect.width } : {};
}

const KANBAN_PRIORITY_LABELS: Record<NonNullable<KanbanCard["priority"]>, string> = {
  low: "Low priority",
  medium: "Medium priority",
  high: "High priority",
};

export function getKanbanPriorityLabel(priority: KanbanCard["priority"] = "medium") {
  return KANBAN_PRIORITY_LABELS[priority];
}

export function parseKanbanLabelsInput(input: string) {
  return Array.from(new Set(input.split(",").map((label) => label.trim()).filter(Boolean)));
}

export function moveKanbanCardForDnd(cards: KanbanCard[], cardId: string, target: KanbanDndTarget) {
  const activeCard = cards.find((card) => card.id === cardId);
  if (!activeCard) return cards;

  const updatedAt = getDateKey(new Date());
  const affectedProjectId = activeCard.projectId;
  const sourceColumn = activeCard.column;
  const targetColumn = target.column;
  const updates = new Map<string, KanbanCard>();

  const sortedColumnCards = (column: KanbanColumnName) =>
    cards
      .filter((card) => card.projectId === affectedProjectId && card.column === column && card.id !== cardId)
      .sort((a, b) => a.order - b.order);

  const targetCards = sortedColumnCards(targetColumn);
  const overIndex = target.overCardId ? targetCards.findIndex((card) => card.id === target.overCardId) : -1;
  const insertIndex = overIndex >= 0 ? overIndex : targetCards.length;
  const movedCard: KanbanCard = { ...activeCard, column: targetColumn, updatedAt };
  const reorderedTargetCards = [...targetCards];
  reorderedTargetCards.splice(insertIndex, 0, movedCard);

  reorderedTargetCards.forEach((card, order) => {
    updates.set(card.id, { ...card, column: targetColumn, order, updatedAt: card.id === cardId ? updatedAt : card.updatedAt });
  });

  if (sourceColumn !== targetColumn) {
    sortedColumnCards(sourceColumn).forEach((card, order) => {
      updates.set(card.id, { ...card, order });
    });
  }

  return cards.map((card) => updates.get(card.id) ?? card);
}

export function updateKanbanCardDetails(cards: KanbanCard[], cardId: string, changes: Partial<KanbanCard>) {
  return cards.map((card) =>
    card.id === cardId
      ? {
          ...card,
          ...changes,
          id: card.id,
          projectId: changes.projectId ?? card.projectId,
          updatedAt: getDateKey(new Date()),
        }
      : card,
  );
}

export function getCalendarDays(mode: CalendarMode, anchorDateKey: string): CalendarDay[] {
  const anchor = parseDateKey(anchorDateKey);
  const currentMonth = anchor.getUTCMonth();
  const rangeLength = mode === "week" ? 7 : 42;

  const start = mode === "week"
    ? addDays(anchor, -mondayStartOffset(anchor))
    : addDays(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)), -mondayStartOffset(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1))));

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

export function getPinnedBookmarks(bookmarks: Bookmark[], limit = 6) {
  return [...bookmarks]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title))
    .slice(0, limit);
}
