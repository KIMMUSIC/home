import {
  DEFAULT_WIDGET_CONFIGS,
  normalizeWidgetConfigs,
  type Bookmark,
  type CalendarEvent,
  type KanbanCard,
  type Project,
  type Todo,
  type WidgetConfig,
} from "./dashboard";


export type DashboardState = {
  projects: Project[];
  todos: Todo[];
  events: CalendarEvent[];
  bookmarks: Bookmark[];
  cards: KanbanCard[];
  widgets: WidgetConfig[];
  memo: string;
};

export const todayKey = "2026-06-13";
export const DASHBOARD_STORAGE_KEY = "diy-home-dashboard-state";

export const initialState: DashboardState = {
  projects: [
    { id: "p1", name: "DIY Home Dashboard", status: "active", progress: 68, dueDate: "2026-06-20" },
    { id: "p2", name: "CS Study Plan", status: "active", progress: 45, dueDate: "2026-06-30" },
    { id: "p3", name: "Portfolio Archive", status: "paused", progress: 28 },
  ],
  todos: [
    { id: "t1", title: "오전 루틴 체크", completed: true, date: todayKey },
    { id: "t2", title: "프로젝트 구조 정리", completed: false, date: todayKey },
    { id: "t3", title: "강의 2개 수강", completed: false, date: todayKey },
    { id: "t4", title: "회고 메모 남기기", completed: false, date: todayKey },
  ],
  events: [
    { id: "e1", title: "알고리즘 스터디", startAt: "2026-06-13T13:00:00" },
    { id: "e2", title: "프로젝트 회고", startAt: "2026-06-13T20:30:00" },
    { id: "e3", title: "자료 정리", startAt: "2026-06-15T10:00:00" },
  ],
  bookmarks: [
    { id: "b1", title: "GitHub", url: "https://github.com", pinned: true, category: "Dev" },
    { id: "b2", title: "Notion", url: "https://notion.so", pinned: true, category: "Workspace" },
    { id: "b3", title: "Vercel", url: "https://vercel.com", pinned: true, category: "Deploy" },
    { id: "b4", title: "MDN Docs", url: "https://developer.mozilla.org", pinned: false, category: "Docs" },
  ],
  cards: [
    {
      id: "c1",
      projectId: "p1",
      title: "북마크 카테고리 설계",
      column: "Backlog",
      order: 0,
      priority: "medium",
      description: "자주 쓰는 링크와 공부 자료를 분리해서 빠르게 찾을 수 있는 카테고리 구조를 설계한다.",
      startDate: "2026-06-12",
      dueDate: "2026-06-18",
      assignee: "me",
      reporter: "me",
      labels: ["UX", "Bookmarks"],
      createdAt: "2026-06-12",
      updatedAt: "2026-06-13",
    },
    {
      id: "c2",
      projectId: "p1",
      title: "위젯 편집 모드 개선",
      column: "Doing",
      order: 0,
      priority: "high",
      description: "위젯 표시/숨김, 순서, 크기 조절 흐름이 매일 쓰기 편한지 정리한다.",
      startDate: "2026-06-13",
      dueDate: "2026-06-15",
      assignee: "me",
      reporter: "me",
      labels: ["Widgets", "UX"],
      createdAt: "2026-06-13",
      updatedAt: "2026-06-13",
    },
    {
      id: "c3",
      projectId: "p1",
      title: "달력 입력 UX 확인",
      column: "Review",
      order: 0,
      priority: "medium",
      description: "일정 추가/수정/삭제와 주간/월간 모드가 직관적인지 확인한다.",
      startDate: "2026-06-14",
      dueDate: "2026-06-19",
      assignee: "me",
      reporter: "me",
      labels: ["Calendar"],
      createdAt: "2026-06-13",
      updatedAt: "2026-06-13",
    },
    {
      id: "c4",
      projectId: "p1",
      title: "대시보드 저장 방식 점검",
      column: "Waiting",
      order: 0,
      priority: "high",
      description: "로컬 저장과 계정 동기화 흐름이 충돌 없이 이어지는지 확인한다.",
      startDate: "2026-06-16",
      dueDate: "2026-06-22",
      assignee: "me",
      reporter: "me",
      labels: ["Storage", "Risk"],
      createdAt: "2026-06-13",
      updatedAt: "2026-06-13",
    },
    {
      id: "c5",
      projectId: "p2",
      title: "운영체제 강의 정리",
      column: "To Do",
      order: 0,
      priority: "medium",
      description: "프로세스/스레드 파트를 요약한다.",
      dueDate: "2026-06-24",
      labels: ["Study"],
    },
    {
      id: "c6",
      projectId: "p2",
      title: "네트워크 복습",
      column: "Later",
      order: 0,
      priority: "low",
      description: "HTTP, TCP/IP 복습 자료를 모은다.",
      dueDate: "2026-07-01",
      labels: ["Study"],
    },
  ],
  widgets: DEFAULT_WIDGET_CONFIGS,
  memo: "오늘 떠오른 아이디어와 임시 메모를 여기에 남겨두세요.",
};

export function normalizeDashboardState(state?: Partial<DashboardState> | null): DashboardState {
  return {
    projects: state?.projects ?? initialState.projects,
    todos: state?.todos ?? initialState.todos,
    events: state?.events ?? initialState.events,
    bookmarks: state?.bookmarks ?? initialState.bookmarks,
    cards: (state?.cards ?? initialState.cards).map((card) => ({
      description: "",
      labels: [],
      ...card,
    })),
    widgets: normalizeWidgetConfigs(state?.widgets),
    memo: state?.memo ?? initialState.memo,
  };
}

export function parseDashboardState(raw: string | null): DashboardState {
  if (!raw) return initialState;

  try {
    return normalizeDashboardState(JSON.parse(raw) as Partial<DashboardState>);
  } catch {
    return initialState;
  }
}

export function serializeDashboardState(state: DashboardState): string {
  return JSON.stringify(normalizeDashboardState(state));
}
