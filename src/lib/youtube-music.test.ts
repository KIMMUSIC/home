import { describe, expect, it } from "vitest";

import { getYouTubeMusicResourceLabel, parseYouTubeMusicResource } from "./youtube-music";

describe("youtube music helpers", () => {
  it("turns a YouTube Music playlist URL into an embeddable playlist", () => {
    const resource = parseYouTubeMusicResource("https://music.youtube.com/playlist?list=PLabc_123-XYZ");

    expect(resource).toMatchObject({
      kind: "playlist",
      playlistId: "PLabc_123-XYZ",
      embedUrl: "https://www.youtube.com/embed?listType=playlist&list=PLabc_123-XYZ&rel=0",
    });
    expect(getYouTubeMusicResourceLabel(resource)).toBe("YouTube playlist embed");
  });

  it("supports watch URLs that include a playlist", () => {
    const resource = parseYouTubeMusicResource("https://www.youtube.com/watch?v=video_123&list=PLmix-456");

    expect(resource).toMatchObject({
      kind: "video-playlist",
      videoId: "video_123",
      playlistId: "PLmix-456",
      embedUrl: "https://www.youtube.com/embed/video_123?list=PLmix-456&rel=0&playsinline=1",
    });
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
});
