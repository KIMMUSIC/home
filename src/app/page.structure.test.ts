import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard page structure", () => {
  const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  const stylesSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  it("does not render a separate drag handle for kanban cards", () => {
    expect(pageSource).not.toContain("kanban-card-drag-handle");
    expect(pageSource).not.toContain("GripVertical");
    expect(stylesSource).not.toContain("kanban-card-drag-handle");
  });

  it("keeps theme controls scoped to Settings", () => {
    const themeToggleCalls = pageSource.match(/setTheme\(theme === \"light\" \? \"dark\" : \"light\"\)/g) ?? [];

    expect(themeToggleCalls).toHaveLength(1);
    expect(pageSource).not.toContain("<PageHeader view={view} theme");
    expect(pageSource).toContain("settings-theme-button");
  });

  it("uses a polished custom kanban project picker", () => {
    expect(pageSource).toContain("kanban-toolbar");
    expect(pageSource).not.toContain("kanban-toolbar card");
    expect(pageSource).toContain("project-picker");
    expect(pageSource).toContain("project-select-shell");
    expect(pageSource).toContain("project-select-trigger");
    expect(pageSource).toContain("project-select-menu");
    expect(pageSource).not.toContain("project-picker-summary");
    expect(pageSource).not.toContain("<select value={selectedProjectId}");
    expect(pageSource).toContain("ChevronDown");
    expect(stylesSource).toContain(".project-select-trigger");
    expect(stylesSource).toContain(".project-select-menu");
    expect(stylesSource).toContain("grid-column: 3");
    expect(stylesSource).toContain("white-space: nowrap");
  });

  it("renders dashboard edit mode and widget management controls", () => {
    expect(pageSource).toContain("isDashboardEditing");
    expect(pageSource).toContain("dashboard-edit-actions");
    expect(pageSource).toContain("WidgetManagerDrawer");
    expect(pageSource).toContain("widget-manager-drawer");
    expect(pageSource).toContain("widget-edit-panel");
    expect(pageSource).toContain("dashboard-empty-state");
    expect(pageSource).toContain("memo-widget-input");
    expect(stylesSource).toContain(".widget-size-switch");
    expect(stylesSource).toContain(".widget-manager-item");
    expect(stylesSource).toContain(".widget-wide");
  });

  it("renders account sync controls with local fallback copy", () => {
    expect(pageSource).toContain("SyncCard");
    expect(pageSource).toContain("Account sync");
    expect(pageSource).toContain("settings-account-card");
    expect(pageSource).toContain("dashboard_states JSONB sync");
    expect(stylesSource).toContain(".settings-account-card");
    expect(stylesSource).toContain(".sync-card-action");
  });

  it("renders YouTube Music URL embed integration controls", () => {
    expect(pageSource).toContain("MusicWidget");
    expect(pageSource).toContain("MusicSettingsDrawer");
    expect(pageSource).toContain("상단 음악 설정");
    expect(pageSource).toContain("parseYouTubeMusicResource");
    expect(pageSource).toContain("youtube-embed-shell");
    expect(pageSource).toContain("YouTube Music에서 열기");
    expect(pageSource).toContain("YouTube Music: URL 기반 YouTube embed 연동");
    expect(pageSource).toContain("AlbumCover");
    expect(pageSource).toContain("getYouTubeThumbnailUrl");
    expect(pageSource).toContain("PlaylistOnlyGuidance");
    expect(pageSource).toContain("YouTubeEmbedPlayer");
    expect(pageSource).toContain("loadYouTubeIframeApi");
    expect(pageSource).toContain("playVideo?.()");
    expect(pageSource).toContain("pauseVideo?.()");
    expect(pageSource).toContain("onStateChange");
    expect(pageSource).toContain("getMusicPlaybackStatusFromYouTubeState");
    expect(pageSource).toContain("describeYouTubePlayerError");
    expect(pageSource).toContain("playlist-only URL은 첫 곡을 못 찾을 수 있어요.");
    expect(pageSource).toContain("music-control-button play-toggle");
    expect(stylesSource).toContain(".music-settings-drawer");
    expect(stylesSource).toContain(".music-integration");
    expect(stylesSource).toContain(".youtube-embed-shell");
    expect(stylesSource).toContain(".music-guidance-state");
    expect(stylesSource).toContain(".youtube-error-overlay");
    expect(stylesSource).toContain(".music-control-button");
  });
});
