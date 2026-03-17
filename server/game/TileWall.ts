import type { Tile } from "../../shared/types.js";
import { ALL_TILE_TYPES } from "../../shared/tileUtils.js";

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export class TileWall {
  private liveWall: Tile[];
  private deadWall: Tile[];
  private readonly doraIndicatorsInternal: Tile[];

  constructor(seedTiles?: Tile[], random: () => number = Math.random) {
    const tiles = seedTiles ? [...seedTiles] : shuffle(TileWall.buildFullWall(), random);
    this.deadWall = tiles.splice(-14);
    this.liveWall = tiles;
    this.doraIndicatorsInternal = [this.deadWall[4]];
  }

  static buildFullWall(): Tile[] {
    const tiles: Tile[] = [];
    for (const tile of ALL_TILE_TYPES) {
      for (let copy = 0; copy < 4; copy += 1) {
        tiles.push(tile);
      }
    }
    return tiles;
  }

  get doraIndicators(): Tile[] {
    return [...this.doraIndicatorsInternal];
  }

  get liveCount(): number {
    return this.liveWall.length;
  }

  get totalRemaining(): number {
    return this.liveWall.length + this.deadWall.length;
  }

  draw(): Tile {
    const tile = this.liveWall.shift();
    if (!tile) {
      throw new Error("牌山已空，無法摸牌。");
    }
    return tile;
  }

  drawReplacement(): Tile {
    const tile = this.deadWall.shift();
    if (!tile) {
      throw new Error("嶺上牌不足。");
    }
    const indicatorIndex = 4 + this.doraIndicatorsInternal.length * 2;
    const indicator = this.deadWall[indicatorIndex - 1];
    if (indicator) {
      this.doraIndicatorsInternal.push(indicator);
    }
    return tile;
  }
}
