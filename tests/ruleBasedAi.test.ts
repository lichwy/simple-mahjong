import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../server/ai/RuleBasedAi.js";

describe("RuleBasedAi", () => {
  it("有明顯價值的碰牌機會時不應一律略過", async () => {
    const ai = new RuleBasedAi();
    const chosen = await ai.chooseAction(
      {
        seat: 0,
        id: "ai-1",
        name: "電腦",
        score: 25000,
        hand: ["6z", "6z", "2m", "3m", "4m", "3p", "4p", "5p", "6p", "7p", "5s", "6s", "7s"],
        melds: [],
        discards: [],
        seatWind: "east",
        isAi: true,
        connected: true,
        riichiDeclared: false,
        riichiAccepted: false,
        ippatsu: false
      },
      [
        { actorSeat: 0, type: "pon", tile: "6z", fromSeat: 2, label: "碰 發" },
        { actorSeat: 0, type: "pass", tile: "6z", fromSeat: 2, label: "略過" }
      ],
      "east",
      50
    );

    expect(chosen.type).toBe("pon");
  });

  it("副露收益不足時應略過，不要為副露而副露", async () => {
    const ai = new RuleBasedAi();
    const chosen = await ai.chooseAction(
      {
        seat: 1,
        id: "ai-2",
        name: "電腦二號",
        score: 25000,
        hand: ["2m", "3m", "4m", "6m", "7m", "8m", "2p", "3p", "4p", "5s", "6s", "7s", "9s"],
        melds: [],
        discards: [],
        seatWind: "south",
        isAi: true,
        connected: true,
        riichiDeclared: false,
        riichiAccepted: false,
        ippatsu: false
      },
      [
        { actorSeat: 1, type: "pon", tile: "9s", fromSeat: 3, label: "碰 九索" },
        { actorSeat: 1, type: "pass", tile: "9s", fromSeat: 3, label: "略過" }
      ],
      "east",
      46
    );

    expect(chosen.type).toBe("pass");
  });
});
