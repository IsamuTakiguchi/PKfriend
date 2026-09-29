// HD battle sprites: every frame of the animated sprites upscaled 4x with an anime-video AI model at deploy
// time (scripts/hd-sprites.py) and published with the site as animated WebP. The app plays them directly;
// when a sprite has no HD version (shiny, local dev) the runtime smoothing in smoothsprite.ts is used.
export interface HdEntry { w: number; h: number; frames: number }

const BASE = ((import.meta as unknown as { env: Record<string, string | undefined> }).env?.BASE_URL ?? '/').replace(/\/?$/, '/');
let files: Record<string, HdEntry> | null = null;
let loading: Promise<Record<string, HdEntry>> | null = null;

const key = (id: number, shiny?: boolean) => `${id}${shiny ? 's' : ''}.webp`;
export const hdUrl = (id: number, shiny?: boolean) => `${BASE}sprites/hd/${key(id, shiny)}`;

/** The list of HD sprites (empty when the site has none). */
export function loadHdList(): Promise<Record<string, HdEntry>> {
  if (files) return Promise.resolve(files);
  if (!loading) loading = fetch(`${BASE}sprites/hd/manifest.json`).then(r => (r.ok ? r.json() : { files: {} })).then(m => (files = (m?.files ?? {}) as Record<string, HdEntry>)).catch(() => (files = {}));
  return loading;
}
/** undefined = list not loaded yet, null = no HD sprite for this one. */
export function hdEntry(id: number, shiny?: boolean): HdEntry | null | undefined {
  if (!files) return undefined;
  return files[key(id, shiny)] ?? null;
}
