/** Small seedable PRNG (mulberry32) so the server can replay/verify. */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
export const pick = <T,>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
export const randInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
