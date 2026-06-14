export type YouTubeMusicResource = {
  kind: "playlist" | "video" | "video-playlist";
  sourceUrl: string;
  embedUrl: string;
  videoId?: string;
  playlistId?: string;
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
      embedUrl: buildEmbedUrl("", { listType: "playlist", list: playlistId, rel: "0" }),
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
