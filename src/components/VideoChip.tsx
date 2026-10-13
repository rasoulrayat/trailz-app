import type { VideoMeta } from "../../shared/types";
import { Icon } from "./Icon";

const PLATFORM: Record<VideoMeta["platform"], string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

export const platformLabel = (v: VideoMeta) => [PLATFORM[v.platform], v.author].filter(Boolean).join(" · ");

/** The small card showing which reel is being checked. */
export function VideoChip({ video }: { video: VideoMeta }) {
  return (
    <div className="card row" style={{ padding: 10, gap: 14 }}>
      <span
        className="thumb"
        style={{
          width: 64,
          height: 86,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          backgroundImage: video.thumbnailUrl ? `url("${video.thumbnailUrl}")` : undefined,
        }}
      >
        {!video.thumbnailUrl && <Icon name="play" size={22} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="small" style={{ display: "block" }}>
          {platformLabel(video)}
        </span>
        <span style={{ display: "block", fontSize: 14, lineHeight: 1.4, marginTop: 4 }}>
          {video.title ? `“${video.title}”` : video.url}
        </span>
      </span>
    </div>
  );
}
