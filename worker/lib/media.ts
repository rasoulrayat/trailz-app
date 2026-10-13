import type { Env } from "../env";
import { isMock } from "../env";
import { placeKey } from "./route";
import { getMetadata } from "./supadata";

const MAX_IMAGE_BYTES = 1_500_000;

/** Download an image once and keep it in D1, served from /api/img/:key. */
export async function storeImage(db: D1Database, key: string, sourceUrl: string, fetcher: typeof fetch = fetch) {
  const res = await fetcher(sourceUrl, { headers: { "user-agent": "Mozilla/5.0 (compatible; TrailZ/0.1)" } });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) throw new Error(`image ${res.status} ${type}`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`image too big (${bytes.byteLength})`);
  await db
    .prepare("INSERT OR REPLACE INTO images (key, content_type, bytes, created_at) VALUES (?, ?, ?, ?)")
    .bind(key, type.split(";")[0], bytes, Date.now())
    .run();
  return `/api/img/${encodeURIComponent(key)}`;
}

/**
 * Fill in a video's cover image (and title/creator when missing). Runs once per video, after
 * the response is sent. thumbnail_url: NULL = not tried yet, "" = tried, nothing found.
 */
export async function fillVideoMeta(env: Env, videoId: string, knownThumb?: string | null) {
  const claim = await env.DB.prepare("UPDATE videos SET thumbnail_url = '' WHERE id = ? AND thumbnail_url IS NULL")
    .bind(videoId)
    .run();
  if ((claim.meta.changes ?? 0) !== 1) return;
  const v = await env.DB.prepare("SELECT url, title, author FROM videos WHERE id = ?")
    .bind(videoId)
    .first<{ url: string; title: string | null; author: string | null }>();
  if (!v) return;

  let thumb = knownThumb ?? undefined;
  let title: string | undefined;
  let author: string | undefined;
  if (!thumb && !isMock(env) && env.SUPADATA_API_KEY) {
    const meta = await getMetadata(env.SUPADATA_API_KEY, v.url);
    thumb = meta.thumbnailUrl;
    title = meta.title;
    author = meta.author;
  }
  const stored = thumb ? await storeImage(env.DB, `v-${videoId}`, thumb) : "";
  await env.DB.prepare(
    "UPDATE videos SET thumbnail_url = ?, title = COALESCE(title, ?), author = COALESCE(author, ?), updated_at = updated_at WHERE id = ?",
  )
    .bind(stored, title ?? null, author ?? null, videoId)
    .run();
}

export interface PlacePhoto {
  url: string | null;
  pageUrl?: string | null;
  title?: string | null;
}

// Page images that aren't photos of the place.
const NOT_A_PHOTO = /\.svg|flag_of|coat_of_arms|wappen|blason|locator|location_map|_map[._]|map_of|logo/i;

/**
 * A free, openly licensed photo of a place from Wikipedia (cached in D1).
 * Wikimedia images may be shown with a credit linking to the article.
 */
export async function placePhoto(db: D1Database, contact: string, query: string, fetcher: typeof fetch = fetch): Promise<PlacePhoto> {
  const key = placeKey(query);
  if (!key) return { url: null };
  const cached = await db
    .prepare("SELECT url, page_url, title FROM place_photos WHERE query = ?")
    .bind(key)
    .first<{ url: string | null; page_url: string | null; title: string | null }>();
  if (cached) return { url: cached.url, pageUrl: cached.page_url, title: cached.title };

  const api =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=0&gsrlimit=3" +
    `&prop=pageimages|info&piprop=thumbnail&pithumbsize=800&inprop=url&gsrsearch=${encodeURIComponent(query)}`;
  let found: PlacePhoto = { url: null };
  try {
    const res = await fetcher(api, { headers: { "user-agent": `TrailZ/0.1 (${contact})` } });
    if (!res.ok) return { url: null }; // don't cache their outage
    const body = (await res.json()) as {
      query?: { pages?: { index?: number; title: string; fullurl?: string; thumbnail?: { source: string } }[] };
    };
    const pages = [...(body.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    // The article must be about this place: its title has to contain the place's first word.
    const first = placeKey(query.split(",")[0]).split(" ")[0];
    const page = pages.find(
      (p) => p.thumbnail?.source && !NOT_A_PHOTO.test(p.thumbnail.source) && placeKey(p.title).includes(first),
    );
    if (page?.thumbnail) found = { url: page.thumbnail.source, pageUrl: page.fullurl ?? null, title: page.title };
  } catch {
    return { url: null };
  }
  await db
    .prepare("INSERT OR REPLACE INTO place_photos (query, url, page_url, title, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(key, found.url, found.pageUrl ?? null, found.title ?? null, Date.now())
    .run();
  return found;
}
