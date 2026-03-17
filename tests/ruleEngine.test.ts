import { describe, expect, it } from "vitest";
import { RuleEngine } from "../server/game/RuleEngine.js";
import type { Tile } from "../shared/types.js";

describe("RuleEngine", () => {
  it("可判定基本胡牌", () => {
    const engine = new RuleEngine();
    const concealedTiles: Tile[] = [
      "2m",
      "3m",
      "4m",
      "2p",
      "3p",
      "4p",
      "3s",
      "4s",
      "5s",
      "6s",
      "7s",
      "8s",
      "5p",
      "5p"
    ];

    const result = engine.evaluateWin(
      {
        concealedTiles,
        melds: [],
        seatWind: "east",
        roundWind: "east",
        riichiAccepted: false,
        ippatsu: false,
        winType: "tsumo",
        winningTile: "8s",
        doraIndicators: []
      },
      0,
      null,
      0
    );

    expect(result).not.toBeNull();
    expect(result?.yaku).toContain("基本胡牌");
    expect(result?.han).toBe(1);
  });

  it("可判定七對子", () => {
    const engine = new RuleEngine();
    const concealedTiles: Tile[] = [
      "1m",
      "1m",
      "2m",
      "2m",
      "3p",
      "3p",
      "4p",
      "4p",
      "5s",
      "5s",
      "6s",
      "6s",
      "5z",
      "5z"
    ];
    const result = engine.evaluateWin(
      {
        concealedTiles,
        melds: [],
        seatWind: "south",
        roundWind: "east",
        riichiAccepted: false,
        ippatsu: false,
        winType: "ron",
        winningTile: "5z",
        doraIndicators: []
      },
      1,
      0,
      0
    );

    expect(result).not.toBeNull();
    expect(result?.yaku).toContain("七對子");
    expect(result?.han).toBe(1);
  });

  it("有兩張相同牌時應提示可碰", () => {
    const engine = new RuleEngine();
    const actions = engine.getClaimActions(
      {
        seat: 0,
        id: "p1",
        name: "玩家",
        score: 25000,
        hand: ["3m", "3m", "4m", "5m", "6m", "7m", "8m", "2p", "3p", "4p", "5s", "5s", "9s"],
        melds: [],
        discards: [],
        seatWind: "east",
        isAi: false,
        connected: true,
        riichiDeclared: false,
        riichiAccepted: false,
        ippatsu: false
      },
      "east",
      [],
      0,
      "3m",
      2,
      false
    );

    expect(actions.some((action) => action.type === "pon")).toBe(true);
    expect(actions.some((action) => action.type === "pass")).toBe(true);
  });

  it("上家打牌時應提示可吃", () => {
    const engine = new RuleEngine();
    const actions = engine.getClaimActions(
      {
        seat: 1,
        id: "p2",
        name: "玩家",
        score: 25000,
        hand: ["2m", "3m", "4p", "5p", "6p", "7s", "7s", "8s", "8s", "1z", "1z", "5z", "6z"],
        melds: [],
        discards: [],
        seatWind: "south",
        isAi: false,
        connected: true,
        riichiDeclared: false,
        riichiAccepted: false,
        ippatsu: false
      },
      "east",
      [],
      0,
      "1m",
      0,
      true
    );

    expect(actions.some((action) => action.type === "chi")).toBe(true);
    expect(actions.some((action) => action.type === "pass")).toBe(true);
  });

  it("非上家打牌時不應提示可吃", () => {
    const engine = new RuleEngine();
    const actions = engine.getClaimActions(
      {
        seat: 2,
        id: "p3",
        name: "玩家",
        score: 25000,
        hand: ["2m", "3m", "4p", "5p", "6p", "7s", "7s", "8s", "8s", "1z", "1z", "5z", "6z"],
        melds: [],
        discards: [],
        seatWind: "west",
        isAi: false,
        connected: true,
        riichiDeclared: false,
        riichiAccepted: false,
        ippatsu: false
      },
      "east",
      [],
      0,
      "1m",
      0,
      false
    );

    expect(actions.some((action) => action.type === "chi")).toBe(false);
  });

  it("手上四張相同牌時應提示可暗槓", () => {
    const engine = new RuleEngine();
    const actions = engine.getSelfActions(
      {
        seat: 0,
        id: "p1",
        name: "玩家",
        score: 25000,
        hand: ["5p", "5p", "5p", "5p", "2m", "3m", "4m", "3s", "4s", "5s", "6s", "7s", "8s", "9s"],
        melds: [],
        discards: [],
        seatWind: "east",
        isAi: false,
        connected: true,
        riichiDeclared: false,
        riichiAccepted: false,
        ippatsu: false
      },
      "east",
      [],
      0,
      "9s"
    );

    expect(actions.some((action) => action.type === "concealedKan" && action.tile === "5p")).toBe(true);
  });

  it("碰牌後仍可用基本牌型胡牌", () => {
    const engine = new RuleEngine();
    const result = engine.evaluateWin(
      {
        concealedTiles: ["2m", "3m", "4m", "2p", "3p", "4p", "7s", "8s", "9s", "5z", "5z"],
        melds: [
          {
            type: "pon",
            tiles: ["1m", "1m", "1m"],
            calledTile: "1m",
            fromSeat: 1,
            open: true
          }
        ],
        seatWind: "east",
        roundWind: "east",
        riichiAccepted: false,
        ippatsu: false,
        winType: "ron",
        winningTile: "5z",
        doraIndicators: []
      },
      0,
      1,
      0
    );

    expect(result).not.toBeNull();
    expect(result?.yaku).toContain("基本胡牌");
  });
});
