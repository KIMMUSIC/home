"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  LayoutDashboard,
  ListChecks,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import {
  calculateDashboardSummary,
  getCalendarDays,
  getKanbanColumns,
  getKanbanDragOverlayStyle,
  getKanbanPriorityLabel,
  getPinnedBookmarks,
  moveKanbanCardForDnd,
  parseKanbanLabelsInput,
  updateKanbanCardDetails,
  type Bookmark as BookmarkItem,
  type CalendarEvent,
  type CalendarMode,
  type KanbanCard,
  type KanbanColumnName,
  type Project,
  type Todo,
} from "@/lib/dashboard";

type AppView = "Home" | "Today" | "Projects" | "Kanban" | "Calendar" | "Bookmarks" | "Settings";

type DashboardState = {
  projects: Project[];
  todos: Todo[];
  events: CalendarEvent[];
  bookmarks: BookmarkItem[];
  cards: KanbanCard[];
};

const todayKey = "2026-06-13";

const initialState: DashboardState = {
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
      title: "상단 음악 플레이어 구현",
      column: "Doing",
      order: 0,
      priority: "high",
      description: "앨범 커버와 live waveform visualizer가 있는 상단 고정 플레이어를 구현한다.",
      startDate: "2026-06-13",
      dueDate: "2026-06-15",
      assignee: "me",
      reporter: "me",
      labels: ["Music", "Motion"],
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
      title: "YouTube Music fallback 조사",
      column: "Waiting",
      order: 0,
      priority: "high",
      description: "비공식 API가 막힐 때 YouTube embed 또는 playlist URL 기반으로 대체하는 전략을 조사한다.",
      startDate: "2026-06-16",
      dueDate: "2026-06-22",
      assignee: "me",
      reporter: "me",
      labels: ["Integration", "Risk"],
      createdAt: "2026-06-13",
      updatedAt: "2026-06-13",
    },
    { id: "c5", projectId: "p2", title: "운영체제 강의 정리", column: "To Do", order: 0, priority: "medium", description: "프로세스/스레드 파트를 요약한다.", dueDate: "2026-06-24", labels: ["Study"] },
    { id: "c6", projectId: "p2", title: "네트워크 복습", column: "Later", order: 0, priority: "low", description: "HTTP, TCP/IP 복습 자료를 모은다.", dueDate: "2026-07-01", labels: ["Study"] },
  ],
};

const navItems: { view: AppView; icon: React.ReactNode; shortcut: string }[] = [
  { view: "Home", icon: <LayoutDashboard size={17} />, shortcut: "⌘1" },
  { view: "Today", icon: <ListChecks size={17} />, shortcut: "⌘2" },
  { view: "Projects", icon: <Sparkles size={17} />, shortcut: "⌘3" },
  { view: "Kanban", icon: <PanelLeft size={17} />, shortcut: "⌘4" },
  { view: "Calendar", icon: <CalendarDays size={17} />, shortcut: "⌘5" },
  { view: "Bookmarks", icon: <Bookmark size={17} />, shortcut: "⌘6" },
  { view: "Settings", icon: <Settings size={17} />, shortcut: "" },
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function usePersistentDashboard() {
  const [state, setState] = useState<DashboardState>(initialState);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("diy-home-dashboard-state");
      if (stored) {
        const parsed = JSON.parse(stored) as DashboardState;
        setState({
          ...initialState,
          ...parsed,
          cards: parsed.cards.map((card) => ({
            description: "",
            labels: [],
            ...card,
          })),
        });
      }
      hydratedRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydratedRef.current) window.localStorage.setItem("diy-home-dashboard-state", JSON.stringify(state));
  }, [state]);

  return [state, setState] as const;
}

export default function Home() {
  const [view, setView] = useState<AppView>("Home");
  const [state, setState] = usePersistentDashboard();
  const [selectedProjectId, setSelectedProjectId] = useState("p1");
  const [quickText, setQuickText] = useState("");
  const [newEvent, setNewEvent] = useState("");
  const [newBookmark, setNewBookmark] = useState("");
  const [newCard, setNewCard] = useState("");
  const [musicPlaying, setMusicPlaying] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");

  const selectedProject = state.projects.find((project) => project.id === selectedProjectId) ?? state.projects[0];
  const selectedCard = state.cards.find((card) => card.id === selectedCardId) ?? null;
  const summary = useMemo(() => calculateDashboardSummary(state, todayKey), [state]);
  const columns = useMemo(() => getKanbanColumns(state.cards, selectedProject.id), [state.cards, selectedProject.id]);
  const pinnedBookmarks = useMemo(() => getPinnedBookmarks(state.bookmarks, 6), [state.bookmarks]);

  function addTodo(title = quickText) {
    const trimmed = title.trim();
    if (!trimmed) return;
    setState((current) => ({
      ...current,
      todos: [...current.todos, { id: makeId("todo"), title: trimmed, completed: false, date: todayKey }],
    }));
    setQuickText("");
  }

  function toggleTodo(id: string) {
    setState((current) => ({
      ...current,
      todos: current.todos.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)),
    }));
  }

  function addEvent() {
    const trimmed = newEvent.trim();
    if (!trimmed) return;
    setState((current) => ({
      ...current,
      events: [...current.events, { id: makeId("event"), title: trimmed, startAt: `${todayKey}T18:00:00` }],
    }));
    setNewEvent("");
  }

  function addBookmark() {
    const trimmed = newBookmark.trim();
    if (!trimmed) return;
    const [title, url = "https://example.com"] = trimmed.split("|").map((value) => value.trim());
    setState((current) => ({
      ...current,
      bookmarks: [...current.bookmarks, { id: makeId("bookmark"), title, url, pinned: true, category: "Inbox" }],
    }));
    setNewBookmark("");
  }

  function addCard(column: KanbanColumnName = "Backlog") {
    const trimmed = newCard.trim();
    if (!trimmed) return;
    setState((current) => ({
      ...current,
      cards: [
        ...current.cards,
        {
          id: makeId("card"),
          projectId: selectedProject.id,
          title: trimmed,
          column,
          order: current.cards.length,
          priority: "medium",
          description: "",
          startDate: todayKey,
          dueDate: todayKey,
          labels: [],
          assignee: "me",
          reporter: "me",
          createdAt: todayKey,
          updatedAt: todayKey,
        },
      ],
    }));
    setNewCard("");
  }

  function moveCard(id: string, target: { column: KanbanColumnName; overCardId?: string }) {
    setState((current) => ({ ...current, cards: moveKanbanCardForDnd(current.cards, id, target) }));
  }

  function updateCard(id: string, changes: Partial<KanbanCard>) {
    setState((current) => ({ ...current, cards: updateKanbanCardDetails(current.cards, id, changes) }));
  }

  function removeItem(kind: keyof DashboardState, id: string) {
    setState((current) => ({
      ...current,
      [kind]: current[kind].filter((item) => item.id !== id),
    }));
    if (kind === "cards" && selectedCardId === id) setSelectedCardId(null);
  }

  return (
    <main className={theme === "dark" ? "app-frame dark-mode" : "app-frame"}>
      <TopMusicPlayer playing={musicPlaying} setPlaying={setMusicPlaying} />
      <div className="workspace-shell">
        <aside className="sidebar">
          <div className="brand-lockup"><span className="brand-mark">H</span><strong>My Home</strong></div>
          <nav className="nav-list" aria-label="주요 화면">
            {navItems.map((item) => (
              <button key={item.view} className={view === item.view ? "nav-item active" : "nav-item"} onClick={() => { setView(item.view); if (item.view !== "Kanban") setSelectedCardId(null); }}>
                <span>{item.icon}{item.view}</span><em>{item.shortcut}</em>
              </button>
            ))}
          </nav>
          <div className="sync-card">
            <span className="status-dot" />
            <strong>Supabase sync ready</strong>
            <p>환경변수를 연결하면 같은 계정으로 여러 기기 동기화가 가능합니다. 현재는 로컬 저장으로 동작합니다.</p>
          </div>
        </aside>

        <section className="content-area">
          <PageHeader view={view} theme={theme} setTheme={setTheme} quickText={quickText} setQuickText={setQuickText} addTodo={addTodo} />
          {view === "Home" && <HomeDashboard state={state} summary={summary} pinnedBookmarks={pinnedBookmarks} setView={setView} toggleTodo={toggleTodo} />}
          {view === "Today" && <TodayView todos={state.todos} quickText={quickText} setQuickText={setQuickText} addTodo={addTodo} toggleTodo={toggleTodo} removeTodo={(id) => removeItem("todos", id)} />}
          {view === "Projects" && <ProjectsView projects={state.projects} setSelectedProjectId={setSelectedProjectId} setView={setView} />}
          {view === "Kanban" && <KanbanView projects={state.projects} selectedProjectId={selectedProject.id} setSelectedProjectId={setSelectedProjectId} columns={columns} newCard={newCard} setNewCard={setNewCard} addCard={addCard} moveCard={moveCard} removeCard={(id) => removeItem("cards", id)} selectCard={setSelectedCardId} />}
          {view === "Calendar" && <CalendarView events={state.events} newEvent={newEvent} setNewEvent={setNewEvent} addEvent={addEvent} removeEvent={(id) => removeItem("events", id)} mode={calendarMode} setMode={setCalendarMode} />}
          {view === "Bookmarks" && <BookmarksView bookmarks={state.bookmarks} newBookmark={newBookmark} setNewBookmark={setNewBookmark} addBookmark={addBookmark} removeBookmark={(id) => removeItem("bookmarks", id)} />}
          {view === "Settings" && <SettingsView theme={theme} setTheme={setTheme} />}
        </section>
      </div>
      <KanbanDetailDrawer card={selectedCard} project={selectedCard ? state.projects.find((project) => project.id === selectedCard.projectId) : undefined} onClose={() => setSelectedCardId(null)} onUpdate={updateCard} />
    </main>
  );
}

function TopMusicPlayer({ playing, setPlaying }: { playing: boolean; setPlaying: (playing: boolean) => void }) {
  return (
    <header className="top-music-bar">
      <div className="page-context"><span className="status-dot" /> Home · 작업 대시보드</div>
      <div className={playing ? "music-player playing" : "music-player"}>
        <div className="album-cover" aria-label="앨범 커버" />
        <div className="track-copy"><strong>warm desk session · autumn focus</strong><span>YouTube Music · playlist visualizer</span></div>
        <div className="live-waveform" aria-hidden="true">{Array.from({ length: 24 }).map((_, index) => <i key={index} />)}</div>
        <div className="music-controls"><button><ChevronLeft size={16} /></button><button onClick={() => setPlaying(!playing)}>{playing ? "Ⅱ" : "▶"}</button><button><ChevronRight size={16} /></button></div>
      </div>
      <div className="top-actions"><button className="soft-button"><Search size={16} />검색</button><button className="icon-button"><Settings size={17} /></button></div>
    </header>
  );
}

function PageHeader({ view, theme, setTheme, quickText, setQuickText, addTodo }: { view: AppView; theme: "light" | "dark"; setTheme: (theme: "light" | "dark") => void; quickText: string; setQuickText: (value: string) => void; addTodo: () => void }) {
  return (
    <div className="page-header">
      <div><span className="pill">JUNE 13 · SATURDAY</span><h1>{view === "Home" ? "오늘의 작업실" : view}</h1><p>정돈된 생산성 홈에서 할 일, 프로젝트, 일정, 북마크와 음악을 함께 관리합니다.</p></div>
      <div className="quick-add"><input value={quickText} onChange={(event) => setQuickText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTodo(); }} placeholder="할 일을 빠르게 추가" /><button className="primary-button" onClick={addTodo}><Plus size={16} />추가</button><button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button></div>
    </div>
  );
}

function HomeDashboard({ state, summary, pinnedBookmarks, setView, toggleTodo }: { state: DashboardState; summary: ReturnType<typeof calculateDashboardSummary>; pinnedBookmarks: BookmarkItem[]; setView: (view: AppView) => void; toggleTodo: (id: string) => void }) {
  return <div className="dashboard-grid">
    <section className="hero-card card"><span className="pill">좋은 아침 · 집중 모드</span><h2>오늘은 프로젝트 흐름을 정리하기 좋은 날이에요.</h2><p>작업 대시보드에서 오늘 할 일과 일정, 프로젝트 상태를 먼저 확인하고 상세 화면으로 이동하세요.</p><div className="metric-row"><span>오늘 할 일 {summary.todayTodos}</span><span>리뷰 대기 {summary.reviewCards}</span><span>일정 {summary.todayEvents}</span><span>평균 진행 {summary.averageProgress}%</span></div></section>
    <section className="clock-card card"><Clock3 size={18} /><strong>10:42</strong><span>다음 일정 · 13:00 알고리즘 스터디</span><div className="progress"><i style={{ width: `${summary.averageProgress}%` }} /></div></section>
    <Widget title="오늘의 할 일" action="Today" onAction={() => setView("Today")}><ul className="plain-list">{state.todos.slice(0, 5).map((todo) => <li key={todo.id}><button onClick={() => toggleTodo(todo.id)}>{todo.completed ? <CheckCircle2 size={17} /> : <Circle size={17} />}</button><span className={todo.completed ? "done" : ""}>{todo.title}</span></li>)}</ul></Widget>
    <Widget title="프로젝트 현황" action="Projects" onAction={() => setView("Projects")}><div className="stack">{state.projects.map((project) => <div className="project-mini" key={project.id}><strong>{project.name}</strong><div className="progress"><i style={{ width: `${project.progress}%` }} /></div></div>)}</div></Widget>
    <Widget title="이번 주 달력" action="Calendar" onAction={() => setView("Calendar")}><CalendarMini events={state.events} /></Widget>
    <Widget title="칸반 미리보기" action="Kanban" onAction={() => setView("Kanban")} wide><div className="kanban-strip">{["Backlog", "Doing", "Review"].map((column) => <div key={column}><strong>{column}</strong>{state.cards.filter((card) => card.column === column).slice(0, 2).map((card) => <span key={card.id}>{card.title}</span>)}</div>)}</div></Widget>
    <Widget title="북마크" action="Bookmarks" onAction={() => setView("Bookmarks")}><div className="bookmark-grid">{pinnedBookmarks.map((bookmark) => <a key={bookmark.id} href={bookmark.url} target="_blank">{bookmark.title}</a>)}</div></Widget>
  </div>;
}

function Widget({ title, action, onAction, wide, children }: { title: string; action: string; onAction: () => void; wide?: boolean; children: React.ReactNode }) { return <section className={wide ? "widget card wide" : "widget card"}><div className="widget-head"><h3>{title}</h3><button onClick={onAction}>{action}</button></div>{children}</section>; }

function TodayView({ todos, quickText, setQuickText, addTodo, toggleTodo, removeTodo }: { todos: Todo[]; quickText: string; setQuickText: (value: string) => void; addTodo: () => void; toggleTodo: (id: string) => void; removeTodo: (id: string) => void }) { return <section className="panel-card card"><div className="form-row"><input value={quickText} onChange={(event) => setQuickText(event.target.value)} placeholder="오늘 할 일 추가" /><button className="primary-button" onClick={() => addTodo()}>추가</button></div><ul className="detail-list">{todos.map((todo) => <li key={todo.id}><button onClick={() => toggleTodo(todo.id)}>{todo.completed ? <CheckCircle2 /> : <Circle />}</button><span className={todo.completed ? "done" : ""}>{todo.title}</span><em>{todo.date}</em><button onClick={() => removeTodo(todo.id)}><Trash2 size={16} /></button></li>)}</ul></section>; }

function ProjectsView({ projects, setSelectedProjectId, setView }: { projects: Project[]; setSelectedProjectId: (id: string) => void; setView: (view: AppView) => void }) { return <div className="project-grid">{projects.map((project) => <button className="project-card card" key={project.id} onClick={() => { setSelectedProjectId(project.id); setView("Kanban"); }}><span className="pill">{project.status}</span><h3>{project.name}</h3><p>{project.dueDate ? `마감 ${project.dueDate}` : "마감 없음"}</p><div className="progress"><i style={{ width: `${project.progress}%` }} /></div></button>)}</div>; }

type KanbanMoveTarget = { column: KanbanColumnName; overCardId?: string };

type KanbanDndData =
  | { type: "column"; column: KanbanColumnName }
  | { type: "card"; cardId: string; column: KanbanColumnName };

function KanbanView({ projects, selectedProjectId, setSelectedProjectId, columns, newCard, setNewCard, addCard, moveCard, removeCard, selectCard }: { projects: Project[]; selectedProjectId: string; setSelectedProjectId: (id: string) => void; columns: ReturnType<typeof getKanbanColumns>; newCard: string; setNewCard: (value: string) => void; addCard: (column?: KanbanColumnName) => void; moveCard: (id: string, target: KanbanMoveTarget) => void; removeCard: (id: string) => void; selectCard: (id: string) => void }) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeCardRect, setActiveCardRect] = useState<{ width: number; height?: number } | undefined>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const allCards = columns.flatMap((column) => column.cards);
  const activeCard = activeCardId ? allCards.find((card) => card.id === activeCardId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    const activeNode = Array.from(document.querySelectorAll<HTMLElement>("[data-kanban-card-id]")).find((node) => node.dataset.kanbanCardId === activeId);
    const initialRect = activeNode?.getBoundingClientRect() ?? event.active.rect.current.initial;
    setActiveCardId(activeId);
    setActiveCardRect(initialRect ? { width: initialRect.width, height: initialRect.height } : undefined);
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overData = event.over?.data.current as KanbanDndData | undefined;

    if (overData?.type === "card") {
      moveCard(activeId, { column: overData.column, overCardId: overData.cardId === activeId ? undefined : overData.cardId });
    }

    if (overData?.type === "column") {
      moveCard(activeId, { column: overData.column });
    }

    setActiveCardId(null);
    setActiveCardRect(undefined);
  }

  return <section className="kanban-page"><div className="form-row"><select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input value={newCard} onChange={(event) => setNewCard(event.target.value)} placeholder="새 칸반 카드" /><button className="primary-button" onClick={() => addCard("Backlog")}>Backlog에 추가</button></div><DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragCancel={() => { setActiveCardId(null); setActiveCardRect(undefined); }} onDragEnd={handleDragEnd}><div className="kanban-board">{columns.map((column) => <KanbanColumn key={column.name} column={column} activeCardId={activeCardId} removeCard={removeCard} selectCard={selectCard} />)}</div><DragOverlay>{activeCard ? <article className="kanban-card kanban-card-overlay" style={getKanbanDragOverlayStyle(activeCardRect)}><KanbanCardBody card={activeCard} /></article> : null}</DragOverlay></DndContext><p className="kanban-hint">dnd-kit 기반 드래그로 컬럼과 카드 사이를 이동합니다. 같은 컬럼 안에서는 카드 위로 드롭해 순서를 바꿀 수 있습니다.</p></section>;
}

function KanbanColumn({ column, activeCardId, removeCard, selectCard }: { column: ReturnType<typeof getKanbanColumns>[number]; activeCardId: string | null; removeCard: (id: string) => void; selectCard: (id: string) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: `column:${column.name}`, data: { type: "column", column: column.name } satisfies KanbanDndData });
  const columnClassName = isOver ? "kanban-column card drop-ready is-over" : activeCardId ? "kanban-column card drop-ready" : "kanban-column card";
  const emptyText = activeCardId ? "여기에 카드 놓기" : "아직 카드가 없어요";

  return <div ref={setNodeRef} className={columnClassName}><h3>{column.name}<span>{column.cards.length}</span></h3><SortableContext items={column.cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>{column.cards.map((card) => <SortableKanbanCard key={card.id} card={card} isActive={activeCardId === card.id} hasActiveCard={Boolean(activeCardId)} removeCard={removeCard} selectCard={selectCard} />)}</SortableContext>{column.cards.length === 0 ? <div className={activeCardId ? "kanban-empty-drop is-ready" : "kanban-empty-drop"}>{emptyText}</div> : null}</div>;
}

function SortableKanbanCard({ card, isActive, hasActiveCard, removeCard, selectCard }: { card: KanbanCard; isActive: boolean; hasActiveCard: boolean; removeCard: (id: string) => void; selectCard: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: card.id, data: { type: "card", cardId: card.id, column: card.column } satisfies KanbanDndData });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const cardClassName = [
    "kanban-card",
    "kanban-card-sortable",
    isDragging || isActive ? "dragging" : "",
    hasActiveCard && isOver && !isActive ? "drop-target" : "",
  ].filter(Boolean).join(" ");

  return <article ref={setNodeRef} style={style} className={cardClassName} data-kanban-card-id={card.id} onClick={() => selectCard(card.id)} {...attributes} {...listeners}><KanbanCardBody card={card} onDelete={() => removeCard(card.id)} /></article>;
}

function KanbanCardBody({ card, onDelete }: { card: KanbanCard; onDelete?: () => void }) {
  return <>{onDelete ? <button className="kanban-card-delete" aria-label="카드 삭제" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onDelete(); }}><X size={14} /></button> : null}<div className="kanban-card-top"><span className={`priority-dot ${card.priority ?? "medium"}`} /><strong>{card.title}</strong></div><p>{card.description || "상세 설명을 추가하세요."}</p><div className="kanban-card-meta"><span>{card.dueDate ? `Due ${card.dueDate.slice(5)}` : "No due"}</span><span>{card.labels?.[0] ?? "Task"}</span></div></>;
}

function KanbanDetailDrawer({ card, project, onClose, onUpdate }: { card: KanbanCard | null; project?: Project; onClose: () => void; onUpdate: (id: string, changes: Partial<KanbanCard>) => void }) {
  useEffect(() => {
    if (!card) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [card, onClose]);

  if (!card) return null;
  const labelsText = card.labels?.join(", ") ?? "";
  const labels = card.labels?.length ? card.labels : ["No label"];
  const priority = card.priority ?? "medium";

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="card-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="kanban-detail-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-title-group">
            <span className="pill">{project?.name ?? "Project"} · {card.column}</span>
            <h2 id="kanban-detail-title">{card.title || "제목 없는 카드"}</h2>
            <div className="drawer-meta-row">
              <span className={`priority-badge ${priority}`}>{getKanbanPriorityLabel(priority)}</span>
              <span>{card.dueDate ? `Due ${card.dueDate}` : "No due date"}</span>
              <span>{card.assignee || "Unassigned"}</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="카드 상세 닫기"><X size={18} /></button>
        </div>
        <div className="detail-layout">
          <section className="detail-main">
            <div className="detail-editor-card">
              <label>제목<input value={card.title} onChange={(event) => onUpdate(card.id, { title: event.target.value })} placeholder="카드 제목" /></label>
              <label>설명<textarea value={card.description ?? ""} onChange={(event) => onUpdate(card.id, { description: event.target.value })} placeholder="이슈 배경, 목표, 체크리스트를 적어보세요." /></label>
            </div>
            <div className="activity-box">
              <strong>Activity</strong>
              <div className="activity-timeline">
                <span><i />최근 업데이트 · {card.updatedAt ?? "방금 전"}</span>
                <span><i />상태 변경은 보드에서 드래그 앤 드롭으로 관리됩니다.</span>
                <span><i />필드 변경은 즉시 로컬 저장에 반영됩니다.</span>
              </div>
            </div>
          </section>
          <section className="detail-side" aria-label="카드 속성">
            <div className="field-card status-card"><span>Status</span><strong>{card.column}</strong><em>보드에서 드래그해 상태를 바꿉니다.</em></div>
            <label>Priority<select value={priority} onChange={(event) => onUpdate(card.id, { priority: event.target.value as KanbanCard["priority"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <label>Start date<input type="date" value={card.startDate ?? ""} onChange={(event) => onUpdate(card.id, { startDate: event.target.value })} /></label>
            <label>Due date<input type="date" value={card.dueDate ?? ""} onChange={(event) => onUpdate(card.id, { dueDate: event.target.value })} /></label>
            <label>Assignee<input value={card.assignee ?? ""} onChange={(event) => onUpdate(card.id, { assignee: event.target.value })} placeholder="담당자" /></label>
            <label>Reporter<input value={card.reporter ?? ""} onChange={(event) => onUpdate(card.id, { reporter: event.target.value })} placeholder="작성자" /></label>
            <label>Labels<input value={labelsText} onChange={(event) => onUpdate(card.id, { labels: parseKanbanLabelsInput(event.target.value) })} placeholder="UX, Music" /></label>
            <div className="label-preview" aria-label="현재 라벨">{labels.map((label) => <span key={label}>{label}</span>)}</div>
          </section>
        </div>
      </aside>
    </div>
  );
}


function CalendarView({ events, newEvent, setNewEvent, addEvent, removeEvent, mode, setMode }: { events: CalendarEvent[]; newEvent: string; setNewEvent: (value: string) => void; addEvent: () => void; removeEvent: (id: string) => void; mode: CalendarMode; setMode: (mode: CalendarMode) => void }) {
  const days = getCalendarDays(mode, todayKey);
  const eventsByDay = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const key = event.startAt.slice(0, 10);
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  });

  return <section className="panel-card card calendar-page"><div className="calendar-toolbar"><div><h2>{mode === "week" ? "주간 캘린더" : "월간 캘린더"}</h2><p>일정은 자체 캘린더에서 관리합니다. Google Calendar 연동은 제외했습니다.</p></div><div className="segmented"><button className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}>주간</button><button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>월간</button></div></div><div className="form-row"><input value={newEvent} onChange={(event) => setNewEvent(event.target.value)} placeholder="새 일정 제목" /><button className="primary-button" onClick={addEvent}>일정 추가</button></div><div className={mode === "week" ? "calendar-board week" : "calendar-board month"}>{days.map((day) => <div className={!day.inCurrentMonth ? "calendar-day muted" : day.isToday ? "calendar-day today" : "calendar-day"} key={day.dateKey}><div className="calendar-day-head"><strong>{day.dayNumber}</strong><span>{day.dateKey.slice(5)}</span></div><div className="calendar-events">{(eventsByDay.get(day.dateKey) ?? []).map((event) => <button key={event.id} onClick={() => removeEvent(event.id)} title="클릭하면 삭제됩니다"><span>{event.startAt.slice(11, 16)}</span>{event.title}</button>)}</div></div>)}</div></section>;
}

function BookmarksView({ bookmarks, newBookmark, setNewBookmark, addBookmark, removeBookmark }: { bookmarks: BookmarkItem[]; newBookmark: string; setNewBookmark: (value: string) => void; addBookmark: () => void; removeBookmark: (id: string) => void }) { return <section className="panel-card card"><div className="form-row"><input value={newBookmark} onChange={(event) => setNewBookmark(event.target.value)} placeholder="제목 | https://url.com" /><button className="primary-button" onClick={addBookmark}>북마크 추가</button></div><div className="bookmark-table">{bookmarks.map((bookmark) => <a key={bookmark.id} href={bookmark.url} target="_blank"><strong>{bookmark.title}</strong><span>{bookmark.category}</span><button onClick={(event) => { event.preventDefault(); removeBookmark(bookmark.id); }}><Trash2 size={15} /></button></a>)}</div></section>; }

function SettingsView({ theme, setTheme }: { theme: "light" | "dark"; setTheme: (theme: "light" | "dark") => void }) { return <section className="panel-card card"><h2>설정</h2><p>Supabase URL/Anon Key를 환경변수로 연결하면 Auth와 클라우드 DB 동기화로 확장됩니다.</p><div className="settings-grid"><button className="soft-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "다크모드로 전환" : "라이트모드로 전환"}</button><code>NEXT_PUBLIC_SUPABASE_URL</code><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code><code>YouTube Music: 비공식 연동 시도 + embed fallback</code></div></section>; }

function CalendarMini({ events, large = false }: { events: CalendarEvent[]; large?: boolean }) { const eventDays = new Set(events.map((event) => Number(event.startAt.slice(8, 10)))); return <div className={large ? "calendar-mini large" : "calendar-mini"}>{[9, 10, 11, 12, 13, 14, 15].map((day) => <span key={day} className={eventDays.has(day) ? "event-day" : day === 13 ? "today-day" : ""}>{day}</span>)}</div>; }
