import { describe, expect, it } from "vitest";

import {
  describeYouTubePlayerError,
  getYouTubeMusicResourceLabel,
  getYouTubePlayerEmbedUrl,
  getYouTubeThumbnailUrl,
  needsPlaylistFirstTrackUrl,
  parseYouTubeMusicResource,
} from "./youtube-music";

describe("youtube music helpers", () => {
  it("turns a YouTube Music playlist URL into an embeddable playlist with a playlist-only warning signal", () => {
    const resource = parseYouTubeMusicResource("https://music.youtube.com/playlist?list=PLabc_123-XYZ");

    expect(resource).toMatchObject({
      kind: "playlist",
      playlistId: "PLabc_123-XYZ",
      embedUrl: "https://www.youtube.com/embed/videoseries?list=PLabc_123-XYZ&rel=0",
    });
    expect(getYouTubeMusicResourceLabel(resource!)).toBe("YouTube playlist embed");
    expect(needsPlaylistFirstTrackUrl(resource!)).toBe(true);
    expect(getYouTubeThumbnailUrl(resource!)).toBeUndefined();
  });

  it("supports watch URLs that include a playlist and exposes the video thumbnail", () => {
    const resource = parseYouTubeMusicResource("https://www.youtube.com/watch?v=video_123&list=PLmix-456");

    expect(resource).toMatchObject({
      kind: "video-playlist",
      videoId: "video_123",
      playlistId: "PLmix-456",
      embedUrl: "https://www.youtube.com/embed/video_123?list=PLmix-456&rel=0&playsinline=1",
    });
    expect(needsPlaylistFirstTrackUrl(resource!)).toBe(false);
    expect(getYouTubeThumbnailUrl(resource!)).toBe("https://i.ytimg.com/vi/video_123/hqdefault.jpg");
  });

  it("supports short video URLs and rejects non-YouTube input", () => {
    expect(parseYouTubeMusicResource("https://youtu.be/abcDEF_123")).toMatchObject({
      kind: "video",
      videoId: "abcDEF_123",
      embedUrl: "https://www.youtube.com/embed/abcDEF_123?rel=0&playsinline=1",
    });
    expect(parseYouTubeMusicResource("https://example.com/watch?v=abc")).toBeNull();
    expect(parseYouTubeMusicResource("not a url")).toBeNull();
  });

  it("adds YouTube iframe API parameters only at render time", () => {
    const resource = parseYouTubeMusicResource("https://youtu.be/abcDEF_123");

    expect(getYouTubePlayerEmbedUrl(resource!, "http://localhost:3000")).toBe(
      "https://www.youtube.com/embed/abcDEF_123?rel=0&playsinline=1&enablejsapi=1&origin=http%3A%2F%2Flocalhost%3A3000",
    );
  });

  it("describes YouTube iframe player errors in user-friendly copy", () => {
    expect(describeYouTubePlayerError(150)).toMatchObject({
      title: "외부 사이트 재생이 막힌 영상이에요.",
      description: expect.stringContaining("YouTube Music에서 직접 열어야"),
    });
    expect(describeYouTubePlayerError(999)).toMatchObject({
      title: "YouTube 플레이어가 재생을 중단했어요.",
    });
  });
});
