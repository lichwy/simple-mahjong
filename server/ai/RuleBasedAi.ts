import type { ActionOption, PlayerRuntimeState, Tile, Wind } from "../../shared/types.js";
import { isHonor, isSimple, isTerminal, parseTile } from "../../shared/tileUtils.js";

interface AiDecisionInfo {
  mode: string;
  strength: string;
  summary: string;
}

function countTile(hand: Tile[], tile: Tile): number {
  return hand.filter((value) => value === tile).length;
}

function adjacencyScore(hand: Tile[], tile: Tile): number {
  const { rank, suit } = parseTile(tile);
  if (suit === "z") {
    return 0;
  }
  let score = 0;
  for (const offset of [-2, -1, 1, 2]) {
    const targetRank = rank + offset;
    if (targetRank < 1 || targetRank > 9) {
      continue;
    }
    if (hand.includes(`${targetRank}${suit}` as Tile)) {
      score += Math.abs(offset) === 1 ? 2 : 1;
    }
  }
  return score;
}

function discardPenalty(hand: Tile[], tile: Tile): number {
  let penalty = 0;
  const copies = countTile(hand, tile);
  penalty -= (copies - 1) * 4;
  penalty -= adjacencyScore(hand, tile);

  if (isHonor(tile)) {
    penalty += copies >= 2 ? 1 : 6;
  }
  if (isTerminal(tile)) {
    penalty += 3;
  }
  if (isSimple(tile)) {
    penalty -= 1;
  }

  return penalty;
}

function chooseDiscard(hand: Tile[], actions: ActionOption[]): ActionOption {
  let best = actions[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const action of actions) {
    if (!action.tile) {
      continue;
    }
    const handAfterDiscard = [...hand];
    const index = handAfterDiscard.indexOf(action.tile);
    if (index >= 0) {
      handAfterDiscard.splice(index, 1);
    }
    const score = discardPenalty(handAfterDiscard, action.tile);
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

function removeClaimTiles(hand: Tile[], action: ActionOption): Tile[] {
  const next = [...hand];
  const tilesToRemove =
    action.type === "chi"
      ? (action.tiles ?? []).filter((tile) => tile !== action.tile).slice(0, 2)
      : action.type === "pon"
        ? [action.tile!, action.tile!]
        : action.type === "kan"
          ? [action.tile!, action.tile!, action.tile!]
          : action.type === "addedKan"
            ? [action.tile!]
            : action.type === "concealedKan"
              ? [action.tile!, action.tile!, action.tile!, action.tile!]
              : [];
  for (const tile of tilesToRemove) {
    const index = next.indexOf(tile);
    if (index >= 0) {
      next.splice(index, 1);
    }
  }
  return next;
}

function handShapeScore(hand: Tile[]): number {
  let score = 0;
  const unique = [...new Set(hand)];
  for (const tile of unique) {
    const copies = countTile(hand, tile);
    score += adjacencyScore(hand, tile);
    if (copies >= 2) {
      score += copies === 2 ? 3 : copies === 3 ? 6 : 8;
    }
    if (isHonor(tile) && copies === 1) {
      score -= 2;
    }
    if (isTerminal(tile) && copies === 1) {
      score -= 1;
    }
    if (isSimple(tile)) {
      score += 1;
    }
  }
  return score;
}

function windHonorTile(wind: Wind): Tile {
  switch (wind) {
    case "east":
      return "1z";
    case "south":
      return "2z";
    case "west":
      return "3z";
    case "north":
      return "4z";
  }
}

function valueHonorBonus(tile: Tile, player: PlayerRuntimeState, roundWind: Wind): number {
  if (!isHonor(tile)) {
    return 0;
  }
  if (tile === "5z" || tile === "6z" || tile === "7z") {
    return 5;
  }
  if (tile === windHonorTile(player.seatWind)) {
    return 4;
  }
  if (tile === windHonorTile(roundWind)) {
    return 3;
  }
  return 0;
}

function claimBonus(action: ActionOption, player: PlayerRuntimeState, roundWind: Wind): number {
  if (!action.tile) {
    return 0;
  }
  const honorBonus = valueHonorBonus(action.tile, player, roundWind);
  switch (action.type) {
    case "kan":
    case "concealedKan":
    case "addedKan":
      return (isHonor(action.tile) || isTerminal(action.tile) ? 8 : 6) + honorBonus;
    case "pon":
      return (isHonor(action.tile) ? 7 : isTerminal(action.tile) ? 5 : 5) + honorBonus;
    case "chi": {
      const rank = parseTile(action.tile).rank;
      return rank >= 3 && rank <= 7 ? 3 : 1;
    }
    default:
      return 0;
  }
}

function opennessPenalty(action: ActionOption): number {
  switch (action.type) {
    case "chi":
      return 6;
    case "pon":
      return 5;
    case "kan":
      return 3;
    default:
      return 0;
  }
}

function claimThreshold(action: ActionOption): number {
  switch (action.type) {
    case "chi":
      return 4;
    case "pon":
      return 1;
    case "kan":
      return 2;
    default:
      return 0;
  }
}

function chooseClaimOrKan(player: PlayerRuntimeState, actions: ActionOption[], roundWind: Wind): ActionOption {
  const pass = actions.find((action) => action.type === "pass");
  const candidates = actions.filter((action) => action.type !== "pass");
  if (candidates.length === 0) {
    return actions[0];
  }
  const currentScore = handShapeScore(player.hand);
  let best = pass ?? candidates[0];
  let bestGain = Number.NEGATIVE_INFINITY;
  for (const action of candidates) {
    const nextHand = removeClaimTiles(player.hand, action);
    const score = handShapeScore(nextHand) + claimBonus(action, player, roundWind) - opennessPenalty(action);
    const gain = score - currentScore;
    if (gain > bestGain) {
      bestGain = gain;
      best = action;
    }
  }
  if (best.type !== "pass" && bestGain < claimThreshold(best)) {
    return pass ?? best;
  }
  return best;
}

export class RuleBasedAi {
  private readonly decisionInfoByPlayer = new Map<string, AiDecisionInfo>();

  protected rememberDecision(playerId: string, info: AiDecisionInfo): void {
    this.decisionInfoByPlayer.set(playerId, info);
  }

  getDecisionInfo(playerId: string): AiDecisionInfo | undefined {
    return this.decisionInfoByPlayer.get(playerId);
  }

  async chooseAction(
    player: PlayerRuntimeState,
    actions: ActionOption[],
    _roundWind: Wind,
    _liveWallTilesRemaining: number
  ): Promise<ActionOption> {
    const ron = actions.find((action) => action.type === "ron");
    if (ron) {
      this.rememberDecision(player.id, { mode: "規則AI", strength: "中", summary: `立即榮和 ${ron.label}` });
      return ron;
    }
    const tsumo = actions.find((action) => action.type === "tsumo");
    if (tsumo) {
      this.rememberDecision(player.id, { mode: "規則AI", strength: "中", summary: `立即自摸 ${tsumo.label}` });
      return tsumo;
    }

    const selfKan = actions.find((action) => action.type === "concealedKan" || action.type === "addedKan");
    if (selfKan) {
      this.rememberDecision(player.id, { mode: "規則AI", strength: "中", summary: `主動槓牌，擴大得分與進張 ${selfKan.label}` });
      return selfKan;
    }

    const pass = actions.find((action) => action.type === "pass");
    if (pass && actions.every((action) => action.type !== "discard")) {
      const chosen = chooseClaimOrKan(player, actions, _roundWind);
      this.rememberDecision(player.id, {
        mode: "規則AI",
        strength: "中",
        summary: chosen.type === "pass" ? "副露收益不夠高，維持手牌獨立發展並選擇略過" : `只在明顯提升自己牌型時副露 ${chosen.label}`
      });
      return chosen;
    }

    const discards = actions.filter((action) => action.type === "discard");
    if (discards.length > 0) {
      const chosen = chooseDiscard(player.hand, discards);
      this.rememberDecision(player.id, {
        mode: "規則AI",
        strength: "中",
        summary: `打出 ${chosen.label.replace(/^打出 /, "")}，優先保留搭子與對子`
      });
      return chosen;
    }

    this.rememberDecision(player.id, { mode: "規則AI", strength: "中", summary: `執行 ${actions[0].label}` });
    return actions[0];
  }
}
