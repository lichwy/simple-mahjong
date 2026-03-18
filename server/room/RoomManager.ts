import crypto from "node:crypto";
import type WebSocket from "ws";
import type {
  ActionOption,
  RoomSettings,
  LobbySeat,
  PublicGameState,
  RoomSummary,
  ServerMessage
} from "../../shared/types.js";
import { DiscardAdvisor } from "../ai/DiscardAdvisor.js";
import { OpenAiMahjongAi } from "../ai/OpenAiMahjongAi.js";
import { MatchEngine } from "../game/MatchEngine.js";

interface SeatAssignment {
  seat: number;
  playerId: string;
  name: string;
  isAi: boolean;
  connected: boolean;
}

interface RoomRecord {
  id: string;
  hostId: string;
  seats: Array<SeatAssignment | null>;
  settings: RoomSettings;
  match: MatchEngine | null;
  aiTimer: NodeJS.Timeout | null;
}

const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  aiClaimAggression: "balanced"
};

function roomCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly playerSockets = new Map<string, WebSocket>();
  private readonly playerRooms = new Map<string, string>();
  private readonly ai = new OpenAiMahjongAi();
  private readonly advisor = new DiscardAdvisor();
  private readonly gameStateSequenceByPlayer = new Map<string, number>();

  attachSocket(playerId: string, socket: WebSocket): void {
    this.playerSockets.set(playerId, socket);
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) {
      return;
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const seat = room.seats.find((item) => item?.playerId === playerId);
    if (seat) {
      seat.connected = true;
    }
    room.match?.setConnection(playerId, true);
    this.broadcastRoomState(room);
    this.broadcastGameState(room);
  }

  detachSocket(playerId: string): void {
    this.playerSockets.delete(playerId);
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) {
      return;
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const seat = room.seats.find((item) => item?.playerId === playerId);
    if (seat) {
      seat.connected = false;
    }
    room.match?.setConnection(playerId, false);
    this.broadcastRoomState(room);
    this.broadcastGameState(room);
    this.clearAiTimer(room);
    if (room.match?.phase && room.match.phase !== "waiting") {
      this.scheduleAiStep(room, 900);
    }
  }

  createRoom(playerId: string, playerName: string): RoomRecord {
    this.leaveCurrentLobbyRoom(playerId);
    const existingRoomId = this.playerRooms.get(playerId);
    if (existingRoomId) {
      const existing = this.rooms.get(existingRoomId);
      if (existing) {
        return existing;
      }
    }
    let id = roomCode();
    while (this.rooms.has(id)) {
      id = roomCode();
    }
    const room: RoomRecord = {
      id,
      hostId: playerId,
      seats: [
        { seat: 0, playerId, name: playerName || "玩家一", isAi: false, connected: true },
        null,
        null,
        null
      ],
      settings: { ...DEFAULT_ROOM_SETTINGS },
      match: null,
      aiTimer: null
    };
    this.rooms.set(id, room);
    this.playerRooms.set(playerId, id);
    this.broadcastRoomState(room);
    return room;
  }

  joinRoom(playerId: string, playerName: string, roomId: string): RoomRecord {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) {
      throw new Error("找不到房間。");
    }
    const existingSeat = room.seats.find((item) => item?.playerId === playerId);
    if (existingSeat) {
      existingSeat.connected = true;
      existingSeat.name = playerName || existingSeat.name;
      this.playerRooms.set(playerId, room.id);
      room.match?.setConnection(playerId, true);
      this.broadcastRoomState(room);
      this.broadcastGameState(room);
      return room;
    }
    this.leaveCurrentLobbyRoom(playerId, room.id);
    if (room.match) {
      throw new Error("牌局已開始，無法以新身分加入。");
    }
    const seatIndex = room.seats.findIndex((seat) => seat === null);
    if (seatIndex < 0) {
      throw new Error("房間已滿。");
    }
    room.seats[seatIndex] = {
      seat: seatIndex,
      playerId,
      name: playerName || `玩家${seatIndex + 1}`,
      isAi: false,
      connected: true
    };
    this.playerRooms.set(playerId, room.id);
    this.broadcastRoomState(room);
    return room;
  }

  addAi(playerId: string, roomId: string): RoomRecord {
    const room = this.requireRoom(roomId);
    if (room.hostId !== playerId) {
      throw new Error("只有房主可以加入 AI。");
    }
    if (room.match) {
      throw new Error("牌局開始後不能再加入 AI。");
    }
    const seatIndex = room.seats.findIndex((seat) => seat === null);
    if (seatIndex < 0) {
      throw new Error("房間已滿。");
    }
    room.seats[seatIndex] = {
      seat: seatIndex,
      playerId: `ai-${crypto.randomUUID()}`,
      name: `電腦${seatIndex + 1}`,
      isAi: true,
      connected: true
    };
    this.broadcastRoomState(room);
    return room;
  }

  updateRoomSettings(playerId: string, roomId: string, settings: Partial<RoomSettings>): RoomRecord {
    const room = this.requireRoom(roomId);
    const seat = room.seats.find((item) => item?.playerId === playerId);
    if (!seat || seat.isAi) {
      throw new Error("只有房間中的真人玩家可以調整遊戲設定。");
    }
    room.settings = {
      ...room.settings,
      ...settings
    };
    room.match?.setRoomSettings(room.settings);
    this.broadcastRoomState(room);
    return room;
  }

  startGame(playerId: string, roomId: string): RoomRecord {
    const room = this.requireRoom(roomId);
    if (room.hostId !== playerId) {
      throw new Error("只有房主可以開始遊戲。");
    }
    if (room.match) {
      return room;
    }
    for (let seat = 0; seat < 4; seat += 1) {
      if (!room.seats[seat]) {
        room.seats[seat] = {
          seat,
          playerId: `ai-${crypto.randomUUID()}`,
          name: `電腦${seat + 1}`,
          isAi: true,
          connected: true
        };
      }
    }
    room.match = new MatchEngine(
      room.id,
      room.seats
        .filter((seat): seat is SeatAssignment => Boolean(seat))
        .map((seat) => ({
          seat: seat.seat,
          id: seat.playerId,
          name: seat.name,
          isAi: seat.isAi,
          connected: seat.connected
        }))
    );
    room.match.setRoomSettings(room.settings);
    this.broadcastRoomState(room);
    this.broadcastGameState(room);
    return room;
  }

  beginHand(playerId: string, roomId: string): RoomRecord {
    const room = this.requireRoom(roomId);
    if (room.hostId !== playerId) {
      throw new Error("只有房主可以開始本局。");
    }
    if (!room.match) {
      throw new Error("請先建立牌桌。");
    }
    if (room.match.phase !== "waiting") {
      return room;
    }
    room.match.startMatch();
    this.broadcastRoomState(room);
    this.broadcastGameState(room);
    this.scheduleAiStep(room, 900);
    return room;
  }

  requestState(playerId: string, roomId: string): void {
    const room = this.requireRoom(roomId);
    this.sendToPlayer(playerId, { type: "room_state", room: this.toRoomSummary(room) });
    if (room.match) {
      void this.sendLatestGameState(room, playerId);
    }
  }

  leaveRoom(playerId: string, roomId?: string): void {
    const currentRoomId = roomId?.toUpperCase() || this.playerRooms.get(playerId);
    if (!currentRoomId) {
      this.sendToPlayer(playerId, {
        type: "left_room",
        roomId: "",
        message: "目前不在任何房間。"
      });
      return;
    }
    const room = this.rooms.get(currentRoomId);
    if (!room) {
      this.playerRooms.delete(playerId);
      this.sendToPlayer(playerId, {
        type: "left_room",
        roomId: currentRoomId,
        message: "已清除舊房間狀態。"
      });
      return;
    }

    const seatIndex = room.seats.findIndex((seat) => seat?.playerId === playerId);
    if (seatIndex < 0) {
      this.playerRooms.delete(playerId);
      this.sendToPlayer(playerId, {
        type: "left_room",
        roomId: room.id,
        message: "你已不在該房間中。"
      });
      return;
    }

    if (room.match && room.match.phase !== "waiting" && room.match.phase !== "matchComplete") {
      const aiId = `ai-${crypto.randomUUID()}`;
      const aiName = `接手AI${seatIndex + 1}`;
      room.seats[seatIndex] = {
        seat: seatIndex,
        playerId: aiId,
        name: aiName,
        isAi: true,
        connected: true
      };
      room.match.replacePlayerWithAi(playerId, aiId, aiName);
      room.match.setConnection(playerId, false);
      this.reassignHost(room, playerId);
      this.playerRooms.delete(playerId);
      this.sendToPlayer(playerId, {
        type: "left_room",
        roomId: room.id,
        message: "你已退出房間，座位已由 AI 接手。"
      });
      this.broadcastRoomState(room);
      this.broadcastGameState(room);
      if (room.seats.every((seat) => seat === null || seat.isAi)) {
        this.clearAiTimer(room);
        this.rooms.delete(room.id);
        return;
      }
      this.clearAiTimer(room);
      this.scheduleAiStep(room, 900);
      return;
    }

    if (room.match?.phase === "matchComplete") {
      room.match = null;
    }
    room.seats[seatIndex] = null;
    this.reassignHost(room, playerId);
    this.playerRooms.delete(playerId);
    this.sendToPlayer(playerId, {
      type: "left_room",
      roomId: room.id,
      message: "已退出房間。"
    });

    if (room.seats.every((seat) => seat === null || seat.isAi)) {
      this.clearAiTimer(room);
      this.rooms.delete(room.id);
      return;
    }
    this.broadcastRoomState(room);
  }

  handleAction(playerId: string, roomId: string, action: ActionOption): void {
    const room = this.requireRoom(roomId);
    if (!room.match) {
      throw new Error("牌局尚未開始。");
    }
    room.match.handleAction(playerId, action);
    this.broadcastGameState(room);
    this.processPostAction(room);
  }

  continueAfterHand(playerId: string, roomId: string): void {
    const room = this.requireRoom(roomId);
    if (!room.match) {
      throw new Error("牌局尚未開始。");
    }
    const advanced = room.match.markPlayerReadyForNextHand(playerId);
    this.broadcastRoomState(room);
    this.broadcastGameState(room);
    if (advanced && room.match.phase !== "matchComplete") {
      this.scheduleAiStep(room, 900);
    }
  }

  private processPostAction(room: RoomRecord): void {
    if (!room.match) {
      return;
    }
    this.clearAiTimer(room);
    if (room.match.phase === "matchComplete") {
      this.broadcastGameState(room);
    } else if (room.match.phase !== "handComplete") {
      this.scheduleAiStep(room, 900);
    }
  }

  private clearAiTimer(room: RoomRecord): void {
    if (room.aiTimer) {
      clearTimeout(room.aiTimer);
      room.aiTimer = null;
    }
  }

  private scheduleAiStep(room: RoomRecord, delayMs: number): void {
    if (room.aiTimer) {
      return;
    }
    room.aiTimer = setTimeout(() => {
      room.aiTimer = null;
      void this.drainAi(room);
    }, delayMs);
  }

  private async drainAi(room: RoomRecord): Promise<void> {
    if (!room.match) {
      return;
    }
    const acted = await room.match.runAiStep(this.ai, room.settings.aiClaimAggression);
    if (acted) {
      this.broadcastRoomState(room);
      this.broadcastGameState(room);
      if (room.match.phase !== "matchComplete") {
        this.scheduleAiStep(room, 900);
      }
    }
  }

  private requireRoom(roomId: string): RoomRecord {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) {
      throw new Error("找不到房間。");
    }
    return room;
  }

  private leaveCurrentLobbyRoom(playerId: string, nextRoomId?: string): void {
    const currentRoomId = this.playerRooms.get(playerId);
    if (!currentRoomId || currentRoomId === nextRoomId) {
      return;
    }
    const currentRoom = this.rooms.get(currentRoomId);
    if (!currentRoom) {
      this.playerRooms.delete(playerId);
      return;
    }
    if (currentRoom.match && currentRoom.match.phase !== "matchComplete") {
      throw new Error("你已在其他房間的牌局中，請回原房間重連。");
    }
    if (currentRoom.match?.phase === "matchComplete") {
      currentRoom.match = null;
    }

    const seatIndex = currentRoom.seats.findIndex((seat) => seat?.playerId === playerId);
    if (seatIndex >= 0) {
      currentRoom.seats[seatIndex] = null;
    }
    if (currentRoom.hostId === playerId) {
      const nextHost = currentRoom.seats.find((seat): seat is SeatAssignment => Boolean(seat) && !seat.isAi);
      if (nextHost) {
        currentRoom.hostId = nextHost.playerId;
      }
    }
    this.playerRooms.delete(playerId);

    if (currentRoom.seats.every((seat) => seat === null || seat.isAi)) {
      this.clearAiTimer(currentRoom);
      this.rooms.delete(currentRoomId);
      return;
    }
    this.broadcastRoomState(currentRoom);
  }

  private reassignHost(room: RoomRecord, previousHostId: string): void {
    if (room.hostId !== previousHostId) {
      return;
    }
    const nextHuman = room.seats.find((seat): seat is SeatAssignment => Boolean(seat) && !seat.isAi);
    if (nextHuman) {
      room.hostId = nextHuman.playerId;
      return;
    }
    const nextSeat = room.seats.find((seat): seat is SeatAssignment => Boolean(seat));
    room.hostId = nextSeat?.playerId ?? previousHostId;
  }

  private toRoomSummary(room: RoomRecord): RoomSummary {
    const seats: LobbySeat[] = room.seats.map((seat, index) => ({
      seat: index,
      playerId: seat?.playerId ?? null,
      name: seat?.name ?? null,
      isAi: seat?.isAi ?? false,
      connected: seat?.connected ?? false,
      occupied: Boolean(seat)
    }));
    return {
      roomId: room.id,
      hostId: room.hostId,
      tableReady: Boolean(room.match),
      started: Boolean(room.match && room.match.phase !== "waiting"),
      settings: room.settings,
      seats
    };
  }

  private broadcastRoomState(room: RoomRecord): void {
    this.broadcastToRoom(room, { type: "room_state", room: this.toRoomSummary(room) });
  }

  private broadcastGameState(room: RoomRecord): void {
    if (!room.match) {
      return;
    }
    for (const seat of room.seats) {
      if (!seat || seat.isAi) {
        continue;
      }
      void this.sendLatestGameState(room, seat.playerId);
    }
  }

  private async sendLatestGameState(room: RoomRecord, playerId: string): Promise<void> {
    if (!room.match) {
      return;
    }
    const sequence = (this.gameStateSequenceByPlayer.get(playerId) ?? 0) + 1;
    this.gameStateSequenceByPlayer.set(playerId, sequence);
    const baseState = room.match.getPublicState(playerId);
    const recommendation = await this.advisor.suggest(baseState);
    if (this.gameStateSequenceByPlayer.get(playerId) !== sequence) {
      return;
    }
    const state: PublicGameState = {
      ...baseState,
      recommendation
    };
    this.sendToPlayer(playerId, {
      type: "game_state",
      roomId: room.id,
      state
    });
  }

  private broadcastToRoom(room: RoomRecord, message: ServerMessage): void {
    for (const seat of room.seats) {
      if (!seat || seat.isAi) {
        continue;
      }
      this.sendToPlayer(seat.playerId, message);
    }
  }

  sendToPlayer(playerId: string, message: ServerMessage): void {
    const socket = this.playerSockets.get(playerId);
    if (!socket || socket.readyState !== 1) {
      return;
    }
    socket.send(JSON.stringify(message));
  }
}
