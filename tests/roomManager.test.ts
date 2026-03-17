import { describe, expect, it } from "vitest";
import { RoomManager } from "../server/room/RoomManager.js";

describe("RoomManager", () => {
  it("完成對局後可重新建立房間", () => {
    const manager = new RoomManager();
    const room = manager.createRoom("player-1", "房主");
    manager.addAi("player-1", room.id);
    manager.addAi("player-1", room.id);
    manager.addAi("player-1", room.id);
    manager.startGame("player-1", room.id);

    const record = (manager as unknown as { rooms: Map<string, { match: { phase: string } | null }> }).rooms.get(room.id);
    if (!record?.match) {
      throw new Error("應該已建立牌局。");
    }
    record.match.phase = "matchComplete";

    const nextRoom = manager.createRoom("player-1", "房主");
    expect(nextRoom.id).not.toBe(room.id);
  });

  it("開局後應保留真人玩家 id 供手牌同步使用", () => {
    const manager = new RoomManager();
    const room = manager.createRoom("player-host", "房主");
    manager.addAi("player-host", room.id);
    manager.addAi("player-host", room.id);
    manager.addAi("player-host", room.id);
    manager.startGame("player-host", room.id);

    const record = (manager as unknown as { rooms: Map<string, { match: { players: Array<{ id: string }> } | null }> }).rooms.get(room.id);
    expect(record?.match?.players[0]?.id).toBe("player-host");
  });

  it("進行中的牌局退出後應由 AI 接手且可再建新房間", () => {
    const manager = new RoomManager();
    const room = manager.createRoom("player-host", "房主");
    manager.addAi("player-host", room.id);
    manager.addAi("player-host", room.id);
    manager.addAi("player-host", room.id);
    manager.startGame("player-host", room.id);
    manager.beginHand("player-host", room.id);

    manager.leaveRoom("player-host", room.id);

    const record = (
      manager as unknown as {
        rooms: Map<string, { seats: Array<{ isAi: boolean; name: string } | null>; match: { players: Array<{ isAi: boolean; name: string }> } | null }>;
      }
    ).rooms.get(room.id);

    expect(record?.seats[0]?.isAi).toBe(true);
    expect(record?.match?.players[0]?.isAi).toBe(true);
    expect(record?.match?.players[0]?.name).toContain("接手AI");

    const nextRoom = manager.createRoom("player-host", "新房主");
    expect(nextRoom.id).not.toBe(room.id);
  });
});
