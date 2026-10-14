import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { VideoMeta } from "../../shared/types";
import { Icon } from "./Icon";
import { Img } from "./Img";

const PLATFORM: Record<VideoMeta["platform"], string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

export const platformLabel = (v: VideoMeta) => [PLATFORM[v.platform], v.author].filter(Boolean).join(" · ");

/** The platform's own embedded player for this reel, so it plays inside TrailZ. */
export function embedUrl(v: VideoMeta, opts: { muted?: boolean } = {}): string | null {
  const u = v.url;
  let m: RegExpMatchArray | null;
  const mute = opts.muted ? 1 : 0;
  if (v.platform === "youtube" && (m = u.match(/(?:v=|shorts\/|youtu\.be\/)([\w-]{6,})/)))
    return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&mute=${mute}&playsinline=1&rel=0&loop=1&playlist=${m[1]}`;
  if (v.platform === "tiktok" && (m = u.match(/\/video\/(\d+)/)))
    return `https://www.tiktok.com/player/v1/${m[1]}?autoplay=1&mute=${mute}&loop=1&rel=0&description=0&music_info=0`;
  if (v.platform === "instagram" && (m = u.match(/\/(?:reel|reels|p|tv)\/([\w-]+)/)))
    return `https://www.instagram.com/reel/${m[1]}/embed/`;
  return null;
}

/** Full-screen sheet that plays the reel. */
export function ReelPlayer({ video, onClose }: { video: VideoMeta; onClose: () => void }) {
  const src = embedUrl(video);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Watch the reel">
      <div className="viewer-top">
        <div style={{ minWidth: 0 }}>
          <div className="viewer-title">{platformLabel(video)}</div>
          {video.title && <div className="viewer-count" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{video.title}</div>}
        </div>
        <button className="icon-btn on-media" aria-label="Close" onClick={onClose} autoFocus>
          <Icon name="close" />
        </button>
      </div>
      <div className="player-box">
        {src ? (
          <iframe src={src} title="Reel" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <p className="viewer-credit">This reel can't be played here.</p>
        )}
      </div>
      <div className="viewer-bottom">
        <a href={video.url} target="_blank" rel="noopener noreferrer" className="btn secondary" style={{ color: "var(--navy)" }}>
          Open in {PLATFORM[video.platform]} <Icon name="external" size={14} />
        </a>
      </div>
    </div>,
    document.body,
  );
}

/** The small card showing which reel is being checked. Tap it to watch the reel. */
export function VideoChip({ video }: { video: VideoMeta }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="card row video-chip" style={{ padding: 10, gap: 14 }} onClick={() => setOpen(true)} aria-label="Watch the reel">
        <span className="thumb" style={{ width: 64, height: 86, position: "relative", overflow: "hidden" }}>
          {video.thumbnailUrl ? <Img src={video.thumbnailUrl} style={{ position: "absolute", inset: 0 }} /> : <span className="img-shimmer" aria-hidden="true" />}
          <span className="play-badge">
            <Icon name="play" size={16} />
          </span>
        </span>
        <span style={{ minWidth: 0, textAlign: "left" }}>
          <span className="small" style={{ display: "block" }}>
            {platformLabel(video)}
          </span>
          <span style={{ fontSize: 14, lineHeight: 1.4, marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {video.title ? `“${video.title}”` : "Watch the reel"}
          </span>
        </span>
      </button>
      {open && <ReelPlayer video={video} onClose={() => setOpen(false)} />}
    </>
  );
}
