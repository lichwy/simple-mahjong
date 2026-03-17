import type { Tile, Wind } from "./types.js";

export const ALL_TILE_TYPES: Tile[] = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "1z",
  "2z",
  "3z",
  "4z",
  "5z",
  "6z",
  "7z"
];

export const WIND_TILE_MAP: Record<Wind, Tile> = {
  east: "1z",
  south: "2z",
  west: "3z",
  north: "4z"
};

export const DRAGON_NAMES: Record<Tile, string> = {
  "1m": "一萬",
  "2m": "二萬",
  "3m": "三萬",
  "4m": "四萬",
  "5m": "五萬",
  "6m": "六萬",
  "7m": "七萬",
  "8m": "八萬",
  "9m": "九萬",
  "1p": "一筒",
  "2p": "二筒",
  "3p": "三筒",
  "4p": "四筒",
  "5p": "五筒",
  "6p": "六筒",
  "7p": "七筒",
  "8p": "八筒",
  "9p": "九筒",
  "1s": "一索",
  "2s": "二索",
  "3s": "三索",
  "4s": "四索",
  "5s": "五索",
  "6s": "六索",
  "7s": "七索",
  "8s": "八索",
  "9s": "九索",
  "1z": "東",
  "2z": "南",
  "3z": "西",
  "4z": "北",
  "5z": "白",
  "6z": "發",
  "7z": "中"
};

export function parseTile(tile: Tile): { rank: number; suit: "m" | "p" | "s" | "z" } {
  return { rank: Number(tile[0]), suit: tile[1] as "m" | "p" | "s" | "z" };
}

export function tileSortValue(tile: Tile): number {
  const { rank, suit } = parseTile(tile);
  const suitBase = { m: 0, p: 10, s: 20, z: 30 }[suit];
  return suitBase + rank;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => tileSortValue(a) - tileSortValue(b));
}

export function isHonor(tile: Tile): boolean {
  return tile.endsWith("z");
}

export function isTerminal(tile: Tile): boolean {
  const { rank, suit } = parseTile(tile);
  return suit === "z" || rank === 1 || rank === 9;
}

export function isSimple(tile: Tile): boolean {
  return !isHonor(tile) && !isTerminal(tile);
}

export function nextDora(tile: Tile): Tile {
  const { rank, suit } = parseTile(tile);
  if (suit === "z") {
    if (rank <= 4) {
      const next = rank === 4 ? 1 : rank + 1;
      return `${next}z` as Tile;
    }
    const next = rank === 7 ? 5 : rank + 1;
    return `${next}z` as Tile;
  }
  const next = rank === 9 ? 1 : rank + 1;
  return `${next}${suit}` as Tile;
}

export function tileToText(tile: Tile): string {
  return DRAGON_NAMES[tile];
}

export function cloneTiles(tiles: Tile[]): Tile[] {
  return [...tiles];
}
