import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { Icon } from "./Icon";
import { Img } from "./Img";

export interface Photo {
  url: string;
  credit: string | null;
  license: string | null;
  link: string | null;
}

export interface Gallery {
  photos: Photo[];
  pageUrl: string | null;
}

const EMPTY: Gallery = { photos: [], pageUrl: null };

// One request per place name for the whole session.
const cache = new Map<string, Promise<Gallery>>();

/**
 * A smaller copy of a Wikimedia thumbnail (our galleries come as 1000 px). Tiles don't need more than ~400 px,
 * and a 400 px JPEG is roughly a fifth of the bytes. Other hosts are returned unchanged.
 */
export function thumb(url: string, width: number): string {
  return /\.wikimedia\.org\/.*\/thumb\//.test(url) ? url.replace(/\/(\d+)px-/, `/${width}px-`) : url;
}

/** Fetch galleries ahead of time and start the image downloads, so a screen that needs them opens already filled. */
export function prefetchGalleries(queries: string[], width = 400) {
  queries.forEach((q) =>
    loadGallery(q).then((g) => {
      const first = g.photos[0];
      if (first) new Image().src = thumb(first.url, width);
    }),
  );
}

export function loadGallery(q: string): Promise<Gallery> {
  let p = cache.get(q);
  if (!p) {
    p = fetch(`/api/place-photos?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Gallery>) : EMPTY))
      .catch(() => EMPTY);
    cache.set(q, p);
  }
  return p;
}

/** Photos of a place (empty while loading or when none were found). */
export function usePlaceGallery(q: string | null | undefined): Gallery {
  const [gallery, setGallery] = useState<Gallery>(EMPTY);
  useEffect(() => {
    setGallery(EMPTY);
    if (!q) return;
    let live = true;
    loadGallery(q).then((g) => live && setGallery(g));
    return () => {
      live = false;
    };
  }, [q]);
  return gallery;
}

const creditText = (p: Photo) => [p.credit, p.license].filter(Boolean).join(" · ") || "Wikipedia";

/** Full-screen, swipeable photo viewer. */
export function PhotoViewer({
  title,
  photos,
  start,
  onClose,
  cardTo,
}: {
  title: string;
  photos: Photo[];
  start: number;
  onClose: () => void;
  /** Link to the place's Reality Card, shown at the bottom. */
  cardTo?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);

  useEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = start * el.clientWidth;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") el?.scrollBy({ left: el.clientWidth, behavior: "smooth" });
      if (e.key === "ArrowLeft") el?.scrollBy({ left: -el.clientWidth, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [start, onClose]);

  const photo = photos[index] ?? photos[0];
  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Photos of ${title}`}>
      <div className="viewer-top">
        <div style={{ minWidth: 0 }}>
          <div className="viewer-title">{title}</div>
          <div className="viewer-count">
            {index + 1} / {photos.length}
          </div>
        </div>
        <button className="icon-btn on-media" aria-label="Close photos" onClick={onClose} autoFocus>
          <Icon name="close" />
        </button>
      </div>
      <div
        className="viewer-track"
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {photos.map((p, i) => (
          <div className="viewer-slide" key={p.url}>
            <img src={p.url} alt={`${title}, photo ${i + 1}`} loading={Math.abs(i - start) <= 1 ? "eager" : "lazy"} />
          </div>
        ))}
      </div>
      <div className="viewer-bottom">
        {photo && (
          <a href={photo.link ?? undefined} target="_blank" rel="noopener noreferrer" className="viewer-credit">
            Photo: {creditText(photo)}
          </a>
        )}
        {cardTo && (
          <Link to={cardTo} className="btn accent" onClick={onClose}>
            See the Reality Card
          </Link>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Square thumbnail for list rows: the place's first photo. When the place has photos it becomes
 * a button that opens all of them.
 */
export function PlaceThumb({
  q,
  title,
  style,
  cardTo,
  children,
}: {
  q: string;
  title?: string;
  style?: CSSProperties;
  cardTo?: string;
  children?: ReactNode;
}) {
  const { photos } = usePlaceGallery(q);
  const [open, setOpen] = useState(false);
  const first = photos[0];
  if (!first) {
    return (
      <span className="thumb" aria-hidden="true" style={style}>
        {children}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className="thumb thumb-btn"
        style={style}
        aria-label={`See ${photos.length} photos of ${title ?? q}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Img src={first.url} style={{ position: "absolute", inset: 0, borderRadius: "inherit" }} />
        {photos.length > 1 && (
          <span className="thumb-count">
            <Icon name="photos" size={11} />
            {photos.length}
          </span>
        )}
        {children}
      </button>
      {open && <PhotoViewer title={title ?? q} photos={photos} start={0} cardTo={cardTo} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A row of swipeable photos (tap one to open the viewer). Renders nothing when there are no photos. */
export function PhotoStrip({ q, title, height = 150, cardTo }: { q: string; title: string; height?: number; cardTo?: string }) {
  const { photos } = usePlaceGallery(q);
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="strip" style={{ height }} aria-label={`Photos of ${title}`}>
        {photos.map((p, i) => (
          <button key={p.url} type="button" className="strip-photo" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${title}`}>
            <Img src={p.url} style={{ width: "100%", height: "100%" }} loading={i < 2 ? "eager" : "lazy"} />
          </button>
        ))}
      </div>
      {open !== null && <PhotoViewer title={title} photos={photos} start={open} cardTo={cardTo} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Full-width swipeable header photos for the Reality Card. */
export function HeroPhotos({
  q,
  title,
  fallback,
  children,
}: {
  q: string;
  title: string;
  /** Shown when the place has no photos (e.g. the reel's cover). */
  fallback?: string | null;
  children: (current: Photo | null) => ReactNode;
}) {
  const { photos } = usePlaceGallery(q);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const current = photos[index] ?? null;
  return (
    <header className="media">
      {!photos.length && fallback && <Img src={fallback} style={{ position: "absolute", inset: 0 }} />}
      {photos.length > 0 && (
        <div
          className="hero-track"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
          }}
        >
          {photos.map((p, i) => (
            <button key={p.url} type="button" className="hero-slide" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${title}`}>
              <Img src={p.url} style={{ width: "100%", height: "100%" }} loading={i === 0 ? "eager" : "lazy"} />
            </button>
          ))}
        </div>
      )}
      <div className="shade" />
      {photos.length > 1 && (
        <div className="dots" aria-hidden="true">
          {photos.map((p, i) => (
            <span key={p.url} className={i === index ? "on" : undefined} />
          ))}
        </div>
      )}
      {children(current)}
      {open !== null && <PhotoViewer title={title} photos={photos} start={open} onClose={() => setOpen(null)} />}
    </header>
  );
}

export const photoCredit = creditText;
