"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Eye,
  EyeOff,
  LayoutDashboard,
  ListChecks,
  Moon,
  PanelLeft,
  Pause,
  Play,
  Plus,
  Search,
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
  type MusicSettings,
} from "@/lib/dashboard-state";
import { createSupabaseBrowserClient, getSupabaseBrowserConfigStatus } from "@/lib/supabase";
import {
  describeYouTubePlayerError,
  getYouTubeMusicResourceLabel,
  getYouTubePlayerEmbedUrl,
  getYouTubeThumbnailUrl,
  needsPlaylistFirstTrackUrl,
  parseYouTubeMusicResource,
  type YouTubeMusicResource,
  type YouTubePlayerError,
} from "@/lib/youtube-music";

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

type MusicPlaybackStatus = "idle" | "loading" | "ready" | "playing" | "paused" | "buffering" | "ended" | "error";

type YouTubePlayerInstance = {
  playVideo?: () => void;
  pauseVideo?: () => void;
  nextVideo?: () => void;
  previousVideo?: () => void;
  destroy?: () => void;
};

type YouTubeIframeApi = {
  Player: new (
    element: string | HTMLIFrameElement,
    options: {
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayerInstance;
};

declare global {
  interface Window {
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeIframeApiPromise: Promise<YouTubeIframeApi | null> | null = null;

function loadYouTubeIframeApi() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;

    function finish(api: YouTubeIframeApi | null) {
      window.clearTimeout(timeout);
      if (window.onYouTubeIframeAPIReady === handleReady) {
        window.onYouTubeIframeAPIReady = previousReady;
      }
      if (!api?.Player) youtubeIframeApiPromise = null;
      resolve(api?.Player ? api : null);
    }

    function handleReady() {
      previousReady?.();
      finish(window.YT ?? null);
    }

    const timeout = window.setTimeout(() => finish(window.YT?.Player ? window.YT : null), 8000);
    window.onYouTubeIframeAPIReady = handleReady;

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        script.remove();
        finish(null);
      };
      document.head.appendChild(script);
    }
  });

  return youtubeIframeApiPromise;
}

function getTopPlayerSubtitle(music: MusicSettings, resource: YouTubeMusicResource | null, status: MusicPlaybackStatus, error: YouTubePlayerError | null) {
  if (error) return error.title;
  if (!resource) return music.subtitle;
  if (needsPlaylistFirstTrackUrl(resource)) return "playlist-only · 첫 곡 URL 권장";
  if (status === "loading") return "플레이어 연결 중";
  if (status === "buffering") return "버퍼링 중";
  if (status === "playing") return "재생 중 · YouTube embed";
  if (status === "paused") return "일시정지됨 · YouTube embed";
  return getYouTubeMusicResourceLabel(resource);
}

function getMusicPlaybackStatusFromYouTubeState(state: number): MusicPlaybackStatus {
  if (state === 1) return "playing";
  if (state === 2) return "paused";
  if (state === 3) return "buffering";
  if (state === 0) return "ended";
  if (state === 5) return "ready";
  return "ready";
}

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
  const [musicPlaybackStatus, setMusicPlaybackStatus] = useState<MusicPlaybackStatus>("idle");
  const [musicPlayerError, setMusicPlayerError] = useState<YouTubePlayerError | null>(null);
  const musicPlayerRef = useRef<YouTubePlayerInstance | null>(null);
  const pendingMusicCommandRef = useRef<"play" | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");
  const [isDashboardEditing, setIsDashboardEditing] = useState(false);
  const [isWidgetManagerOpen, setIsWidgetManagerOpen] = useState(false);
  const [isMusicSettingsOpen, setIsMusicSettingsOpen] = useState(false);

  const selectedProject = state.projects.find((project) => project.id === selectedProjectId) ?? state.projects[0] ?? initialState.projects[0];
  const selectedCard = state.cards.find((card) => card.id === selectedCardId) ?? null;
  const summary = useMemo(() => calculateDashboardSummary(state, todayKey), [state]);
  const columns = useMemo(() => getKanbanColumns(state.cards, selectedProject.id), [state.cards, selectedProject.id]);
  const pinnedBookmarks = useMemo(() => getPinnedBookmarks(state.bookmarks, 6), [state.bookmarks]);
  const widgets = useMemo(() => normalizeWidgetConfigs(state.widgets), [state.widgets]);
  const musicResource = useMemo(() => parseYouTubeMusicResource(state.music.sourceUrl), [state.music.sourceUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      musicPlayerRef.current = null;
      pendingMusicCommandRef.current = null;
      setMusicPlayerError(null);
      setMusicPlaybackStatus(musicResource ? "loading" : "idle");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [musicResource]);

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

  function updateMusic(changes: Partial<MusicSettings>) {
    setState((current) => ({ ...current, music: { ...current.music, ...changes } }));
  }

  const handleMusicPlayerReady = useCallback((player: YouTubePlayerInstance) => {
    musicPlayerRef.current = player;
    setMusicPlayerError(null);
    setMusicPlaybackStatus((current) => (current === "playing" ? current : "ready"));

    if (pendingMusicCommandRef.current === "play") {
      pendingMusicCommandRef.current = null;
      player.playVideo?.();
    }
  }, []);

  const handleMusicPlayerDispose = useCallback((player: YouTubePlayerInstance) => {
    if (musicPlayerRef.current === player) {
      musicPlayerRef.current = null;
      setMusicPlaybackStatus(musicResource ? "loading" : "idle");
    }
  }, [musicResource]);

  const handleMusicPlaybackStatusChange = useCallback((status: MusicPlaybackStatus) => {
    setMusicPlaybackStatus(status);
    if (status !== "error") setMusicPlayerError(null);
  }, []);

  const handleMusicPlayerError = useCallback((error: YouTubePlayerError) => {
    pendingMusicCommandRef.current = null;
    setMusicPlayerError(error);
    setMusicPlaybackStatus("error");
  }, []);

  const toggleMusicPlayback = useCallback(() => {
    if (!musicResource) {
      setIsMusicSettingsOpen(true);
      return;
    }

    const player = musicPlayerRef.current;
    const shouldPause = musicPlaybackStatus === "playing" || musicPlaybackStatus === "buffering";

    if (!player) {
      pendingMusicCommandRef.current = shouldPause ? null : "play";
      setMusicPlaybackStatus("loading");
      setView("Home");
      return;
    }

    if (shouldPause) {
      player.pauseVideo?.();
      return;
    }

    setMusicPlayerError(null);
    player.playVideo?.();
  }, [musicPlaybackStatus, musicResource]);

  const skipMusicTrack = useCallback((direction: "previous" | "next") => {
    const player = musicPlayerRef.current;
    if (!player) {
      setView("Home");
      setMusicPlaybackStatus(musicResource ? "loading" : "idle");
      return;
    }
    if (direction === "previous") player.previousVideo?.();
    if (direction === "next") player.nextVideo?.();
  }, [musicResource]);

  function removeItem(kind: "todos" | "events" | "bookmarks" | "cards", id: string) {
    setState((current) => ({
      ...current,
      [kind]: current[kind].filter((item) => item.id !== id),
    }));
    if (kind === "cards" && selectedCardId === id) setSelectedCardId(null);
  }

  return (
    <main className={theme === "dark" ? "app-frame dark-mode" : "app-frame"}>
      <TopMusicPlayer music={state.music} resource={musicResource} playbackStatus={musicPlaybackStatus} playbackError={musicPlayerError} onOpenSettings={() => setIsMusicSettingsOpen(true)} onTogglePlayback={toggleMusicPlayback} onPreviousTrack={() => skipMusicTrack("previous")} onNextTrack={() => skipMusicTrack("next")} />
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
          {view === "Home" && <HomeDashboard state={state} summary={summary} pinnedBookmarks={pinnedBookmarks} widgets={widgets} isEditing={isDashboardEditing} musicResource={musicResource} onPlayerReady={handleMusicPlayerReady} onPlayerDispose={handleMusicPlayerDispose} onPlaybackStatusChange={handleMusicPlaybackStatusChange} onPlayerError={handleMusicPlayerError} setView={setView} toggleTodo={toggleTodo} toggleWidget={toggleWidget} changeWidgetSize={changeWidgetSize} moveWidget={moveWidget} updateMemo={updateMemo} updateMusic={updateMusic} onOpenWidgetManager={() => setIsWidgetManagerOpen(true)} />}
          {view === "Today" && <TodayView todos={state.todos} quickText={quickText} setQuickText={setQuickText} addTodo={addTodo} toggleTodo={toggleTodo} removeTodo={(id) => removeItem("todos", id)} />}
          {view === "Projects" && <ProjectsView projects={state.projects} setSelectedProjectId={setSelectedProjectId} setView={setView} />}
          {view === "Kanban" && <KanbanView projects={state.projects} selectedProjectId={selectedProject.id} setSelectedProjectId={setSelectedProjectId} columns={columns} newCard={newCard} setNewCard={setNewCard} addCard={addCard} moveCard={moveCard} removeCard={(id) => removeItem("cards", id)} selectCard={setSelectedCardId} />}
          {view === "Calendar" && <CalendarView events={state.events} newEvent={newEvent} setNewEvent={setNewEvent} addEvent={addEvent} removeEvent={(id) => removeItem("events", id)} mode={calendarMode} setMode={setCalendarMode} />}
          {view === "Bookmarks" && <BookmarksView bookmarks={state.bookmarks} newBookmark={newBookmark} setNewBookmark={setNewBookmark} addBookmark={addBookmark} removeBookmark={(id) => removeItem("bookmarks", id)} />}
          {view === "Settings" && <SettingsView theme={theme} setTheme={setTheme} account={account} />}
        </section>
      </div>
      <KanbanDetailDrawer card={selectedCard} project={selectedCard ? state.projects.find((project) => project.id === selectedCard.projectId) : undefined} onClose={() => setSelectedCardId(null)} onUpdate={updateCard} />
      <WidgetManagerDrawer open={isWidgetManagerOpen} widgets={widgets} onClose={() => setIsWidgetManagerOpen(false)} onToggle={toggleWidget} onSizeChange={changeWidgetSize} onMove={moveWidget} onReset={resetWidgets} />
      <MusicSettingsDrawer open={isMusicSettingsOpen} music={state.music} resource={musicResource} onClose={() => setIsMusicSettingsOpen(false)} onChange={updateMusic} onPlayerReady={handleMusicPlayerReady} onPlayerDispose={handleMusicPlayerDispose} onPlaybackStatusChange={handleMusicPlaybackStatusChange} onPlayerError={handleMusicPlayerError} />
    </main>
  );
}

function TopMusicPlayer({ music, resource, playbackStatus, playbackError, onOpenSettings, onTogglePlayback, onPreviousTrack, onNextTrack }: { music: MusicSettings; resource: YouTubeMusicResource | null; playbackStatus: MusicPlaybackStatus; playbackError: YouTubePlayerError | null; onOpenSettings: () => void; onTogglePlayback: () => void; onPreviousTrack: () => void; onNextTrack: () => void }) {
  const isPlaying = playbackStatus === "playing" || playbackStatus === "buffering";
  const canSkip = Boolean(resource);
  const playButtonLabel = !resource ? "음악 링크 설정" : isPlaying ? "플레이어 일시정지" : playbackStatus === "loading" ? "플레이어 연결 후 재생" : playbackStatus === "error" ? "플레이어 다시 재생 시도" : "플레이어 재생";

  return (
    <header className="top-music-bar">
      <div className="page-context"><span className={resource ? "status-dot" : "status-dot muted"} /> Home · 작업 대시보드</div>
      <div className={isPlaying && resource ? "music-player playing" : "music-player"}>
        <AlbumCover resource={resource} />
        <div className="track-copy"><strong>{music.title}</strong><span>{getTopPlayerSubtitle(music, resource, playbackStatus, playbackError)}</span></div>
        <div className="live-waveform" aria-hidden="true">{Array.from({ length: 24 }).map((_, index) => <i key={index} />)}</div>
        <div className="music-controls">
          <button className="music-control-button settings" aria-label="상단 음악 설정" onClick={onOpenSettings}><SlidersHorizontal size={15} /></button>
          <button className="music-control-button secondary" aria-label="이전 트랙" onClick={onPreviousTrack} disabled={!canSkip}><ChevronLeft size={16} /></button>
          <button className={isPlaying ? "music-control-button play-toggle playing" : "music-control-button play-toggle"} aria-label={playButtonLabel} onClick={onTogglePlayback}>{isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
          <button className="music-control-button secondary" aria-label="다음 트랙" onClick={onNextTrack} disabled={!canSkip}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="top-actions"><button className="soft-button"><Search size={16} />검색</button><button className="icon-button"><Settings size={17} /></button></div>
    </header>
  );
}

function AlbumCover({ resource, small = false }: { resource: YouTubeMusicResource | null; small?: boolean }) {
  const thumbnailUrl = resource ? getYouTubeThumbnailUrl(resource) : undefined;
  const className = ["album-cover", small ? "small" : "", thumbnailUrl ? "has-image" : ""].filter(Boolean).join(" ");
  const style = thumbnailUrl ? ({ "--cover-image": `url(${thumbnailUrl})` } as React.CSSProperties) : undefined;

  return <div className={className} style={style} aria-label={thumbnailUrl ? "YouTube 영상 썸네일 커버" : "앨범 커버"} />;
}

function MusicSettingsDrawer({ open, music, resource, onClose, onChange, onPlayerReady, onPlayerDispose, onPlaybackStatusChange, onPlayerError }: { open: boolean; music: MusicSettings; resource: YouTubeMusicResource | null; onClose: () => void; onChange: (changes: Partial<MusicSettings>) => void; onPlayerReady: (player: YouTubePlayerInstance) => void; onPlayerDispose: (player: YouTubePlayerInstance) => void; onPlaybackStatusChange: (status: MusicPlaybackStatus) => void; onPlayerError: (error: YouTubePlayerError) => void }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="music-settings-drawer" role="dialog" aria-modal="true" aria-labelledby="music-settings-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-title-group">
            <span className="pill">Top music player</span>
            <h2 id="music-settings-title">상단 음악 설정</h2>
            <div className="drawer-meta-row">
              <span>{resource ? getYouTubeMusicResourceLabel(resource) : "URL 미연결"}</span>
              <span>localStorage · Supabase sync</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="상단 음악 설정 닫기"><X size={18} /></button>
        </div>
        <div className="music-settings-intro">
          <strong>상단 플레이어에 표시할 YouTube Music 링크를 연결하세요.</strong>
          <p>공식 YouTube Music 재생 API 대신 YouTube iframe embed를 사용합니다. playlist, watch, youtu.be 링크를 붙여 넣을 수 있습니다.</p>
        </div>
        <MusicWidget music={music} resource={resource} onChange={onChange} onPlayerReady={onPlayerReady} onPlayerDispose={onPlayerDispose} onPlaybackStatusChange={onPlaybackStatusChange} onPlayerError={onPlayerError} />
      </aside>
    </div>
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
      <div><span className="pill">JUNE 13 · SATURDAY</span><h1>{isHome ? "오늘의 작업실" : view}</h1><p>정돈된 생산성 홈에서 할 일, 프로젝트, 일정, 북마크와 음악을 함께 관리합니다.</p></div>
      <div className="page-header-actions">
        <div className="quick-add"><input value={quickText} onChange={(event) => setQuickText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTodo(); }} placeholder="할 일을 빠르게 추가" /><button className="primary-button" onClick={addTodo}><Plus size={16} />추가</button></div>
        {isHome ? <div className="dashboard-edit-actions"><button className="soft-button" onClick={onOpenWidgetManager}><SlidersHorizontal size={16} />위젯 관리</button><button className={isDashboardEditing ? "soft-button active" : "soft-button"} onClick={() => setIsDashboardEditing(!isDashboardEditing)}>{isDashboardEditing ? "편집 완료" : "편집 모드"}</button></div> : null}
      </div>
    </div>
  );
}

function HomeDashboard({ state, summary, pinnedBookmarks, widgets, isEditing, musicResource, onPlayerReady, onPlayerDispose, onPlaybackStatusChange, onPlayerError, setView, toggleTodo, toggleWidget, changeWidgetSize, moveWidget, updateMemo, updateMusic, onOpenWidgetManager }: { state: DashboardState; summary: ReturnType<typeof calculateDashboardSummary>; pinnedBookmarks: BookmarkItem[]; widgets: WidgetConfig[]; isEditing: boolean; musicResource: YouTubeMusicResource | null; onPlayerReady: (player: YouTubePlayerInstance) => void; onPlayerDispose: (player: YouTubePlayerInstance) => void; onPlaybackStatusChange: (status: MusicPlaybackStatus) => void; onPlayerError: (error: YouTubePlayerError) => void; setView: (view: AppView) => void; toggleTodo: (id: string) => void; toggleWidget: (type: DashboardWidgetType, enabled: boolean) => void; changeWidgetSize: (type: DashboardWidgetType, size: DashboardWidgetSize) => void; moveWidget: (type: DashboardWidgetType, direction: "up" | "down") => void; updateMemo: (memo: string) => void; updateMusic: (changes: Partial<MusicSettings>) => void; onOpenWidgetManager: () => void }) {
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

    if (config.type === "music") {
      return <DashboardWidgetFrame key={config.id} config={config} title="음악 플레이리스트" {...widgetContext}><MusicWidget music={state.music} resource={musicResource} onChange={updateMusic} onPlayerReady={onPlayerReady} onPlayerDispose={onPlayerDispose} onPlaybackStatusChange={onPlaybackStatusChange} onPlayerError={onPlayerError} /></DashboardWidgetFrame>;
    }

    return null;
  }

  return <div className={isEditing ? "dashboard-grid editing" : "dashboard-grid"}>{visibleWidgets.map(renderWidget)}{visibleWidgets.length === 0 ? <section className="dashboard-empty-state card"><span className="pill">빈 대시보드</span><h2>보이는 위젯이 없어요.</h2><p>위젯 관리에서 필요한 위젯을 다시 켜면 나만의 홈 화면을 바로 복구할 수 있습니다.</p><button className="primary-button" onClick={onOpenWidgetManager}><SlidersHorizontal size={16} />위젯 관리 열기</button></section> : null}</div>;
}

function MusicWidget({ music, resource, onChange, onPlayerReady, onPlayerDispose, onPlaybackStatusChange, onPlayerError }: { music: MusicSettings; resource: YouTubeMusicResource | null; onChange: (changes: Partial<MusicSettings>) => void; onPlayerReady: (player: YouTubePlayerInstance) => void; onPlayerDispose: (player: YouTubePlayerInstance) => void; onPlaybackStatusChange: (status: MusicPlaybackStatus) => void; onPlayerError: (error: YouTubePlayerError) => void }) {
  const draftUrlRef = useRef<HTMLInputElement | null>(null);
  const isPlaylistOnly = resource ? needsPlaylistFirstTrackUrl(resource) : false;

  function applyMusicUrl() {
    onChange({ sourceUrl: draftUrlRef.current?.value ?? music.sourceUrl });
  }

  return (
    <div className="music-integration">
      <div className={resource ? "music-widget-card connected" : "music-widget-card"}>
        <AlbumCover resource={resource} small />
        <div>
          <strong>{music.title}</strong>
          <span>{resource ? getYouTubeMusicResourceLabel(resource) : "YouTube Music 또는 YouTube 링크 대기 중"}</span>
        </div>
      </div>
      <div className="music-settings-grid">
        <label>표시 이름<input value={music.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="warm desk session" /></label>
        <label>설명<input value={music.subtitle} onChange={(event) => onChange({ subtitle: event.target.value })} placeholder="autumn focus · playlist" /></label>
      </div>
      <form className="music-url-form" onSubmit={(event) => { event.preventDefault(); applyMusicUrl(); }}>
        <label className="music-url-field">YouTube Music / YouTube URL<input key={music.sourceUrl} ref={draftUrlRef} defaultValue={music.sourceUrl} onBlur={applyMusicUrl} placeholder="https://music.youtube.com/watch?v=...&list=..." /></label>
        <button className="soft-button" type="submit">연결</button>
      </form>
      {resource ? (
        <>
          {isPlaylistOnly ? <PlaylistOnlyGuidance /> : null}
          <YouTubeEmbedPlayer music={music} resource={resource} onPlayerReady={onPlayerReady} onPlayerDispose={onPlayerDispose} onPlaybackStatusChange={onPlaybackStatusChange} onPlayerError={onPlayerError} />
          <a className="music-open-link" href={resource.sourceUrl} target="_blank" rel="noreferrer">YouTube Music에서 열기</a>
        </>
      ) : (
        <div className="music-empty-state"><strong>플레이리스트를 연결하세요.</strong><span>YouTube Music playlist, YouTube playlist, watch, youtu.be 링크를 붙여 넣으면 iframe 플레이어로 재생할 수 있습니다. 가능하면 곡을 클릭한 뒤 watch?v=...가 포함된 URL을 넣어주세요.</span></div>
      )}
    </div>
  );
}

function PlaylistOnlyGuidance() {
  return (
    <div className="music-guidance-state" role="note">
      <span><AlertTriangle size={16} /></span>
      <div>
        <strong>playlist-only URL은 첫 곡을 못 찾을 수 있어요.</strong>
        <p>YouTube Music에서 재생목록 안의 곡 하나를 클릭한 뒤 <code>watch?v=...&amp;list=...</code> 형태의 URL을 붙여 넣으면 커버와 iframe 재생 안정성이 좋아집니다.</p>
      </div>
    </div>
  );
}

function YouTubeEmbedPlayer({ music, resource, onPlayerReady, onPlayerDispose, onPlaybackStatusChange, onPlayerError }: { music: MusicSettings; resource: YouTubeMusicResource; onPlayerReady: (player: YouTubePlayerInstance) => void; onPlayerDispose: (player: YouTubePlayerInstance) => void; onPlaybackStatusChange: (status: MusicPlaybackStatus) => void; onPlayerError: (error: YouTubePlayerError) => void }) {
  const reactId = useId().replace(/:/g, "");
  const iframeId = `youtube-player-${reactId}`;
  const [embedOrigin, setEmbedOrigin] = useState<string | undefined>();
  const [playerError, setPlayerError] = useState<YouTubePlayerError | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const playerSrc = useMemo(() => getYouTubePlayerEmbedUrl(resource, embedOrigin), [embedOrigin, resource]);

  useEffect(() => {
    const timer = window.setTimeout(() => setEmbedOrigin(window.location.origin), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => {
    const player = playerRef.current;
    if (player) {
      onPlayerDispose(player);
      player.destroy?.();
    }
    playerRef.current = null;
  }, [onPlayerDispose, playerSrc]);

  function handleIframeLoad() {
    const iframe = iframeRef.current;
    if (!iframe) return;

    setPlayerError(null);
    onPlaybackStatusChange("loading");
    loadYouTubeIframeApi().then((api) => {
      if (!api?.Player || iframeRef.current !== iframe || !iframe.isConnected) return;
      let player: YouTubePlayerInstance | null = null;
      player = new api.Player(iframe, {
        events: {
          onReady: () => {
            if (!player) return;
            playerRef.current = player;
            onPlayerReady(player);
            onPlaybackStatusChange("ready");
          },
          onStateChange: (event) => onPlaybackStatusChange(getMusicPlaybackStatusFromYouTubeState(event.data)),
          onError: (event) => {
            const error = describeYouTubePlayerError(event.data);
            setPlayerError(error);
            onPlayerError(error);
          },
        },
      });
    });
  }

  return (
    <div className={playerError ? "youtube-embed-shell has-error" : "youtube-embed-shell"}>
      <iframe id={iframeId} key={playerSrc} ref={iframeRef} src={playerSrc} title={`${music.title} YouTube player`} loading="lazy" onLoad={handleIframeLoad} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      {playerError ? (
        <div className="youtube-error-overlay" role="alert">
          <span><AlertTriangle size={17} /></span>
          <div>
            <strong>{playerError.title}</strong>
            <p>{playerError.description}</p>
            <em>오류 코드 {playerError.code}</em>
          </div>
        </div>
      ) : null}
    </div>
  );
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
        <code>YouTube Music: URL 기반 YouTube embed 연동</code>
        <code>Storage: local fallback + dashboard_states JSONB sync</code>
      </div>
    </section>
  );
}

function CalendarMini({ events, large = false }: { events: CalendarEvent[]; large?: boolean }) { const eventDays = new Set(events.map((event) => Number(event.startAt.slice(8, 10)))); return <div className={large ? "calendar-mini large" : "calendar-mini"}>{[9, 10, 11, 12, 13, 14, 15].map((day) => <span key={day} className={eventDays.has(day) ? "event-day" : day === 13 ? "today-day" : ""}>{day}</span>)}</div>; }
