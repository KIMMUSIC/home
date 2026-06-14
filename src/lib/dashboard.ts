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
export type DashboardWidgetType = "focus" | "clock" | "today" | "projects" | "calendar" | "kanban" | "bookmarks" | "memo" | "music";
export type DashboardWidgetSize = "small" | "medium" | "wide";

export type WidgetConfig = {
  id: DashboardWidgetType;
  type: DashboardWidgetType;
  title: string;
  enabled: boolean;
  size: DashboardWidgetSize;
  order: number;
};

export const DEFAULT_WIDGET_CONFIGS: WidgetConfig[] = [
  { id: "focus", type: "focus", title: "집중 요약", enabled: true, size: "wide", order: 0 },
  { id: "clock", type: "clock", title: "시계", enabled: true, size: "small", order: 1 },
  { id: "today", type: "today", title: "오늘의 할 일", enabled: true, size: "medium", order: 2 },
  { id: "projects", type: "projects", title: "프로젝트 현황", enabled: true, size: "medium", order: 3 },
  { id: "calendar", type: "calendar", title: "이번 주 달력", enabled: true, size: "medium", order: 4 },
  { id: "kanban", type: "kanban", title: "칸반 미리보기", enabled: true, size: "wide", order: 5 },
  { id: "bookmarks", type: "bookmarks", title: "북마크", enabled: true, size: "medium", order: 6 },
  { id: "memo", type: "memo", title: "메모", enabled: true, size: "medium", order: 7 },
  { id: "music", type: "music", title: "음악 플레이리스트", enabled: false, size: "medium", order: 8 },
];

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

function getDefaultWidgetConfig(type: DashboardWidgetType) {
  return DEFAULT_WIDGET_CONFIGS.find((widget) => widget.type === type);
}

export function normalizeWidgetConfigs(configs: WidgetConfig[] = DEFAULT_WIDGET_CONFIGS) {
  const byType = new Map(configs.map((widget) => [widget.type, widget]));
  return DEFAULT_WIDGET_CONFIGS.map((fallback) => {
    const incoming = byType.get(fallback.type);
    return {
      ...fallback,
      ...incoming,
      id: fallback.type,
      type: fallback.type,
      title: incoming?.title || fallback.title,
    };
  })
    .sort((a, b) => a.order - b.order)
    .map((widget, order) => ({ ...widget, order }));
}

export function getVisibleWidgetConfigs(configs: WidgetConfig[]) {
  return normalizeWidgetConfigs(configs).filter((widget) => widget.enabled);
}

export function setWidgetVisibility(configs: WidgetConfig[], type: DashboardWidgetType, enabled: boolean) {
  return normalizeWidgetConfigs(configs).map((widget) => (widget.type === type ? { ...widget, enabled } : widget));
}

export function setWidgetSize(configs: WidgetConfig[], type: DashboardWidgetType, size: DashboardWidgetSize) {
  return normalizeWidgetConfigs(configs).map((widget) => (widget.type === type ? { ...widget, size } : widget));
}

export function moveWidgetConfig(configs: WidgetConfig[], type: DashboardWidgetType, direction: "up" | "down") {
  const ordered = normalizeWidgetConfigs(configs);
  const index = ordered.findIndex((widget) => widget.type === type);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return ordered;

  const next = [...ordered];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next.map((widget, order) => ({ ...widget, order }));
}

export function getWidgetTitle(type: DashboardWidgetType) {
  return getDefaultWidgetConfig(type)?.title ?? type;
}
