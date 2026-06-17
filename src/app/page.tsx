"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
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
  ArrowDown,
  ArrowUp,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Eye,
  EyeOff,
  LayoutDashboard,
  ListChecks,
  Moon,
  PanelLeft,
  Plus,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
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
  moveKanbanCardForDnd,
  moveWidgetConfig,
  normalizeWidgetConfigs,
  parseKanbanLabelsInput,
  setWidgetSize,
  setWidgetVisibility,
  updateKanbanCardDetails,
  type Bookmark as BookmarkItem,
  type CalendarEvent,
  type CalendarMode,
  type DashboardWidgetSize,
  type DashboardWidgetType,
  type KanbanCard,
  type KanbanColumnName,
  type Project,
  type Todo,
  type WidgetConfig,
} from "@/lib/dashboard";
import { loadDashboardStateFromCloud, saveDashboardStateToCloud } from "@/lib/dashboard-cloud-sync";
import {
  DASHBOARD_STORAGE_KEY,
  initialState,
  normalizeDashboardState,
  parseDashboardState,
  serializeDashboardState,
  todayKey,
  type DashboardState,
} from "@/lib/dashboard-state";
import { createSupabaseBrowserClient, getSupabaseBrowserConfigStatus } from "@/lib/supabase";

type AppView = "Home" | "Today" | "Projects" | "Kanban" | "Calendar" | "Bookmarks" | "Settings";

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

type DashboardSyncStatus = "local" | "checking" | "cloud" | "saving" | "synced" | "error" | "email-sent";

type DashboardAccount = {
  user: User | null;
  clientReady: boolean;
  configKeyName: string;
  syncStatus: DashboardSyncStatus;
  syncMessage: string;
  authEmail: string;
  authPending: boolean;
  authError: string | null;
  authNotice: string | null;
  setAuthEmail: (value: string) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

function usePersistentDashboard() {
  const supabaseClient = useMemo(() => createSupabaseBrowserClient(), []);
  const supabaseConfig = useMemo(() => getSupabaseBrowserConfigStatus(), []);
  const [state, setState] = useState<DashboardState>(initialState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<DashboardSyncStatus>(supabaseConfig.ready ? "checking" : "local");
  const [syncMessage, setSyncMessage] = useState(supabaseConfig.ready ? "계정 상태 확인 중" : "Supabase 환경변수 없음 · 이 기기 로컬 저장");
  const [authEmail, setAuthEmail] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const cloudHydratingRef = useRef(false);
  const lastSyncedSnapshotRef = useRef("");
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState(parseDashboardState(window.localStorage.getItem(DASHBOARD_STORAGE_KEY)));
      setIsHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(DASHBOARD_STORAGE_KEY, serializeDashboardState(state));
  }, [isHydrated, state]);

  useEffect(() => {
    if (!supabaseClient) return;

    let cancelled = false;

    supabaseClient.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const nextUser = data.user ?? null;
      setUser(nextUser);
      if (!nextUser) {
        setSyncStatus("local");
        setSyncMessage("로그인하면 여러 기기에서 같은 대시보드를 사용할 수 있습니다.");
      }
    });

    const { data: authListener } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setAuthError(null);
      if (!nextUser) {
        lastSyncedSnapshotRef.current = "";
        setSyncStatus("local");
        setSyncMessage("로그아웃됨 · 이 기기에 계속 저장됩니다.");
      }
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [supabaseClient]);

  useEffect(() => {
    if (!isHydrated || !supabaseClient || !user) return;

    let cancelled = false;
    const client = supabaseClient;
    const currentUser = user;
    cloudHydratingRef.current = true;

    async function hydrateCloudState() {
      setSyncStatus("checking");
      setSyncMessage("Supabase에서 내 대시보드를 불러오는 중");

      try {
        const { state: cloudState, updatedAt } = await loadDashboardStateFromCloud(client, currentUser.id);
        if (cancelled) return;

        if (cloudState) {
          lastSyncedSnapshotRef.current = serializeDashboardState(cloudState);
          setState(cloudState);
          setSyncStatus("cloud");
          setSyncMessage(updatedAt ? `클라우드 데이터 불러옴 · ${new Date(updatedAt).toLocaleString("ko-KR")}` : "클라우드 데이터 불러옴");
          return;
        }

        const seedState = normalizeDashboardState(stateRef.current);
        const syncedState = await saveDashboardStateToCloud(client, currentUser.id, seedState);
        if (cancelled) return;
        lastSyncedSnapshotRef.current = serializeDashboardState(syncedState);
        setSyncStatus("cloud");
        setSyncMessage("이 기기의 데이터를 계정에 처음 저장했습니다.");
      } catch (error: unknown) {
        if (cancelled) return;
        setSyncStatus("error");
        setSyncMessage(error instanceof Error ? error.message : "클라우드 동기화 실패");
      } finally {
        if (!cancelled) cloudHydratingRef.current = false;
      }
    }

    void hydrateCloudState();

    return () => {
      cancelled = true;
      cloudHydratingRef.current = false;
    };
  }, [isHydrated, supabaseClient, user]);

  useEffect(() => {
    if (!isHydrated || !supabaseClient || !user || cloudHydratingRef.current) return;

    const snapshot = serializeDashboardState(state);
    if (snapshot === lastSyncedSnapshotRef.current) return;

    const client = supabaseClient;
    const userId = user.id;
    setSyncStatus("saving");
    setSyncMessage("변경사항을 클라우드에 저장 중");

    const timer = window.setTimeout(() => {
      saveDashboardStateToCloud(client, userId, state)
        .then((syncedState) => {
          lastSyncedSnapshotRef.current = serializeDashboardState(syncedState);
          setSyncStatus("synced");
          setSyncMessage("모든 기기에 저장됨");
        })
        .catch((error: unknown) => {
          setSyncStatus("error");
          setSyncMessage(error instanceof Error ? error.message : "클라우드 저장 실패");
        });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [isHydrated, state, supabaseClient, user]);

  async function signIn() {
    if (!supabaseClient) {
      setAuthError("Supabase 환경변수를 먼저 연결해야 합니다.");
      return;
    }

    const email = authEmail.trim();
    if (!email) {
      setAuthError("로그인할 이메일을 입력하세요.");
      return;
    }

    setAuthPending(true);
    setAuthError(null);
    setAuthNotice(null);

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    setAuthPending(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthNotice("인증 메일을 보냈습니다. 메일 링크로 돌아오면 클라우드 동기화가 시작됩니다.");
    setSyncStatus("email-sent");
    setSyncMessage("이메일 인증 대기 중");
  }

  async function signOut() {
    if (!supabaseClient) return;
    setAuthPending(true);
    const { error } = await supabaseClient.auth.signOut();
    setAuthPending(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setUser(null);
  }

  return [
    state,
    setState,
    {
      user,
      clientReady: supabaseConfig.ready,
      configKeyName: supabaseConfig.keyName,
      syncStatus,
      syncMessage,
      authEmail,
      authPending,
      authError,
      authNotice,
      setAuthEmail,
      signIn,
      signOut,
    } satisfies DashboardAccount,
  ] as const;
}

export default function Home() {
  const [view, setView] = useState<AppView>("Home");
  const [state, setState, account] = usePersistentDashboard();
  const [selectedProjectId, setSelectedProjectId] = useState("p1");
  const [quickText, setQuickText] = useState("");
  const [newEvent, setNewEvent] = useState("");
  const [newBookmark, setNewBookmark] = useState("");
  const [newCard, setNewCard] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");
  const [isDashboardEditing, setIsDashboardEditing] = useState(false);
  const [isWidgetManagerOpen, setIsWidgetManagerOpen] = useState(false);

  const selectedProject = state.projects.find((project) => project.id === selectedProjectId) ?? state.projects[0] ?? initialState.projects[0];
  const selectedCard = state.cards.find((card) => card.id === selectedCardId) ?? null;
  const selectedEvent = state.events.find((event) => event.id === selectedEventId) ?? null;
  const summary = useMemo(() => calculateDashboardSummary(state, todayKey), [state]);
  const columns = useMemo(() => getKanbanColumns(state.cards, selectedProject.id), [state.cards, selectedProject.id]);
  const pinnedBookmarks = useMemo(() => getPinnedBookmarks(state.bookmarks, 6), [state.bookmarks]);
  const widgets = useMemo(() => normalizeWidgetConfigs(state.widgets), [state.widgets]);
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

  function updateEvent(id: string, changes: Partial<CalendarEvent>) {
    setState((current) => ({
      ...current,
      events: current.events.map((event) => (event.id === id ? { ...event, ...changes, id: event.id } : event)),
    }));
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

  function updateWidgetConfigs(updater: (widgets: WidgetConfig[]) => WidgetConfig[]) {
    setState((current) => ({ ...current, widgets: normalizeWidgetConfigs(updater(current.widgets)) }));
  }

  function toggleWidget(type: DashboardWidgetType, enabled: boolean) {
    updateWidgetConfigs((current) => setWidgetVisibility(current, type, enabled));
  }

  function changeWidgetSize(type: DashboardWidgetType, size: DashboardWidgetSize) {
    updateWidgetConfigs((current) => setWidgetSize(current, type, size));
  }

  function moveWidget(type: DashboardWidgetType, direction: "up" | "down") {
    updateWidgetConfigs((current) => moveWidgetConfig(current, type, direction));
  }

  function resetWidgets() {
    setState((current) => ({ ...current, widgets: DEFAULT_WIDGET_CONFIGS }));
  }

  function updateMemo(memo: string) {
    setState((current) => ({ ...current, memo }));
  }

  function removeItem(kind: "todos" | "events" | "bookmarks" | "cards", id: string) {
    setState((current) => ({
      ...current,
      [kind]: current[kind].filter((item) => item.id !== id),
    }));
    if (kind === "cards" && selectedCardId === id) setSelectedCardId(null);
    if (kind === "events" && selectedEventId === id) setSelectedEventId(null);
  }

  return (
    <main className={theme === "dark" ? "app-frame dark-mode" : "app-frame"}>
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
          <SyncCard account={account} onOpenSettings={() => setView("Settings")} />
        </aside>

        <section className="content-area">
          <PageHeader view={view} quickText={quickText} setQuickText={setQuickText} addTodo={addTodo} isDashboardEditing={isDashboardEditing} setIsDashboardEditing={setIsDashboardEditing} onOpenWidgetManager={() => setIsWidgetManagerOpen(true)} />
          {view === "Home" && <HomeDashboard state={state} summary={summary} pinnedBookmarks={pinnedBookmarks} widgets={widgets} isEditing={isDashboardEditing} setView={setView} toggleTodo={toggleTodo} toggleWidget={toggleWidget} changeWidgetSize={changeWidgetSize} moveWidget={moveWidget} updateMemo={updateMemo} onOpenWidgetManager={() => setIsWidgetManagerOpen(true)} />}
          {view === "Today" && <TodayView todos={state.todos} quickText={quickText} setQuickText={setQuickText} addTodo={addTodo} toggleTodo={toggleTodo} removeTodo={(id) => removeItem("todos", id)} />}
          {view === "Projects" && <ProjectsView projects={state.projects} setSelectedProjectId={setSelectedProjectId} setView={setView} />}
          {view === "Kanban" && <KanbanView projects={state.projects} selectedProjectId={selectedProject.id} setSelectedProjectId={setSelectedProjectId} columns={columns} newCard={newCard} setNewCard={setNewCard} addCard={addCard} moveCard={moveCard} removeCard={(id) => removeItem("cards", id)} selectCard={setSelectedCardId} />}
          {view === "Calendar" && <CalendarView events={state.events} newEvent={newEvent} setNewEvent={setNewEvent} addEvent={addEvent} removeEvent={(id) => removeItem("events", id)} selectEvent={setSelectedEventId} mode={calendarMode} setMode={setCalendarMode} />}
          {view === "Bookmarks" && <BookmarksView bookmarks={state.bookmarks} newBookmark={newBookmark} setNewBookmark={setNewBookmark} addBookmark={addBookmark} removeBookmark={(id) => removeItem("bookmarks", id)} />}
          {view === "Settings" && <SettingsView theme={theme} setTheme={setTheme} account={account} />}
        </section>
      </div>
      <KanbanDetailDrawer card={selectedCard} project={selectedCard ? state.projects.find((project) => project.id === selectedCard.projectId) : undefined} onClose={() => setSelectedCardId(null)} onUpdate={updateCard} />
      <CalendarEventDetailDrawer event={selectedEvent} onClose={() => setSelectedEventId(null)} onUpdate={updateEvent} onDelete={(id) => removeItem("events", id)} />
      <WidgetManagerDrawer open={isWidgetManagerOpen} widgets={widgets} onClose={() => setIsWidgetManagerOpen(false)} onToggle={toggleWidget} onSizeChange={changeWidgetSize} onMove={moveWidget} onReset={resetWidgets} />
    </main>
  );
}

function SyncCard({ account, onOpenSettings }: { account: DashboardAccount; onOpenSettings: () => void }) {
  const signedIn = Boolean(account.user);
  const title = !account.clientReady ? "Local mode" : signedIn ? "Cloud sync active" : "Account sync ready";
  const description = signedIn
    ? account.syncMessage
    : account.clientReady
      ? "이메일로 로그인하면 같은 계정의 모든 기기에서 같은 대시보드를 사용합니다."
      : "Supabase 환경변수를 연결하면 계정 기반 멀티 디바이스 동기화가 켜집니다.";

  return (
    <div className={`sync-card sync-${account.syncStatus}`}>
      <span className="status-dot" />
      <strong>{title}</strong>
      <p>{description}</p>
      {signedIn ? <em>{account.user?.email}</em> : null}
      <button className="sync-card-action" onClick={signedIn ? () => void account.signOut() : onOpenSettings}>
        {signedIn ? "로그아웃" : "계정 연결"}
      </button>
    </div>
  );
}

function PageHeader({ view, quickText, setQuickText, addTodo, isDashboardEditing, setIsDashboardEditing, onOpenWidgetManager }: { view: AppView; quickText: string; setQuickText: (value: string) => void; addTodo: () => void; isDashboardEditing: boolean; setIsDashboardEditing: (value: boolean) => void; onOpenWidgetManager: () => void }) {
  const isHome = view === "Home";
  return (
    <div className="page-header">
      <div><span className="pill">JUNE 13 · SATURDAY</span><h1>{isHome ? "오늘의 작업실" : view}</h1><p>정돈된 생산성 홈에서 할 일, 프로젝트, 일정, 북마크를 한 화면에서 관리합니다.</p></div>
      <div className="page-header-actions">
        <div className="quick-add"><input value={quickText} onChange={(event) => setQuickText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTodo(); }} placeholder="할 일을 빠르게 추가" /><button className="primary-button" onClick={addTodo}><Plus size={16} />추가</button></div>
        {isHome ? <div className="dashboard-edit-actions"><button className="soft-button" onClick={onOpenWidgetManager}><SlidersHorizontal size={16} />위젯 관리</button><button className={isDashboardEditing ? "soft-button active" : "soft-button"} onClick={() => setIsDashboardEditing(!isDashboardEditing)}>{isDashboardEditing ? "편집 완료" : "편집 모드"}</button></div> : null}
      </div>
    </div>
  );
}

function HomeDashboard({ state, summary, pinnedBookmarks, widgets, isEditing, setView, toggleTodo, toggleWidget, changeWidgetSize, moveWidget, updateMemo, onOpenWidgetManager }: { state: DashboardState; summary: ReturnType<typeof calculateDashboardSummary>; pinnedBookmarks: BookmarkItem[]; widgets: WidgetConfig[]; isEditing: boolean; setView: (view: AppView) => void; toggleTodo: (id: string) => void; toggleWidget: (type: DashboardWidgetType, enabled: boolean) => void; changeWidgetSize: (type: DashboardWidgetType, size: DashboardWidgetSize) => void; moveWidget: (type: DashboardWidgetType, direction: "up" | "down") => void; updateMemo: (memo: string) => void; onOpenWidgetManager: () => void }) {
  const visibleWidgets = getVisibleWidgetConfigs(widgets);
  const widgetContext = { isEditing, toggleWidget, changeWidgetSize, moveWidget };

  function renderWidget(config: WidgetConfig) {
    if (config.type === "focus") {
      return <DashboardWidgetFrame key={config.id} config={config} variant="hero" {...widgetContext}><span className="pill">좋은 아침 · 집중 모드</span><h2>오늘은 프로젝트 흐름을 정리하기 좋은 날이에요.</h2><p>작업 대시보드에서 오늘 할 일과 일정, 프로젝트 상태를 먼저 확인하고 상세 화면으로 이동하세요.</p><div className="metric-row"><span>오늘 할 일 {summary.todayTodos}</span><span>리뷰 대기 {summary.reviewCards}</span><span>일정 {summary.todayEvents}</span><span>평균 진행 {summary.averageProgress}%</span></div></DashboardWidgetFrame>;
    }

    if (config.type === "clock") {
      return <DashboardWidgetFrame key={config.id} config={config} variant="clock" {...widgetContext}><Clock3 size={18} /><strong>10:42</strong><span>다음 일정 · 13:00 알고리즘 스터디</span><div className="progress"><i style={{ width: `${summary.averageProgress}%` }} /></div></DashboardWidgetFrame>;
    }

    if (config.type === "today") {
      return <DashboardWidgetFrame key={config.id} config={config} title="오늘의 할 일" action="Today" onAction={() => setView("Today")} {...widgetContext}><ul className="plain-list">{state.todos.slice(0, 5).map((todo) => <li key={todo.id}><button onClick={() => toggleTodo(todo.id)}>{todo.completed ? <CheckCircle2 size={17} /> : <Circle size={17} />}</button><span className={todo.completed ? "done" : ""}>{todo.title}</span></li>)}</ul></DashboardWidgetFrame>;
    }

    if (config.type === "projects") {
      return <DashboardWidgetFrame key={config.id} config={config} title="프로젝트 현황" action="Projects" onAction={() => setView("Projects")} {...widgetContext}><div className="stack">{state.projects.map((project) => <div className="project-mini" key={project.id}><strong>{project.name}</strong><div className="progress"><i style={{ width: `${project.progress}%` }} /></div></div>)}</div></DashboardWidgetFrame>;
    }

    if (config.type === "calendar") {
      return <DashboardWidgetFrame key={config.id} config={config} title="이번 주 달력" action="Calendar" onAction={() => setView("Calendar")} {...widgetContext}><CalendarMini events={state.events} /></DashboardWidgetFrame>;
    }

    if (config.type === "kanban") {
      return <DashboardWidgetFrame key={config.id} config={config} title="칸반 미리보기" action="Kanban" onAction={() => setView("Kanban")} {...widgetContext}><div className="kanban-strip">{["Backlog", "Doing", "Review"].map((column) => <div key={column}><strong>{column}</strong>{state.cards.filter((card) => card.column === column).slice(0, 2).map((card) => <span key={card.id}>{card.title}</span>)}</div>)}</div></DashboardWidgetFrame>;
    }

    if (config.type === "bookmarks") {
      return <DashboardWidgetFrame key={config.id} config={config} title="북마크" action="Bookmarks" onAction={() => setView("Bookmarks")} {...widgetContext}><div className="bookmark-grid">{pinnedBookmarks.map((bookmark) => <a key={bookmark.id} href={bookmark.url} target="_blank">{bookmark.title}</a>)}</div></DashboardWidgetFrame>;
    }

    if (config.type === "memo") {
      return <DashboardWidgetFrame key={config.id} config={config} title="메모" {...widgetContext}><textarea className="memo-widget-input" value={state.memo} onChange={(event) => updateMemo(event.target.value)} aria-label="대시보드 메모" /></DashboardWidgetFrame>;
    }


    return null;
  }

  return <div className={isEditing ? "dashboard-grid editing" : "dashboard-grid"}>{visibleWidgets.map(renderWidget)}{visibleWidgets.length === 0 ? <section className="dashboard-empty-state card"><span className="pill">빈 대시보드</span><h2>보이는 위젯이 없어요.</h2><p>위젯 관리에서 필요한 위젯을 다시 켜면 나만의 홈 화면을 바로 복구할 수 있습니다.</p><button className="primary-button" onClick={onOpenWidgetManager}><SlidersHorizontal size={16} />위젯 관리 열기</button></section> : null}</div>;
}

function DashboardWidgetFrame({ config, title, action, onAction, variant, isEditing, toggleWidget, changeWidgetSize, moveWidget, children }: { config: WidgetConfig; title?: string; action?: string; onAction?: () => void; variant?: "hero" | "clock"; isEditing: boolean; toggleWidget: (type: DashboardWidgetType, enabled: boolean) => void; changeWidgetSize: (type: DashboardWidgetType, size: DashboardWidgetSize) => void; moveWidget: (type: DashboardWidgetType, direction: "up" | "down") => void; children: React.ReactNode }) {
  const className = ["widget", "card", `widget-${config.size}`, variant === "hero" ? "hero-card" : "", variant === "clock" ? "clock-card" : "", isEditing ? "is-editing" : ""].filter(Boolean).join(" ");
  return <section className={className} data-widget-type={config.type}>{isEditing ? <WidgetEditControls config={config} onToggle={toggleWidget} onSizeChange={changeWidgetSize} onMove={moveWidget} /> : null}{title ? <div className="widget-head"><h3>{title}</h3>{action && onAction ? <button onClick={onAction}>{action}</button> : null}</div> : null}{children}</section>;
}

function WidgetEditControls({ config, onToggle, onSizeChange, onMove }: { config: WidgetConfig; onToggle: (type: DashboardWidgetType, enabled: boolean) => void; onSizeChange: (type: DashboardWidgetType, size: DashboardWidgetSize) => void; onMove: (type: DashboardWidgetType, direction: "up" | "down") => void }) {
  return <div className="widget-edit-panel" aria-label={`${config.title} 위젯 편집`}><div className="widget-edit-row"><button onClick={() => onMove(config.type, "up")} aria-label={`${config.title} 위로 이동`}><ArrowUp size={13} /></button><button onClick={() => onMove(config.type, "down")} aria-label={`${config.title} 아래로 이동`}><ArrowDown size={13} /></button><button onClick={() => onToggle(config.type, false)} aria-label={`${config.title} 숨기기`}><EyeOff size={13} />숨김</button></div><div className="widget-size-switch" aria-label={`${config.title} 크기 선택`}>{(["small", "medium", "wide"] as DashboardWidgetSize[]).map((size) => <button key={size} className={config.size === size ? "active" : ""} onClick={() => onSizeChange(config.type, size)}>{size}</button>)}</div></div>;
}

function WidgetManagerDrawer({ open, widgets, onClose, onToggle, onSizeChange, onMove, onReset }: { open: boolean; widgets: WidgetConfig[]; onClose: () => void; onToggle: (type: DashboardWidgetType, enabled: boolean) => void; onSizeChange: (type: DashboardWidgetType, size: DashboardWidgetSize) => void; onMove: (type: DashboardWidgetType, direction: "up" | "down") => void; onReset: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const orderedWidgets = normalizeWidgetConfigs(widgets);
  const visibleCount = orderedWidgets.filter((widget) => widget.enabled).length;

  return <div className="drawer-backdrop" onClick={onClose}><aside className="widget-manager-drawer" role="dialog" aria-modal="true" aria-labelledby="widget-manager-title" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div className="drawer-title-group"><span className="pill">DIY dashboard</span><h2 id="widget-manager-title">위젯 관리</h2><div className="drawer-meta-row"><span>{visibleCount}개 표시 중</span><span>순서 · 크기 · 숨김</span></div></div><button className="icon-button" onClick={onClose} aria-label="위젯 관리 닫기"><X size={18} /></button></div><div className="widget-manager-intro"><strong>매일 보고 싶은 화면만 남기세요.</strong><p>편집 모드에서는 각 위젯 카드 위에서도 빠르게 순서와 크기를 바꿀 수 있습니다.</p></div><div className="widget-manager-list">{orderedWidgets.map((widget, index) => <article className={widget.enabled ? "widget-manager-item" : "widget-manager-item disabled"} key={widget.type}><div className="widget-manager-main"><button className="visibility-toggle" onClick={() => onToggle(widget.type, !widget.enabled)} aria-label={`${widget.title} ${widget.enabled ? "숨기기" : "보이기"}`}>{widget.enabled ? <Eye size={16} /> : <EyeOff size={16} />}</button><div><strong>{getWidgetTitle(widget.type)}</strong><span>{widget.enabled ? "대시보드에 표시" : "숨김 상태"}</span></div></div><div className="widget-manager-controls"><button onClick={() => onMove(widget.type, "up")} disabled={index === 0} aria-label={`${widget.title} 위로 이동`}><ArrowUp size={14} /></button><button onClick={() => onMove(widget.type, "down")} disabled={index === orderedWidgets.length - 1} aria-label={`${widget.title} 아래로 이동`}><ArrowDown size={14} /></button><div className="widget-size-switch">{(["small", "medium", "wide"] as DashboardWidgetSize[]).map((size) => <button key={size} className={widget.size === size ? "active" : ""} onClick={() => onSizeChange(widget.type, size)}>{size}</button>)}</div></div></article>)}</div><div className="drawer-footer"><button className="soft-button" onClick={onReset}>기본값 복원</button><button className="primary-button" onClick={onClose}>완료</button></div></aside></div>;
}

function TodayView({ todos, quickText, setQuickText, addTodo, toggleTodo, removeTodo }: { todos: Todo[]; quickText: string; setQuickText: (value: string) => void; addTodo: () => void; toggleTodo: (id: string) => void; removeTodo: (id: string) => void }) { return <section className="panel-card card"><div className="form-row"><input value={quickText} onChange={(event) => setQuickText(event.target.value)} placeholder="오늘 할 일 추가" /><button className="primary-button" onClick={() => addTodo()}>추가</button></div><ul className="detail-list">{todos.map((todo) => <li key={todo.id}><button onClick={() => toggleTodo(todo.id)}>{todo.completed ? <CheckCircle2 /> : <Circle />}</button><span className={todo.completed ? "done" : ""}>{todo.title}</span><em>{todo.date}</em><button onClick={() => removeTodo(todo.id)}><Trash2 size={16} /></button></li>)}</ul></section>; }

function ProjectsView({ projects, setSelectedProjectId, setView }: { projects: Project[]; setSelectedProjectId: (id: string) => void; setView: (view: AppView) => void }) { return <div className="project-grid">{projects.map((project) => <button className="project-card card" key={project.id} onClick={() => { setSelectedProjectId(project.id); setView("Kanban"); }}><span className="pill">{project.status}</span><h3>{project.name}</h3><p>{project.dueDate ? `마감 ${project.dueDate}` : "마감 없음"}</p><div className="progress"><i style={{ width: `${project.progress}%` }} /></div></button>)}</div>; }

type KanbanMoveTarget = { column: KanbanColumnName; overCardId?: string };

type KanbanDndData =
  | { type: "column"; column: KanbanColumnName }
  | { type: "card"; cardId: string; column: KanbanColumnName };

function KanbanView({ projects, selectedProjectId, setSelectedProjectId, columns, newCard, setNewCard, addCard, moveCard, removeCard, selectCard }: { projects: Project[]; selectedProjectId: string; setSelectedProjectId: (id: string) => void; columns: ReturnType<typeof getKanbanColumns>; newCard: string; setNewCard: (value: string) => void; addCard: (column?: KanbanColumnName) => void; moveCard: (id: string, target: KanbanMoveTarget) => void; removeCard: (id: string) => void; selectCard: (id: string) => void }) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeCardRect, setActiveCardRect] = useState<{ width: number; height?: number } | undefined>();
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const allCards = columns.flatMap((column) => column.cards);
  const activeCard = activeCardId ? allCards.find((card) => card.id === activeCardId) ?? null : null;
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedProjectName = selectedProject?.name ?? "프로젝트 선택";
  const selectedProjectMeta = selectedProject ? `${selectedProject.status} · ${selectedProject.progress}% 진행${selectedProject.dueDate ? ` · ${selectedProject.dueDate.slice(5)} 마감` : ""}` : "프로젝트를 선택하세요";

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!projectMenuRef.current?.contains(event.target as Node)) {
        setIsProjectMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProjectMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function handleProjectSelect(projectId: string) {
    setSelectedProjectId(projectId);
    setIsProjectMenuOpen(false);
  }

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

  return (
    <section className="kanban-page">
      <div className="kanban-toolbar">
        <div className="project-picker">
          <span>Project</span>
          <div ref={projectMenuRef} className={isProjectMenuOpen ? "project-select-shell is-open" : "project-select-shell"}>
            <button
              type="button"
              className="project-select-trigger"
              aria-haspopup="listbox"
              aria-expanded={isProjectMenuOpen}
              aria-label="칸반 프로젝트 선택"
              onClick={() => setIsProjectMenuOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setIsProjectMenuOpen(true);
                }
              }}
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
          <em>{selectedProjectMeta}</em>
        </div>
        <div className="kanban-add-card">
          <input value={newCard} onChange={(event) => setNewCard(event.target.value)} placeholder="새 칸반 카드" />
          <button className="primary-button" onClick={() => addCard("Backlog")}>Backlog에 추가</button>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragCancel={() => { setActiveCardId(null); setActiveCardRect(undefined); }} onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {columns.map((column) => <KanbanColumn key={column.name} column={column} activeCardId={activeCardId} removeCard={removeCard} selectCard={selectCard} />)}
        </div>
        <DragOverlay>
          {activeCard ? <article className="kanban-card kanban-card-overlay" style={getKanbanDragOverlayStyle(activeCardRect)}><KanbanCardBody card={activeCard} /></article> : null}
        </DragOverlay>
      </DndContext>
      <p className="kanban-hint">dnd-kit 기반 드래그로 컬럼과 카드 사이를 이동합니다. 같은 컬럼 안에서는 카드 위로 드롭해 순서를 바꿀 수 있습니다.</p>
    </section>
  );
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
            <label>Labels<input value={labelsText} onChange={(event) => onUpdate(card.id, { labels: parseKanbanLabelsInput(event.target.value) })} placeholder="UX, Integration" /></label>
            <div className="label-preview" aria-label="현재 라벨">{labels.map((label) => <span key={label}>{label}</span>)}</div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function CalendarEventDetailDrawer({ event, onClose, onUpdate, onDelete }: { event: CalendarEvent | null; onClose: () => void; onUpdate: (id: string, changes: Partial<CalendarEvent>) => void; onDelete: (id: string) => void }) {
  useEffect(() => {
    if (!event) return;
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [event, onClose]);

  if (!event) return null;

  const eventDate = event.startAt.slice(0, 10);
  const startTime = event.startAt.slice(11, 16);
  const endTime = event.endAt?.slice(11, 16) ?? "";

  function updateStartAt(date: string, time: string) {
    const safeDate = date || todayKey;
    const safeTime = time || "00:00";
    onUpdate(event!.id, {
      startAt: `${safeDate}T${safeTime}:00`,
      endAt: event!.endAt ? `${safeDate}T${endTime || safeTime}:00` : undefined,
    });
  }

  function updateEndTime(time: string) {
    onUpdate(event!.id, { endAt: time ? `${eventDate}T${time}:00` : undefined });
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="event-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="event-detail-title" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-title-group">
            <span className="pill">일정 상세</span>
            <h2 id="event-detail-title">{event.title || "제목 없는 일정"}</h2>
            <div className="drawer-meta-row">
              <span>{eventDate}</span>
              <span>{startTime}{endTime ? `–${endTime}` : ""}</span>
              <span>local sync</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="일정 상세 닫기"><X size={18} /></button>
        </div>
        <div className="event-detail-layout">
          <section className="event-detail-main">
            <div className="event-detail-editor-card">
              <label>제목<input value={event.title} onChange={(inputEvent) => onUpdate(event.id, { title: inputEvent.target.value })} placeholder="일정 제목" /></label>
              <div className="event-detail-field-grid">
                <label>날짜<input type="date" value={eventDate} onChange={(inputEvent) => updateStartAt(inputEvent.target.value, startTime)} /></label>
                <label>시작 시간<input type="time" value={startTime} onChange={(inputEvent) => updateStartAt(eventDate, inputEvent.target.value)} /></label>
                <label>종료 시간<input type="time" value={endTime} onChange={(inputEvent) => updateEndTime(inputEvent.target.value)} /></label>
              </div>
            </div>
            <div className="activity-box">
              <strong>Activity</strong>
              <div className="activity-timeline">
                <span><i />일정 변경은 즉시 로컬 저장에 반영됩니다.</span>
                <span><i />날짜나 시간을 바꾸면 캘린더 위치도 함께 이동합니다.</span>
              </div>
            </div>
          </section>
          <section className="detail-side" aria-label="일정 속성">
            <div className="field-card status-card"><span>Calendar</span><strong>자체 일정</strong><em>Google Calendar 연동 없이 이 대시보드에서 관리됩니다.</em></div>
            <button className="event-delete-action" onClick={() => onDelete(event.id)}><Trash2 size={15} />일정 삭제</button>
          </section>
        </div>
      </aside>
    </div>
  );
}


function CalendarView({ events, newEvent, setNewEvent, addEvent, removeEvent, selectEvent, mode, setMode }: { events: CalendarEvent[]; newEvent: string; setNewEvent: (value: string) => void; addEvent: () => void; removeEvent: (id: string) => void; selectEvent: (id: string) => void; mode: CalendarMode; setMode: (mode: CalendarMode) => void }) {
  const days = getCalendarDays(mode, todayKey);
  const eventsByDay = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const key = event.startAt.slice(0, 10);
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  });

  return (
    <section className="panel-card card calendar-page">
      <div className="calendar-toolbar">
        <div>
          <h2>{mode === "week" ? "주간 캘린더" : "월간 캘린더"}</h2>
          <p>일정은 자체 캘린더에서 관리합니다. Google Calendar 연동은 제외했습니다.</p>
        </div>
        <div className="segmented">
          <button className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}>주간</button>
          <button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>월간</button>
        </div>
      </div>
      <div className="form-row">
        <input value={newEvent} onChange={(event) => setNewEvent(event.target.value)} placeholder="새 일정 제목" />
        <button className="primary-button" onClick={addEvent}>일정 추가</button>
      </div>
      <div className={mode === "week" ? "calendar-board week" : "calendar-board month"}>
        {days.map((day) => (
          <div className={!day.inCurrentMonth ? "calendar-day muted" : day.isToday ? "calendar-day today" : "calendar-day"} key={day.dateKey}>
            <div className="calendar-day-head"><strong>{day.dayNumber}</strong><span>{day.dateKey.slice(5)}</span></div>
            <div className="calendar-events">
              {(eventsByDay.get(day.dateKey) ?? []).map((event) => (
                <article
                  className="calendar-event"
                  key={event.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${event.startAt.slice(11, 16)} ${event.title} 일정 상세 열기`}
                  onClick={() => selectEvent(event.id)}
                  onKeyDown={(keyboardEvent) => {
                    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                      keyboardEvent.preventDefault();
                      selectEvent(event.id);
                    }
                  }}
                >
                  <span>{event.startAt.slice(11, 16)}</span>
                  <strong>{event.title}</strong>
                  <button
                    className="calendar-event-delete"
                    onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      removeEvent(event.id);
                    }}
                    aria-label={`${event.title} 일정 삭제`}
                    title="일정 삭제"
                  >
                    <X size={13} />
                  </button>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BookmarksView({ bookmarks, newBookmark, setNewBookmark, addBookmark, removeBookmark }: { bookmarks: BookmarkItem[]; newBookmark: string; setNewBookmark: (value: string) => void; addBookmark: () => void; removeBookmark: (id: string) => void }) { return <section className="panel-card card"><div className="form-row"><input value={newBookmark} onChange={(event) => setNewBookmark(event.target.value)} placeholder="제목 | https://url.com" /><button className="primary-button" onClick={addBookmark}>북마크 추가</button></div><div className="bookmark-table">{bookmarks.map((bookmark) => <a key={bookmark.id} href={bookmark.url} target="_blank"><strong>{bookmark.title}</strong><span>{bookmark.category}</span><button onClick={(event) => { event.preventDefault(); removeBookmark(bookmark.id); }}><Trash2 size={15} /></button></a>)}</div></section>; }

function SettingsView({ theme, setTheme, account }: { theme: "light" | "dark"; setTheme: (theme: "light" | "dark") => void; account: DashboardAccount }) {
  return (
    <section className="panel-card card">
      <h2>설정</h2>
      <p>로그인하면 Supabase Auth와 사용자별 RLS가 적용된 클라우드 저장으로 여러 기기에서 같은 대시보드를 사용합니다.</p>
      <div className="settings-grid">
        <button className="settings-theme-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          <span>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</span>
          <strong>{theme === "light" ? "다크모드로 전환" : "라이트모드로 전환"}</strong>
          <em>테마 변경은 Settings에서만 관리합니다.</em>
        </button>
        <div className="settings-account-card">
          <span className="pill">Account sync</span>
          <strong>{account.user?.email ?? "로그인되지 않음"}</strong>
          <p>{account.syncMessage}</p>
          {account.user ? (
            <button className="soft-button" disabled={account.authPending} onClick={() => void account.signOut()}>로그아웃</button>
          ) : account.clientReady ? (
            <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void account.signIn(); }}>
              <input type="email" value={account.authEmail} onChange={(event) => account.setAuthEmail(event.target.value)} placeholder="you@example.com" aria-label="로그인 이메일" />
              <button className="primary-button" disabled={account.authPending}>{account.authPending ? "전송 중" : "매직링크 받기"}</button>
            </form>
          ) : (
            <div className="env-warning">Vercel 또는 .env.local에 Supabase URL과 publishable key를 추가하세요.</div>
          )}
          {account.authNotice ? <em className="auth-notice">{account.authNotice}</em> : null}
          {account.authError ? <em className="auth-error">{account.authError}</em> : null}
        </div>
        <code>NEXT_PUBLIC_SUPABASE_URL</code>
        <code>{account.configKeyName}</code>
        <code>Storage: local fallback + dashboard_states JSONB sync</code>
      </div>
    </section>
  );
}

function CalendarMini({ events, large = false }: { events: CalendarEvent[]; large?: boolean }) { const eventDays = new Set(events.map((event) => Number(event.startAt.slice(8, 10)))); return <div className={large ? "calendar-mini large" : "calendar-mini"}>{[9, 10, 11, 12, 13, 14, 15].map((day) => <span key={day} className={eventDays.has(day) ? "event-day" : day === 13 ? "today-day" : ""}>{day}</span>)}</div>; }
