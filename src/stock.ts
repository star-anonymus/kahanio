// Stock footage from the free Pexels and Pixabay APIs, with the visitor's own free key.

export type Orientation = "portrait" | "landscape";
export type Credit = { source: "Pexels" | "Pixabay"; author: string; url: string };
export type Clip = { id: string; url: string; credit: Credit };

type PexelsFile = { link: string; width: number; height: number; file_type: string };
export type PexelsVideo = { id: number; url: string; user: { name: string }; video_files: PexelsFile[] };
type PixabayVariant = { url: string; width: number; height: number };
export type PixabayHit = { id: number; pageURL: string; user: string; videos: Record<string, PixabayVariant | undefined> };

export function pexelsSearchUrl(query: string, orientation: Orientation): string {
  const p = new URLSearchParams({ query, orientation, per_page: "10", size: "medium" });
  return `https://api.pexels.com/videos/search?${p}`;
}

export function pixabaySearchUrl(query: string, key: string): string {
  const p = new URLSearchParams({ key, q: query, per_page: "10", safesearch: "true", video_type: "film" });
  return `https://pixabay.com/api/videos/?${p}`;
}

/** The mp4 that matches the orientation and is closest to 1080 on its short side (never 4K: too heavy for a browser). */
export function pickPexelsFile(v: PexelsVideo, o: Orientation): string | null {
  const files = v.video_files.filter(
    (f) => f.file_type === "video/mp4" && f.width > 0 && f.height > 0 && Math.min(f.width, f.height) <= 1440 && f.height > f.width === (o === "portrait"),
  );
  if (!files.length) return null;
  const off = (f: PexelsFile) => Math.abs(Math.min(f.width, f.height) - 1080);
  files.sort((a, b) => off(a) - off(b));
  return files[0].link;
}

export function pickPixabayFile(h: PixabayHit): string | null {
  for (const k of ["medium", "small", "large"]) {
    const v = h.videos[k];
    if (v && v.url) return v.url;
  }
  return null;
}

const cache = new Map<string, { at: number; data: unknown }>();
const DAY = 24 * 3600 * 1000;

/** Pixabay asks API users to cache results for 24 hours. Kept in this tab's memory only: nothing is stored. */
async function cachedJson(url: string, init: RequestInit): Promise<unknown> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < DAY) return hit.data;
  const res = await fetch(url, init);
  if (res.status === 429) throw new Error("The stock library says too many searches right now. Wait a minute and press Retry.");
  if (res.status === 401 || res.status === 403) throw new Error("The stock library refused the key. Check it and press Retry.");
  if (!res.ok) throw new Error(`Stock search failed (HTTP ${res.status}). Press Retry.`);
  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  return data;
}

export type StockKeys = { pexels?: string; pixabay?: string };

export async function findClip(keywords: string[], o: Orientation, keys: StockKeys, used: Set<string>): Promise<Clip | null> {
  const query = keywords.join(" ") || "abstract background";
  if (keys.pexels) {
    const data = (await cachedJson(pexelsSearchUrl(query, o), { headers: { Authorization: keys.pexels } })) as { videos?: PexelsVideo[] };
    for (const v of data.videos ?? []) {
      const id = `pexels-${v.id}`;
      const link = pickPexelsFile(v, o);
      if (link && !used.has(id)) return { id, url: link, credit: { source: "Pexels", author: v.user.name, url: v.url } };
    }
  }
  if (keys.pixabay) {
    const data = (await cachedJson(pixabaySearchUrl(query, keys.pixabay), {})) as { hits?: PixabayHit[] };
    for (const h of data.hits ?? []) {
      const id = `pixabay-${h.id}`;
      const link = pickPixabayFile(h);
      if (link && !used.has(id)) return { id, url: link, credit: { source: "Pixabay", author: h.user, url: h.pageURL } };
    }
  }
  return null;
}

/** One credit line per clip, de-duplicated, for the end card and the description box. */
export function creditLines(credits: Credit[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of credits) {
    const line = `${c.author} on ${c.source}`;
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  return out;
}
