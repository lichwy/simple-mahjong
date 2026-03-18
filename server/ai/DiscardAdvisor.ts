import OpenAI from "openai";
import type { PublicGameState, RecommendationInfo, Tile } from "../../shared/types.js";
import { parseTile, tileToText } from "../../shared/tileUtils.js";
import { analyzeDiscards, buildShantenReason, calculateShanten, shantenLabel } from "../game/ShantenCalculator.js";

function countTile(tiles: Tile[], tile: Tile): number {
  return tiles.filter((item) => item === tile).length;
}

function adjacencyScore(tiles: Tile[], tile: Tile): number {
  const { rank, suit } = parseTile(tile);
  if (suit === "z") {
    return 0;
  }
  let score = 0;
  for (const offset of [-2, -1, 1, 2]) {
    const nextRank = rank + offset;
    if (nextRank < 1 || nextRank > 9) {
      continue;
    }
    if (tiles.includes(`${nextRank}${suit}` as Tile)) {
      score += Math.abs(offset) === 1 ? 2 : 1;
    }
  }
  return score;
}

function shapeScoreAfterDiscard(tiles: Tile[], tile: Tile): number {
  const next = [...tiles];
  const index = next.indexOf(tile);
  if (index >= 0) {
    next.splice(index, 1);
  }
  const { suit, rank } = parseTile(tile);
  const copies = countTile(next, tile);
  let score = 0;
  score -= (copies - 1) * 4;
  score -= adjacencyScore(next, tile);
  if (suit === "z") {
    score += copies >= 2 ? 1 : 6;
  }
  if (suit === "z" || rank === 1 || rank === 9) {
    score += 3;
  } else {
    score -= 1;
  }
  return score;
}

function likelyWaitSuits(player: PublicGameState["players"][number]): string[] {
  const weights = { m: 0, p: 0, s: 0, z: 0 };
  for (const meld of player.melds) {
    const suit = parseTile(meld.calledTile).suit;
    weights[suit] += meld.type === "kan" ? 5 : 4;
  }
  for (const discard of player.discards) {
    const suit = parseTile(discard.tile).suit;
    weights[suit] -= 0.4;
  }
  for (const discard of player.discards.slice(-4)) {
    const suit = parseTile(discard.tile).suit;
    weights[suit] -= 0.8;
  }
  return (["m", "p", "s", "z"] as const)
    .map((suit) => ({ suit, weight: weights[suit] }))
    .sort((left, right) => right.weight - left.weight)
    .filter((item) => item.weight > -1)
    .slice(0, 2)
    .map((item) => item.suit);
}

function suitText(suit: string): string {
  switch (suit) {
    case "m":
      return "萬子";
    case "p":
      return "筒子";
    case "s":
      return "索子";
    case "z":
      return "字牌";
    default:
      return suit;
  }
}

function tileRiskAgainstPlayer(player: PublicGameState["players"][number], tile: Tile): { score: number; reason: string } {
  if (player.discards.some((discard) => discard.tile === tile)) {
    return { score: -4, reason: `${player.name}已現物` };
  }
  const { suit } = parseTile(tile);
  const likelySuits = likelyWaitSuits(player);
  if (likelySuits.includes(suit)) {
    return { score: 3, reason: `${player.name}可能留${suitText(suit)}` };
  }
  return { score: 1, reason: `${player.name}聽牌方向未明` };
}

function buildSafety(state: PublicGameState, tile: Tile): { risk: number; reasons: string[] } {
  const opponents = state.players.filter((player) => player.seat !== state.viewerSeat);
  let risk = 0;
  const reasons: string[] = [];
  for (const opponent of opponents) {
    const assessment = tileRiskAgainstPlayer(opponent, tile);
    risk += assessment.score;
    reasons.push(assessment.reason);
  }
  return { risk, reasons };
}

function localReason(shape: number, risk: number, reasons: string[]): string {
  const shapeText = shape >= 2 ? "可保留較好的搭子與對子" : shape >= 0 ? "牌型影響較小" : "會稍微拆形";
  const safetyText = risk <= -2 ? "多家已現物，較安全" : risk <= 1 ? "放銃風險較低" : `需留意：${reasons.slice(0, 2).join("、")}`;
  return `${shapeText}，${safetyText}`;
}

function localSuggest(state: PublicGameState): RecommendationInfo | null {
  const self = state.players.find((player) => player.seat === state.viewerSeat);
  const discardActions = state.legalActions.filter((action) => action.type === "discard" && action.tile);
  if (!self || discardActions.length === 0) {
    return null;
  }

  // Build visible tile pool for ukeire counting
  const discardPool: Tile[] = [];
  for (const player of state.players) {
    for (const d of player.discards) discardPool.push(d.tile);
    for (const meld of player.melds) for (const t of meld.tiles) discardPool.push(t);
  }

  // Shanten-based analysis
  const eligible = new Set(discardActions.map((a) => a.tile!));
  const hand = self.hand;
  const melds = self.melds;

  const analyses = analyzeDiscards(hand, melds, discardPool).filter((a) =>
    eligible.has(a.tile)
  );

  if (analyses.length === 0) {
    return null;
  }

  // Blend shanten with safety
  const best = analyses.reduce((prev, cur) => {
    if (cur.shanten !== prev.shanten) return cur.shanten < prev.shanten ? cur : prev;
    const safetyPrev = buildSafety(state, prev.tile).risk;
    const safetyCur = buildSafety(state, cur.tile).risk;
    const scorePrev = cur.ukeire - safetyPrev * 1.2;
    const scoreCur = cur.ukeire - safetyCur * 1.2;
    return scoreCur > scorePrev ? cur : prev;
  });

  const currentShanten = calculateShanten(hand, melds).shanten;
  const shantenReason = buildShantenReason(best, currentShanten);

  // Append safety note if relevant
  const safety = buildSafety(state, best.tile);
  const safetyNote =
    safety.risk <= -2 ? "，多家現物安全" : safety.risk >= 3 ? "，注意放銃風險" : "";

  const currentLabel = shantenLabel(currentShanten);
  const status = `現在${currentLabel}`;

  return {
    tile: best.tile,
    reason: shantenReason + safetyNote,
    source: "向聽計算",
    strength: "高",
    status,
    shanten: best.shanten,
    shantenBefore: currentShanten,
    waitingTiles: best.waitingTiles,
    ukeire: best.ukeire
  };
}

function safeJson(text: string): { index?: number; reason?: string } | null {
  try {
    return JSON.parse(text) as { index?: number; reason?: string };
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]) as { index?: number; reason?: string };
    } catch {
      return null;
    }
  }
}

export class DiscardAdvisor {
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    this.client = apiKey ? new OpenAI({ apiKey, maxRetries: 1, timeout: 3500 }) : null;
    this.model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
  }

  async suggest(state: PublicGameState): Promise<RecommendationInfo | null> {
    const fallback = localSuggest(state);
    if (!this.client) {
      return fallback;
    }
    const self = state.players.find((player) => player.seat === state.viewerSeat);
    const discardActions = state.legalActions.filter((action) => action.type === "discard" && action.tile);
    if (!self || discardActions.length === 0) {
      return fallback;
    }
    try {
      const actions = discardActions.map((action, index) => `${index}: 打出 ${tileToText(action.tile!)}`).join("\n");
      const opponents = state.players
        .filter((player) => player.seat !== state.viewerSeat)
        .map((player) => `${player.name} 河：${player.discards.map((discard) => tileToText(discard.tile)).join("、") || "無"}；副露：${player.melds.map((meld) => meld.tiles.map(tileToText).join("")).join(" | ") || "無"}`)
        .join("\n");
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "你是日式麻將出牌顧問。請在合法打牌候選中挑選最好的出牌，優先兼顧牌效率與避免點炮。只能輸出 JSON，如 {\"index\":1,\"reason\":\"保留兩面並避開對手可能的萬子聽牌\"}。"
          },
          {
            role: "user",
            content: [
              `你的手牌：${self.hand.map(tileToText).join("、")}`,
              `場上資訊：`,
              opponents,
              `候選出牌：`,
              actions,
              `請選出最好的出牌，若有危險牌請明確寫入原因。`
            ].join("\n")
          }
        ],
        response_format: { type: "json_object" }
      });
      const parsed = safeJson(response.choices[0]?.message?.content ?? "");
      const index = parsed?.index;
      if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < discardActions.length) {
        return {
          tile: discardActions[index].tile!,
          reason: parsed?.reason?.trim() || "大模型綜合牌型效率與放銃風險後做出建議",
          source: "OpenAI",
          strength: "高",
          status: "大模型建議已連線"
        };
      }
      return fallback
        ? { ...fallback, status: "大模型回傳格式異常，已切回本地AI" }
        : null;
    } catch {
      return fallback
        ? { ...fallback, status: "大模型暫時離線，已切回本地AI" }
        : null;
    }
  }
}
