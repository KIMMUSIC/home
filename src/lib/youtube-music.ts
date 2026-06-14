export type YouTubeMusicResource = {
  kind: "playlist" | "video" | "video-playlist";
  sourceUrl: string;
  embedUrl: string;
  videoId?: string;
  playlistId?: string;
};

export type YouTubePlayerError = {
  code: number;
  title: string;
  description: string;
};

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);

function cleanId(value: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : undefined;
}

function buildEmbedUrl(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `https://www.youtube.com/embed${path}?${query.toString()}`;
}

function getVideoId(url: URL) {
  if (url.hostname.endsWith("youtu.be")) {
    return cleanId(url.pathname.split("/").filter(Boolean)[0] ?? null);
  }

  if (url.pathname.startsWith("/embed/")) {
    return cleanId(url.pathname.split("/").filter(Boolean)[1] ?? null);
  }

  if (url.pathname === "/watch") {
    return cleanId(url.searchParams.get("v"));
  }

  return undefined;
}

export function parseYouTubeMusicResource(input: string): YouTubeMusicResource | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  const playlistId = cleanId(url.searchParams.get("list"));
  const videoId = getVideoId(url);

  if (videoId && playlistId) {
    return {
      kind: "video-playlist",
      sourceUrl: trimmed,
      videoId,
      playlistId,
      embedUrl: buildEmbedUrl(`/${videoId}`, { list: playlistId, rel: "0", playsinline: "1" }),
    };
  }

  if (playlistId) {
    return {
      kind: "playlist",
      sourceUrl: trimmed,
      playlistId,
      embedUrl: buildEmbedUrl("/videoseries", { list: playlistId, rel: "0" }),
    };
  }

  if (videoId) {
    return {
      kind: "video",
      sourceUrl: trimmed,
      videoId,
      embedUrl: buildEmbedUrl(`/${videoId}`, { rel: "0", playsinline: "1" }),
    };
  }

  return null;
}

export function getYouTubeMusicResourceLabel(resource: YouTubeMusicResource) {
  if (resource.kind === "playlist") return "YouTube playlist embed";
  if (resource.kind === "video-playlist") return "YouTube video + playlist embed";
  return "YouTube video embed";
}

export function getYouTubeThumbnailUrl(resource: YouTubeMusicResource, quality = "hqdefault") {
  if (!resource.videoId) return undefined;
  return `https://i.ytimg.com/vi/${resource.videoId}/${quality}.jpg`;
}

export function needsPlaylistFirstTrackUrl(resource: YouTubeMusicResource) {
  return resource.kind === "playlist";
}

export function getYouTubePlayerEmbedUrl(resource: YouTubeMusicResource, origin?: string) {
  const url = new URL(resource.embedUrl);
  url.searchParams.set("enablejsapi", "1");
  if (origin) url.searchParams.set("origin", origin);
  return url.toString();
}

export function describeYouTubePlayerError(code: number): YouTubePlayerError {
  if (code === 2) {
    return {
      code,
      title: "링크 파라미터를 확인해주세요.",
      description: "YouTube가 이 영상 ID나 재생목록 ID를 유효한 재생 대상으로 인식하지 못했어요.",
    };
  }

  if (code === 5) {
    return {
      code,
      title: "HTML5 플레이어에서 재생할 수 없어요.",
      description: "이 영상은 현재 브라우저의 YouTube iframe 플레이어에서 재생이 제한되어 있어요.",
    };
  }

  if (code === 100) {
    return {
      code,
      title: "삭제되었거나 비공개 영상이에요.",
      description: "계정 로그인 상태에서는 보일 수 있지만, 공개 iframe embed에서는 재생할 수 없습니다.",
    };
  }

  if (code === 101 || code === 150) {
    return {
      code,
      title: "외부 사이트 재생이 막힌 영상이에요.",
      description: "영상 소유자가 iframe embed 재생을 허용하지 않아 YouTube Music에서 직접 열어야 합니다.",
    };
  }

  if (code === 153) {
    return {
      code,
      title: "YouTube 재생 인증 정보가 부족해요.",
      description: "YouTube가 referrer/API client 정보를 요구해 iframe 재생을 중단했습니다.",
    };
  }

  return {
    code,
    title: "YouTube 플레이어가 재생을 중단했어요.",
    description: "이 링크는 현재 iframe에서 재생할 수 없습니다. 첫 곡이 포함된 watch URL을 다시 붙여 넣어보세요.",
  };
}
