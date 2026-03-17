import OpenAI from "openai";
import type { ActionOption, PlayerRuntimeState, Tile, Wind } from "../../shared/types.js";
import { sortTiles, tileToText } from "../../shared/tileUtils.js";
import { RuleBasedAi } from "./RuleBasedAi.js";

function formatAction(action: ActionOption): string {
  const tileText = action.tile ? tileToText(action.tile) : "";
  switch (action.type) {
    case "discard":
      return `打出 ${tileText}`;
    case "chi":
      return `吃 ${(action.tiles ?? []).map(tileToText).join("")}`;
    case "pon":
      return `碰 ${tileText}`;
    case "kan":
      return `明槓 ${tileText}`;
    case "concealedKan":
      return `暗槓 ${tileText}`;
    case "addedKan":
      return `加槓 ${tileText}`;
    case "ron":
      return `榮和 ${tileText}`;
    case "tsumo":
      return `自摸 ${tileText}`;
    case "pass":
      return "略過";
    default:
      return action.label;
  }
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

export class OpenAiMahjongAi extends RuleBasedAi {
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor() {
    super();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    this.client = apiKey ? new OpenAI({ apiKey, maxRetries: 1, timeout: 4000 }) : null;
    this.model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
  }

  override async chooseAction(
    player: PlayerRuntimeState,
    actions: ActionOption[],
    roundWind: Wind,
    liveWallTilesRemaining: number
  ): Promise<ActionOption> {
    if (!this.client) {
      this.rememberDecision(player.id, {
        mode: "規則AI",
        strength: "中",
        summary: "未設定 OpenAI API，改用規則 AI 後備決策"
      });
      return super.chooseAction(player, actions, roundWind, liveWallTilesRemaining);
    }

    const fallback = await super.chooseAction(player, actions, roundWind, liveWallTilesRemaining);
    try {
      const options = actions.map((action, index) => `${index}: ${formatAction(action)}`).join("\n");
      const hand = sortTiles(player.hand).map(tileToText).join("、");
      const melds = player.melds.length > 0 ? player.melds.map((meld) => `${meld.type}:${meld.tiles.map(tileToText).join("")}`).join(" | ") : "無";
      const discards = player.discards.length > 0 ? player.discards.map((discard) => tileToText(discard.tile)).join("、") : "無";
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "你是日式麻將 AI。請在簡化規則下選擇最強合法動作，但每家只為自己最佳利益行動，不要為了配合別家而副露，不要像在互相餵牌。優先和牌，其次是明顯提升自己和牌率或打點的吃碰槓，否則寧可略過並維持自己手牌。打牌時兼顧安全與效率。只能輸出 JSON，如 {\"index\": 2, \"reason\": \"保留兩面並降低放銃風險\"}。"
          },
          {
            role: "user",
            content: [
              `場風：${roundWind === "east" ? "東" : "南"}`,
              `剩餘牌山：${liveWallTilesRemaining}`,
              `你的手牌：${hand}`,
              `你的副露：${melds}`,
              `你的河：${discards}`,
              "合法動作：",
              options,
              `如果有和牌就選和牌。若無和牌，只有在副露能明顯幫助你自己更快和牌或提高打點時才吃碰槓；不要做看起來像在幫別家做牌的選擇。`,
              `請只回傳 JSON。`
            ].join("\n")
          }
        ],
        response_format: { type: "json_object" }
      });
      const content = response.choices[0]?.message?.content ?? "";
      const parsed = safeJson(content);
      const index = parsed?.index;
      if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < actions.length) {
        this.rememberDecision(player.id, {
          mode: "OpenAI",
          strength: "高",
          summary: parsed?.reason?.trim() || `選擇 ${formatAction(actions[index])}，兼顧和牌速度與安全`
        });
        return actions[index];
      }
      this.rememberDecision(player.id, {
        mode: "規則AI(後備)",
        strength: "中",
        summary: "OpenAI 回傳格式無效，改用規則 AI 後備決策"
      });
      return fallback;
    } catch {
      this.rememberDecision(player.id, {
        mode: "規則AI(後備)",
        strength: "中",
        summary: "OpenAI 暫時不可用，改用規則 AI 後備決策"
      });
      return fallback;
    }
  }
}
