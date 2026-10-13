import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

export interface Photo {
  url: string | null;
  pageUrl?: string | null;
  title?: string | null;
}

// One request per place name for the whole session.
const cache = new Map<string, Promise<Photo>>();

function loadPhoto(q: string): Promise<Photo> {
  let p = cache.get(q);
  if (!p) {
    p = fetch(`/api/place-photo?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Photo>) : { url: null }))
      .catch(() => ({ url: null }));
    cache.set(q, p);
  }
  return p;
}

/** A Wikipedia photo of a place, or null while loading / when none was found. */
export function usePlacePhoto(q: string | null | undefined): Photo | null {
  const [photo, setPhoto] = useState<Photo | null>(null);
  useEffect(() => {
    setPhoto(null);
    if (!q) return;
    let live = true;
    loadPhoto(q).then((p) => live && setPhoto(p));
    return () => {
      live = false;
    };
  }, [q]);
  return photo?.url ? photo : null;
}

/** Square thumbnail for list rows: the place photo, or the plain tile while there is none. */
export function PlaceThumb({ q, style, children }: { q: string; style?: CSSProperties; children?: ReactNode }) {
  const photo = usePlacePhoto(q);
  return (
    <span
      className="thumb"
      aria-hidden="true"
      style={{ ...style, ...(photo ? { backgroundImage: `url("${photo.url}")` } : null) }}
    >
      {children}
    </span>
  );
}
