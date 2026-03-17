import { describe, expect, it } from "vitest";
import { MatchEngine } from "../server/game/MatchEngine.js";

describe("MatchEngine", () => {
  it("開局後應進入可打牌狀態", () => {
    const match = new MatchEngine("ROOM1", [
      { seat: 0, id: "p1", name: "甲", isAi: false, connected: true },
      { seat: 1, id: "p2", name: "乙", isAi: true, connected: true },
      { seat: 2, id: "p3", name: "丙", isAi: true, connected: true },
      { seat: 3, id: "p4", name: "丁", isAi: true, connected: true }
    ]);

    match.startMatch();
    const state = match.getPublicState("p1");

    expect(state.phase).toBe("awaitingDiscard");
    expect(state.viewerSeat).toBe(0);
    expect(state.viewerDrawTile).not.toBeNull();
    expect(state.players[0].hand.length).toBe(14);
    expect(state.players[1].handCount).toBe(13);
    expect(state.doraIndicators.length).toBe(1);
    expect(state.legalActions.some((action) => action.type === "discard")).toBe(true);
  });

  it("結算階段不應等待斷線真人按繼續", () => {
    const match = new MatchEngine("ROOM2", [
      { seat: 0, id: "p1", name: "甲", isAi: false, connected: true },
      { seat: 1, id: "p2", name: "乙", isAi: false, connected: true },
      { seat: 2, id: "p3", name: "丙", isAi: true, connected: true },
      { seat: 3, id: "p4", name: "丁", isAi: true, connected: true }
    ]);

    match.startMatch();
    (match as unknown as { phase: string; result: { tenpaiSeats: number[] } | null; nextHandReadySeats: Set<number> }).phase = "handComplete";
    (match as unknown as { result: { tenpaiSeats: number[] } | null }).result = { tenpaiSeats: [] };
    (match as unknown as { nextHandReadySeats: Set<number> }).nextHandReadySeats = new Set([2, 3]);

    match.setConnection("p2", false);
    const advanced = match.markPlayerReadyForNextHand("p1");

    expect(advanced).toBe(true);
    expect(match.phase).toBe("awaitingDiscard");
  });
});
