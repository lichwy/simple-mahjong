import type { ActionOption, Meld, PlayerRuntimeState, Tile, WinType, Wind } from "../../shared/types.js";
import { ALL_TILE_TYPES, parseTile, sortTiles, tileToText } from "../../shared/tileUtils.js";

type SetGroupType = "sequence" | "triplet" | "pair";

interface SetGroup {
  type: SetGroupType;
  tiles: Tile[];
}

interface WinCheckInput {
  concealedTiles: Tile[];
  melds: Meld[];
  seatWind: Wind;
  roundWind: Wind;
  riichiAccepted: boolean;
  ippatsu: boolean;
  winType: WinType;
  winningTile: Tile;
  doraIndicators: Tile[];
}

export interface WinEvaluation {
  han: number;
  fu: number;
  yaku: string[];
  totalPoints: number;
  payments: number[];
}

function tileCounts(tiles: Tile[]): Map<Tile, number> {
  const counts = new Map<Tile, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

function removeTile(tiles: Tile[], tile: Tile, amount = 1): Tile[] {
  const remaining = [...tiles];
  for (let index = 0; index < amount; index += 1) {
    const tileIndex = remaining.indexOf(tile);
    if (tileIndex < 0) {
      throw new Error(`找不到要移除的牌：${tile}`);
    }
    remaining.splice(tileIndex, 1);
  }
  return remaining;
}

function hasSequence(tiles: Tile[], first: Tile): boolean {
  const { rank, suit } = parseTile(first);
  if (suit === "z" || rank > 7) {
    return false;
  }
  return tiles.includes(`${rank + 1}${suit}` as Tile) && tiles.includes(`${rank + 2}${suit}` as Tile);
}

function decomposeStandardHand(tiles: Tile[], meldSlots: number): SetGroup[] | null {
  const sorted = sortTiles(tiles);
  const counts = tileCounts(sorted);

  const tryMelds = (remaining: Tile[], groups: SetGroup[]): SetGroup[] | null => {
    if (remaining.length === 0) {
      return groups.length === meldSlots + 1 ? groups : null;
    }

    const first = remaining[0];
    const sameCount = remaining.filter((tile) => tile === first).length;
    if (sameCount >= 3) {
      const tripletRest = removeTile(remaining, first, 3);
      const tripletGroups = tryMelds(tripletRest, [...groups, { type: "triplet", tiles: [first, first, first] }]);
      if (tripletGroups) {
        return tripletGroups;
      }
    }

    if (hasSequence(remaining, first)) {
      const { rank, suit } = parseTile(first);
      const second = `${rank + 1}${suit}` as Tile;
      const third = `${rank + 2}${suit}` as Tile;
      const rest = removeTile(removeTile(removeTile(remaining, first), second), third);
      const sequenceGroups = tryMelds(rest, [...groups, { type: "sequence", tiles: [first, second, third] }]);
      if (sequenceGroups) {
        return sequenceGroups;
      }
    }

    return null;
  };

  for (const tile of ALL_TILE_TYPES) {
    if ((counts.get(tile) ?? 0) >= 2) {
      const remaining = removeTile(sorted, tile, 2);
      const melds = tryMelds(remaining, [{ type: "pair", tiles: [tile, tile] }]);
      if (melds) {
        return melds;
      }
    }
  }

  return null;
}

function isSevenPairs(tiles: Tile[]): boolean {
  if (tiles.length !== 14) {
    return false;
  }
  const counts = tileCounts(tiles);
  return counts.size === 7 && [...counts.values()].every((count) => count === 2);
}

function uniqueTiles(tiles: Tile[]): Tile[] {
  return [...new Set(sortTiles(tiles))];
}

function tileCountInHand(hand: Tile[], tile: Tile): number {
  return hand.filter((item) => item === tile).length;
}

function hasTile(hand: Tile[], tile: Tile): boolean {
  return hand.includes(tile);
}

function countTilesByType(hand: Tile[]): Map<Tile, number> {
  return tileCounts(hand);
}

function scoreBasicPoints(
  winnerSeat: number,
  loserSeat: number | null,
  winType: WinType
): { totalPoints: number; payments: number[] } {
  const payments = [0, 0, 0, 0];
  if (winType === "ron") {
    const totalPoints = 3000;
    if (loserSeat === null) {
      throw new Error("榮和需要放槍者。");
    }
    payments[winnerSeat] = totalPoints;
    payments[loserSeat] = -totalPoints;
    return { totalPoints, payments };
  }

  const eachPay = 1000;
  const totalPoints = eachPay * 3;
  for (let seat = 0; seat < 4; seat += 1) {
    if (seat === winnerSeat) {
      payments[seat] = totalPoints;
    } else {
      payments[seat] = -eachPay;
    }
  }
  return { totalPoints, payments };
}

export class RuleEngine {
  evaluateWin(
    input: WinCheckInput,
    winnerSeat: number,
    loserSeat: number | null,
    _dealerSeat: number
  ): WinEvaluation | null {
    const concealedTiles = sortTiles(input.concealedTiles);

    if (input.melds.length === 0 && isSevenPairs(concealedTiles)) {
      const scored = scoreBasicPoints(winnerSeat, loserSeat, input.winType);
      return {
        han: 1,
        fu: 25,
        yaku: ["七對子"],
        totalPoints: scored.totalPoints,
        payments: scored.payments
      };
    }

    const meldSlots = 4 - input.melds.length;
    if (meldSlots < 0) {
      return null;
    }
    const groups = decomposeStandardHand(concealedTiles, meldSlots);
    if (!groups) {
      return null;
    }

    const scored = scoreBasicPoints(winnerSeat, loserSeat, input.winType);
    return {
      han: 1,
      fu: 20,
      yaku: ["基本胡牌"],
      totalPoints: scored.totalPoints,
      payments: scored.payments
    };
  }

  getDiscardActions(player: PlayerRuntimeState): ActionOption[] {
    return uniqueTiles(player.hand).map((tile) => ({
      actorSeat: player.seat,
      type: "discard",
      tile,
      label: `打出 ${tileToText(tile)}`
    }));
  }

  getTsumoAction(
    player: PlayerRuntimeState,
    roundWind: Wind,
    doraIndicators: Tile[],
    dealerSeat: number,
    winningTile: Tile
  ): ActionOption[] {
    const evaluation = this.evaluateWin(
      {
        concealedTiles: player.hand,
        melds: player.melds,
        seatWind: player.seatWind,
        roundWind,
        riichiAccepted: player.riichiAccepted,
        ippatsu: player.ippatsu,
        winType: "tsumo",
        winningTile,
        doraIndicators
      },
      player.seat,
      null,
      dealerSeat
    );
    if (!evaluation) {
      return [];
    }
    return [
      {
        actorSeat: player.seat,
        type: "tsumo",
        tile: winningTile,
        label: `胡牌 ${tileToText(winningTile)}`
      }
    ];
  }

  getSelfActions(
    player: PlayerRuntimeState,
    roundWind: Wind,
    doraIndicators: Tile[],
    dealerSeat: number,
    winningTile: Tile
  ): ActionOption[] {
    const kanActions: ActionOption[] = [];
    const counts = countTilesByType(player.hand);
    for (const [tile, count] of counts.entries()) {
      if (count === 4) {
        kanActions.push({
          actorSeat: player.seat,
          type: "concealedKan",
          tile,
          label: `暗槓 ${tileToText(tile)}`
        });
      }
    }
    for (const meld of player.melds) {
      if (meld.type === "pon" && tileCountInHand(player.hand, meld.calledTile) >= 1) {
        kanActions.push({
          actorSeat: player.seat,
          type: "addedKan",
          tile: meld.calledTile,
          label: `加槓 ${tileToText(meld.calledTile)}`
        });
      }
    }
    return [
      ...this.getTsumoAction(player, roundWind, doraIndicators, dealerSeat, winningTile),
      ...kanActions,
      ...this.getDiscardActions(player)
    ];
  }

  getClaimActions(
    player: PlayerRuntimeState,
    roundWind: Wind,
    doraIndicators: Tile[],
    dealerSeat: number,
    targetTile: Tile,
    fromSeat: number,
    isNextSeat: boolean
  ): ActionOption[] {
    const actions: ActionOption[] = [];
    const ronEvaluation = this.evaluateWin(
      {
        concealedTiles: sortTiles([...player.hand, targetTile]),
        melds: player.melds,
        seatWind: player.seatWind,
        roundWind,
        riichiAccepted: player.riichiAccepted,
        ippatsu: player.ippatsu,
        winType: "ron",
        winningTile: targetTile,
        doraIndicators
      },
      player.seat,
      fromSeat,
      dealerSeat
    );

    if (ronEvaluation) {
      actions.push({
        actorSeat: player.seat,
        type: "ron",
        tile: targetTile,
        fromSeat,
        label: `胡 ${tileToText(targetTile)}`
      });
    }

    if (tileCountInHand(player.hand, targetTile) >= 2) {
      actions.push({
        actorSeat: player.seat,
        type: "pon",
        tile: targetTile,
        fromSeat,
        label: `碰 ${tileToText(targetTile)}`
      });
    }

    if (tileCountInHand(player.hand, targetTile) >= 3) {
      actions.push({
        actorSeat: player.seat,
        type: "kan",
        tile: targetTile,
        fromSeat,
        label: `槓 ${tileToText(targetTile)}`
      });
    }

    if (isNextSeat) {
      const { rank, suit } = parseTile(targetTile);
      if (suit !== "z") {
        const chiPatterns: Array<[number, number, number]> = [
          [rank - 2, rank - 1, rank],
          [rank - 1, rank, rank + 1],
          [rank, rank + 1, rank + 2]
        ];
        for (const pattern of chiPatterns) {
          if (pattern.some((value) => value < 1 || value > 9)) {
            continue;
          }
          const tiles = pattern.map((value) => `${value}${suit}` as Tile);
          const requiredTiles = tiles.filter((tile) => tile !== targetTile);
          if (requiredTiles.every((tile) => hasTile(player.hand, tile))) {
            actions.push({
              actorSeat: player.seat,
              type: "chi",
              tile: targetTile,
              tiles,
              fromSeat,
              label: `吃 ${tiles.map(tileToText).join("")}`
            });
          }
        }
      }
    }

    if (actions.length === 0) {
      return [];
    }

    actions.push({
        actorSeat: player.seat,
        type: "pass",
        fromSeat,
        targetTile,
        label: "略過"
      });

    return actions;
  }

  isTenpai(
    concealedTiles: Tile[],
    player: Pick<PlayerRuntimeState, "melds" | "seatWind" | "riichiAccepted" | "ippatsu">,
    roundWind: Wind,
    doraIndicators: Tile[],
    dealerSeat: number
  ): boolean {
    if (player.melds.length > 0) {
      return false;
    }
    for (const candidate of ALL_TILE_TYPES) {
      const evaluation = this.evaluateWin(
        {
          concealedTiles: sortTiles([...concealedTiles, candidate]),
          melds: player.melds,
          seatWind: player.seatWind,
          roundWind,
          riichiAccepted: player.riichiAccepted,
          ippatsu: player.ippatsu,
          winType: "tsumo",
          winningTile: candidate,
          doraIndicators
        },
        dealerSeat,
        null,
        dealerSeat
      );
      if (evaluation) {
        return true;
      }
    }
    return false;
  }
}
