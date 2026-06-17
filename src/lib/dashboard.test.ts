import { describe, expect, it } from "vitest";
import {
  calculateDashboardSummary,
  DEFAULT_WIDGET_CONFIGS,
  getCalendarDays,
  getKanbanColumns,
  getKanbanDragOverlayStyle,
  getKanbanPriorityLabel,
  getPinnedBookmarks,
  getVisibleWidgetConfigs,
  getWidgetTitle,
  moveWidgetConfig,
  normalizeWidgetConfigs,
  parseKanbanLabelsInput,
  moveKanbanCardForDnd,
  moveKanbanCardToColumn,
  setWidgetSize,
  setWidgetVisibility,
  updateKanbanCardDetails,
  type CalendarEvent,
  type KanbanCard,
  type Project,
  type Todo,
} from "./dashboard";

const projects: Project[] = [
  { id: "p1", name: "DIY Home", status: "active", progress: 68, dueDate: "2026-06-20" },
  { id: "p2", name: "Study Plan", status: "active", progress: 45 },
  { id: "p3", name: "Archive", status: "paused", progress: 20 },
];

const todos: Todo[] = [
  { id: "t1", title: "done", completed: true, date: "2026-06-13" },
  { id: "t2", title: "today", completed: false, date: "2026-06-13" },
  { id: "t3", title: "tomorrow", completed: false, date: "2026-06-14" },
];

const cards: KanbanCard[] = [
  { id: "c1", projectId: "p1", title: "review", column: "Review", order: 0, dueDate: "2026-06-18" },
  { id: "c2", projectId: "p1", title: "doing", column: "Doing", order: 0 },
  { id: "c3", projectId: "p1", title: "later", column: "Later", order: 0 },
  { id: "c4", projectId: "p2", title: "other", column: "Backlog", order: 0 },
  { id: "c5", projectId: "p1", title: "review 2", column: "Review", order: 1 },
];

const events: CalendarEvent[] = [
  { id: "e1", title: "Study", startAt: "2026-06-13T13:00:00" },
  { id: "e2", title: "Tomorrow", startAt: "2026-06-14T09:00:00" },
];

describe("dashboard helpers", () => {
  it("summarizes only today and active work", () => {
    expect(calculateDashboardSummary({ projects, todos, cards, events }, "2026-06-13")).toEqual({
      activeProjects: 2,
      todayTodos: 2,
      openTodayTodos: 1,
      todayEvents: 1,
      reviewCards: 2,
      averageProgress: 57,
    });
  });

  it("returns ordered kanban columns for one project", () => {
    const columns = getKanbanColumns(cards, "p1");
    expect(columns.map((column) => column.name)).toEqual([
      "Backlog",
      "To Do",
      "Doing",
      "Waiting",
      "Review",
      "Done",
      "Later",
    ]);
    expect(columns.find((column) => column.name === "Doing")?.cards).toHaveLength(1);
    expect(columns.find((column) => column.name === "Backlog")?.cards).toHaveLength(0);
  });

  it("keeps the kanban drag overlay at the measured card width", () => {
    expect(getKanbanDragOverlayStyle({ width: 248.5, height: 96 })).toEqual({ width: 248.5 });
    expect(getKanbanDragOverlayStyle(undefined)).toEqual({});
  });

  it("normalizes drawer label input and exposes friendly priority labels", () => {
    expect(parseKanbanLabelsInput(" UX, Design, UX,  , Integration ")).toEqual(["UX", "Design", "Integration"]);
    expect(getKanbanPriorityLabel("high")).toBe("High priority");
    expect(getKanbanPriorityLabel(undefined)).toBe("Medium priority");
  });

  it("moves a kanban card to a new column and places it at the end of that column", () => {
    const moved = moveKanbanCardToColumn(cards, "c2", "Review");
    const card = moved.find((item) => item.id === "c2");

    expect(card?.column).toBe("Review");
    expect(card?.order).toBe(2);
    expect(moved.find((item) => item.id === "c1")?.column).toBe("Review");
  });

  it("moves a dragged card before an existing card in another column and reindexes the target column", () => {
    const moved = moveKanbanCardForDnd(cards, "c2", { column: "Review", overCardId: "c5" });
    const reviewCards = getKanbanColumns(moved, "p1").find((column) => column.name === "Review")?.cards;

    expect(reviewCards?.map((card) => `${card.id}:${card.order}`)).toEqual(["c1:0", "c2:1", "c5:2"]);
    expect(moved.find((card) => card.id === "c2")?.column).toBe("Review");
  });

  it("reorders a dragged card within the same column", () => {
    const sameColumnCards: KanbanCard[] = [
      { id: "c1", projectId: "p1", title: "first", column: "Review", order: 0 },
      { id: "c2", projectId: "p1", title: "second", column: "Review", order: 1 },
      { id: "c3", projectId: "p1", title: "third", column: "Review", order: 2 },
    ];

    const moved = moveKanbanCardForDnd(sameColumnCards, "c3", { column: "Review", overCardId: "c1" });
    const reviewCards = getKanbanColumns(moved, "p1").find((column) => column.name === "Review")?.cards;

    expect(reviewCards?.map((card) => `${card.id}:${card.order}`)).toEqual(["c3:0", "c1:1", "c2:2"]);
  });

  it("moves a dragged card to the end when dropped on an empty column area", () => {
    const moved = moveKanbanCardForDnd(cards, "c2", { column: "Backlog" });
    const backlogCards = getKanbanColumns(moved, "p1").find((column) => column.name === "Backlog")?.cards;

    expect(backlogCards?.map((card) => `${card.id}:${card.order}`)).toEqual(["c2:0"]);
  });

  it("updates Jira-like detail fields without losing existing card data", () => {
    const updated = updateKanbanCardDetails(cards, "c1", {
      title: "review updated",
      description: "상세 설명",
      dueDate: "2026-06-30",
      priority: "high",
    });
    const card = updated.find((item) => item.id === "c1");

    expect(card).toMatchObject({
      id: "c1",
      projectId: "p1",
      column: "Review",
      title: "review updated",
      description: "상세 설명",
      dueDate: "2026-06-30",
      priority: "high",
    });
  });

  it("returns a Monday-first weekly calendar range", () => {
    expect(getCalendarDays("week", "2026-06-13").map((day) => day.dateKey)).toEqual([
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
  });

  it("returns a 6-week month grid and marks outside-month days", () => {
    const days = getCalendarDays("month", "2026-06-13");

    expect(days).toHaveLength(42);
    expect(days[0]).toMatchObject({ dateKey: "2026-06-01", inCurrentMonth: true, isToday: false });
    expect(days.at(-1)).toMatchObject({ dateKey: "2026-07-12", inCurrentMonth: false });
    expect(days.find((day) => day.dateKey === "2026-06-13")?.isToday).toBe(true);
  });

  it("sorts pinned bookmarks first and limits the result", () => {
    const bookmarks = [
      { id: "b1", title: "Docs", url: "https://docs.example", pinned: false, category: "Docs" },
      { id: "b2", title: "GitHub", url: "https://github.com", pinned: true, category: "Dev" },
      { id: "b3", title: "Vercel", url: "https://vercel.com", pinned: true, category: "Deploy" },
    ];
    expect(getPinnedBookmarks(bookmarks, 2).map((bookmark) => bookmark.title)).toEqual(["GitHub", "Vercel"]);
  });

  it("normalizes widget settings with defaults and stable order", () => {
    const custom = normalizeWidgetConfigs([
      { id: "bookmarks", type: "bookmarks", title: "Links", enabled: false, size: "wide", order: 0 },
      { id: "today", type: "today", title: "오늘", enabled: true, size: "small", order: 3 },
    ]);

    expect(custom).toHaveLength(DEFAULT_WIDGET_CONFIGS.length);
    expect(custom.map((widget) => `${widget.order}:${widget.type}`)).toEqual(custom.map((widget, index) => `${index}:${widget.type}`));
    expect(custom.find((widget) => widget.type === "bookmarks")).toMatchObject({ title: "Links", enabled: false, size: "wide" });
    expect(custom.find((widget) => widget.type === "kanban")?.enabled).toBe(true);
  });

  it("filters visible widgets and updates visibility and size", () => {
    const hidden = setWidgetVisibility(DEFAULT_WIDGET_CONFIGS, "kanban", false);
    const resized = setWidgetSize(hidden, "today", "wide");

    expect(getVisibleWidgetConfigs(resized).some((widget) => widget.type === "kanban")).toBe(false);
    expect(resized.find((widget) => widget.type === "today")?.size).toBe("wide");
    expect(DEFAULT_WIDGET_CONFIGS.some((widget) => widget.type === `${"mu"}sic`)).toBe(false);
    expect(getWidgetTitle("memo")).toBe("메모");
  });

  it("moves widget configuration up and down without losing order indexes", () => {
    const movedDown = moveWidgetConfig(DEFAULT_WIDGET_CONFIGS, "today", "down");
    const projectIndex = movedDown.findIndex((widget) => widget.type === "projects");
    const todayIndex = movedDown.findIndex((widget) => widget.type === "today");

    expect(todayIndex).toBe(projectIndex + 1);
    expect(movedDown.map((widget) => widget.order)).toEqual(movedDown.map((_, index) => index));
    expect(moveWidgetConfig(movedDown, "focus", "up").map((widget) => widget.type)).toEqual(movedDown.map((widget) => widget.type));
  });
});
