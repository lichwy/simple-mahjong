import type { Meld, Tile } from "../../shared/types.js";
import { ALL_TILE_TYPES, parseTile, tileToText } from "../../shared/tileUtils.js";

// ─── Tile indexing (0..33) ────────────────────────────────────────────────────
function tileIdx(tile: Tile): number {
  const { rank, suit } = parseTile(tile);
  if (suit === "m") return rank - 1;
  if (suit === "p") return rank - 1 + 9;
  if (suit === "s") return rank - 1 + 18;
  return rank - 1 + 27;
}

function handToCount(tiles: Tile[]): number[] {
  const c = new Array(34).fill(0);
  for (const t of tiles) c[tileIdx(t)]++;
  return c;
}

// ─── Standard shanten backtracking ───────────────────────────────────────────
// Returns maximum value of: 2*mentsu + min(taatsu, 4-mentsu) + jantai
// Shanten = 8 - meldCount*2 - returned_value
function stdMax(tiles: number[], i: number, mentsu: number, taatsu: number, jantai: number): number {
  while (i < 34 && tiles[i] === 0) i++;
  if (i >= 34) {
    const t = Math.min(taatsu, 4 - mentsu);
    const j = jantai > 0 && mentsu + t < 5 ? 1 : 0;
    return 2 * mentsu + t + j;
  }

  let best = 0;

  // Kōtsu (triplet → mentsu)
  if (tiles[i] >= 3) {
    tiles[i] -= 3;
    best = Math.max(best, stdMax(tiles, i, mentsu + 1, taatsu, jantai));
    tiles[i] += 3;
  }

  // Shuntsu (sequence → mentsu, number tiles only)
  const suit = Math.floor(i / 9);
  if (suit < 3 && i % 9 <= 6 && tiles[i + 1] > 0 && tiles[i + 2] > 0) {
    tiles[i]--; tiles[i + 1]--; tiles[i + 2]--;
    best = Math.max(best, stdMax(tiles, i, mentsu + 1, taatsu, jantai));
    tiles[i]++; tiles[i + 1]++; tiles[i + 2]++;
  }

  // Pair as jantai (head)
  if (jantai === 0 && tiles[i] >= 2) {
    tiles[i] -= 2;
    best = Math.max(best, stdMax(tiles, i, mentsu, taatsu, 1));
    tiles[i] += 2;
  }

  // Pair as taatsu (partial triplet)
  if (tiles[i] >= 2) {
    tiles[i] -= 2;
    best = Math.max(best, stdMax(tiles, i, mentsu, taatsu + 1, jantai));
    tiles[i] += 2;
  }

  // Adjacent taatsu (ryanmen/penchan): i and i+1
  if (suit < 3 && i % 9 <= 7 && tiles[i + 1] > 0) {
    tiles[i]--; tiles[i + 1]--;
    best = Math.max(best, stdMax(tiles, i, mentsu, taatsu + 1, jantai));
    tiles[i]++; tiles[i + 1]++;
  }

  // Kanchan taatsu: i and i+2
  if (suit < 3 && i % 9 <= 6 && tiles[i + 2] > 0) {
    tiles[i]--; tiles[i + 2]--;
    best = Math.max(best, stdMax(tiles, i, mentsu, taatsu + 1, jantai));
    tiles[i]++; tiles[i + 2]++;
  }

  // Skip (tiles[i] are isolated)
  best = Math.max(best, stdMax(tiles, i + 1, mentsu, taatsu, jantai));

  return best;
}

// ─── Public interface ─────────────────────────────────────────────────────────
export interface ShantenResult {
  shanten: number; // -1=win, 0=tenpai, 1=iishanten, ...
  form: "standard" | "chiitoi" | "kokushi";
}

export function calculateShanten(hand: Tile[], melds: Meld[] = []): ShantenResult {
  const count = handToCount(hand);
  const meldCount = melds.length;

  // Standard hand
  const stdVal = stdMax(count, 0, meldCount, 0, 0);
  const standard = 8 - meldCount * 2 - stdVal;
  let result: ShantenResult = { shanten: standard, form: "standard" };

  // Chiitoi (7 pairs) — only without open melds
  if (meldCount === 0) {
    let pairs = 0;
    for (let i = 0; i < 34; i++) if (count[i] >= 2) pairs++;
    const chiitoi = 6 - pairs;
    if (chiitoi < result.shanten) result = { shanten: chiitoi, form: "chiitoi" };
  }

  // Kokushi — only without open melds
  if (meldCount === 0) {
    const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
    let kinds = 0;
    let hasPair = false;
    for (const i of terminals) {
      if (count[i] > 0) {
        kinds++;
        if (count[i] >= 2) hasPair = true;
      }
    }
    const kokushi = 13 - kinds - (hasPair ? 1 : 0);
    if (kokushi < result.shanten) result = { shanten: kokushi, form: "kokushi" };
  }

  return result;
}

/** Tiles that would complete the hand (bring shanten to -1). */
export function getWaitingTiles(hand13: Tile[], melds: Meld[]): Tile[] {
  return ALL_TILE_TYPES.filter((tile) => {
    const test = [...hand13, tile];
    return calculateShanten(test, melds).shanten === -1;
  });
}

export interface DiscardAnalysis {
  tile: Tile;
  shanten: number;
  form: string;
  waitingTiles: Tile[];
  ukeire: number; // available copies of waiting tiles
}

/**
 * Analyse every possible discard and return results sorted best-first.
 * discardPool = all tiles visible to the player (own hand + all rivers).
 */
export function analyzeDiscards(
  hand: Tile[],
  melds: Meld[],
  discardPool: Tile[] = []
): DiscardAnalysis[] {
  const tried = new Set<string>();
  const results: DiscardAnalysis[] = [];

  for (const tile of hand) {
    if (tried.has(tile)) continue;
    tried.add(tile);

    const remaining = [...hand];
    remaining.splice(remaining.indexOf(tile), 1);

    const { shanten, form } = calculateShanten(remaining, melds);

    let waitingTiles: Tile[] = [];
    let ukeire = 0;

    if (shanten <= 0) {
      waitingTiles = getWaitingTiles(remaining, melds);
      // Count available copies: 4 per tile minus those already seen
      const seen = new Map<string, number>();
      for (const t of [...hand, ...discardPool]) {
        seen.set(t, (seen.get(t) ?? 0) + 1);
      }
      for (const wt of waitingTiles) {
        ukeire += Math.max(0, 4 - (seen.get(wt) ?? 0));
      }
    }

    results.push({ tile, shanten, form, waitingTiles, ukeire });
  }

  return results.sort((a, b) =>
    a.shanten !== b.shanten ? a.shanten - b.shanten : b.ukeire - a.ukeire
  );
}

/** Human-readable shanten label. */
export function shantenLabel(shanten: number): string {
  if (shanten === -1) return "和了";
  if (shanten === 0) return "聽牌";
  if (shanten === 1) return "一向聽";
  if (shanten === 2) return "二向聽";
  return `${shanten}向聽`;
}

/** Build a concise recommendation reason string. */
export function buildShantenReason(
  best: DiscardAnalysis,
  currentShanten: number
): string {
  const afterLabel = shantenLabel(best.shanten);
  if (best.shanten === -1) {
    return `已${afterLabel}！`;
  }
  if (best.shanten === 0) {
    const waitStr =
      best.waitingTiles.length > 0
        ? `等 ${best.waitingTiles.slice(0, 6).map(tileToText).join(" ")}${best.waitingTiles.length > 6 ? "…" : ""}，進張 ${best.ukeire} 張`
        : "聽牌";
    return waitStr;
  }
  const reduced = currentShanten - best.shanten;
  return reduced > 0
    ? `打後${afterLabel}（向聽↓${reduced}）`
    : afterLabel;
}
