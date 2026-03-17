import type {
  ActionOption,
  AiInsight,
  DiscardTile,
  GamePhase,
  HandResult,
  LobbySeat,
  Meld,
  PlayerRuntimeState,
  PublicGameState,
  RoomSummary,
  RyukyokuResult,
  Tile,
  Wind
} from "../../shared/types.js";
import { WINDS } from "../../shared/types.js";
import { sortTiles, tileToText } from "../../shared/tileUtils.js";
import { RuleBasedAi } from "../ai/RuleBasedAi.js";
import { RuleEngine } from "./RuleEngine.js";
import { TileWall } from "./TileWall.js";

interface PendingClaims {
  tile: Tile;
  fromSeat: number;
  actionsBySeat: Map<number, ActionOption[]>;
  responses: Map<number, ActionOption>;
}

interface MatchPlayerConfig {
  seat: number;
  id: string;
  name: string;
  isAi: boolean;
  connected: boolean;
}

const AVATAR_KEYS = ["avatar-cat-east", "avatar-cat-south", "avatar-cat-west", "avatar-cat-north"] as const;

function shuffledAvatarKeys(): string[] {
  const keys = [...AVATAR_KEYS];
  for (let index = keys.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [keys[index], keys[swapIndex]] = [keys[swapIndex], keys[index]];
  }
  return keys;
}

function removeTiles(hand: Tile[], tiles: Tile[]): Tile[] {
  const next = [...hand];
  for (const tile of tiles) {
    const index = next.indexOf(tile);
    if (index < 0) {
      throw new Error(`手牌不足，無法移除 ${tile}`);
    }
    next.splice(index, 1);
  }
  return next;
}

function relativeSeatOrder(fromSeat: number, targetSeat: number): number {
  return (targetSeat - fromSeat + 4) % 4;
}

function actionPriority(type: ActionOption["type"]): number {
  if (type === "ron") {
    return 2;
  }
  if (type === "pon") {
    return 1;
  }
  return 0;
}

function nextSeat(seat: number): number {
  return (seat + 1) % 4;
}

export class MatchEngine {
  readonly roomId: string;
  readonly players: PlayerRuntimeState[];
  readonly ruleEngine: RuleEngine;
  phase: GamePhase = "waiting";
  roundWind: Wind = "east";
  handIndex = 1;
  dealerSeat = 0;
  honba = 0;
  riichiSticks = 0;
  currentTurnSeat = 0;
  currentDrawSeat: number | null = null;
  currentDrawTile: Tile | null = null;
  latestDiscard: { seat: number; tile: Tile } | null = null;
  latestClaim: { seat: number; type: "chi" | "pon" | "kan"; seq: number } | null = null;
  private claimSeq = 0;
  pendingClaims: PendingClaims | null = null;
  wall: TileWall | null = null;
  result: HandResult | RyukyokuResult | null = null;
  logs: string[] = [];
  aiInsights = new Map<number, AiInsight>();
  private nextHandReadySeats = new Set<number>();

  private requiresContinueConfirmation(player: PlayerRuntimeState): boolean {
    return !player.isAi && player.connected;
  }

  private canAdvanceToNextHand(): boolean {
    return this.players.every((item) => !this.requiresContinueConfirmation(item) || this.nextHandReadySeats.has(item.seat));
  }

  constructor(roomId: string, seats: MatchPlayerConfig[]) {
    this.roomId = roomId;
    this.ruleEngine = new RuleEngine();
    const avatarKeys = shuffledAvatarKeys();
    this.players = seats.map((seat) => ({
      seat: seat.seat,
      id: seat.id,
      name: seat.name,
      avatarKey: avatarKeys[seat.seat] ?? AVATAR_KEYS[seat.seat],
      score: 25000,
      hand: [],
      melds: [],
      discards: [],
      seatWind: "east",
      isAi: seat.isAi,
      connected: seat.connected,
      riichiDeclared: false,
      riichiAccepted: false,
      ippatsu: false
    }));
    this.recalculateSeatWinds();
  }

  get roomSummary(): RoomSummary {
    return {
      roomId: this.roomId,
      hostId: this.players[0]?.id ?? "",
      tableReady: true,
      started: this.phase !== "waiting",
      seats: this.players.map((player): LobbySeat => ({
        seat: player.seat,
        playerId: player.id,
        name: player.name,
        isAi: player.isAi,
        connected: player.connected,
        occupied: true
      }))
    };
  }

  startMatch(): void {
    this.handIndex = 1;
    this.dealerSeat = 0;
    this.roundWind = "east";
    this.honba = 0;
    this.riichiSticks = 0;
    this.logs = [];
    for (const player of this.players) {
      player.score = 25000;
    }
    this.startHand();
  }

  setConnection(playerId: string, connected: boolean): void {
    const player = this.players.find((item) => item.id === playerId);
    if (player) {
      player.connected = connected;
      if (!connected && this.phase === "handComplete") {
        this.nextHandReadySeats.add(player.seat);
        if (this.canAdvanceToNextHand()) {
          this.startNextHand();
        }
      }
    }
  }

  replacePlayerWithAi(playerId: string, aiId: string, aiName: string): number | null {
    const player = this.players.find((item) => item.id === playerId);
    if (!player) {
      return null;
    }
    player.id = aiId;
    player.name = aiName;
    player.isAi = true;
    player.connected = false;
    if (this.phase === "handComplete") {
      this.nextHandReadySeats.add(player.seat);
    }
    return player.seat;
  }

  startNextHand(): void {
    if (this.phase === "matchComplete") {
      return;
    }
    if (this.handIndex >= 4) {
      this.phase = "matchComplete";
      this.logs.push("東風戰結束。");
      return;
    }
    this.handIndex += 1;
    this.dealerSeat = nextSeat(this.dealerSeat);
    this.recalculateSeatWinds();
    this.startHand();
  }

  markPlayerReadyForNextHand(playerId: string): boolean {
    if (this.phase !== "handComplete") {
      return false;
    }
    const player = this.players.find((item) => item.id === playerId);
    if (!player) {
      throw new Error("找不到玩家。");
    }
    this.nextHandReadySeats.add(player.seat);
    if (this.canAdvanceToNextHand()) {
      this.startNextHand();
      return true;
    }
    return false;
  }

  private startHand(): void {
    this.result = null;
    this.pendingClaims = null;
    this.wall = new TileWall();
    this.latestDiscard = null;
    this.aiInsights.clear();
    this.nextHandReadySeats.clear();
    this.phase = "awaitingDiscard";

    for (const player of this.players) {
      player.hand = [];
      player.melds = [];
      player.discards = [];
      player.riichiDeclared = false;
      player.riichiAccepted = false;
      player.ippatsu = false;
    }

    if (!this.wall) {
      throw new Error("牌山建立失敗。");
    }
    for (let round = 0; round < 13; round += 1) {
      for (const player of this.players) {
        player.hand.push(this.wall.draw());
      }
    }
    for (const player of this.players) {
      player.hand = sortTiles(player.hand);
    }

    this.currentTurnSeat = this.dealerSeat;
    this.drawForSeat(this.dealerSeat, false);
    this.logs.push(`開始 ${this.roundLabel()}。莊家為 ${this.players[this.dealerSeat].name}。`);
  }

  private roundLabel(): string {
    return `東${this.handIndex}局`;
  }

  private recalculateSeatWinds(): void {
    for (const player of this.players) {
      player.seatWind = WINDS[(player.seat - this.dealerSeat + 4) % 4];
    }
  }

  private drawForSeat(seat: number, replacement: boolean): void {
    if (!this.wall) {
      throw new Error("沒有牌山。");
    }
    const tile = replacement ? this.wall.drawReplacement() : this.wall.draw();
    const player = this.players[seat];
    player.hand = sortTiles([...player.hand, tile]);
    this.currentTurnSeat = seat;
    this.currentDrawSeat = seat;
    this.currentDrawTile = tile;
    this.phase = "awaitingDiscard";
    this.logs.push(`${player.name}${replacement ? "嶺上摸牌" : "摸牌"}。`);
  }

  private getSelfActionsForSeat(seat: number): ActionOption[] {
    const player = this.players[seat];
    if (this.phase !== "awaitingDiscard") {
      return [];
    }
    if (this.currentTurnSeat !== seat) {
      return [];
    }
    const winningTile = this.currentDrawTile ?? player.hand[player.hand.length - 1];
    const actions = this.currentDrawSeat === seat
      ? this.ruleEngine.getSelfActions(player, this.roundWind, this.wall?.doraIndicators ?? [], this.dealerSeat, winningTile)
      : this.ruleEngine.getDiscardActions(player);
    return actions;
  }

  private getClaimActionsForSeat(seat: number, tile: Tile, fromSeat: number): ActionOption[] {
    const player = this.players[seat];
    return this.ruleEngine.getClaimActions(
      player,
      this.roundWind,
      this.wall?.doraIndicators ?? [],
      this.dealerSeat,
      tile,
      fromSeat,
      seat === nextSeat(fromSeat)
    );
  }

  getLegalActionsForPlayer(playerId: string): ActionOption[] {
    const player = this.players.find((item) => item.id === playerId);
    if (!player) {
      return [];
    }
    if (this.pendingClaims) {
      return this.pendingClaims.actionsBySeat.get(player.seat) ?? [];
    }
    return this.getSelfActionsForSeat(player.seat);
  }

  getPublicState(playerId: string): PublicGameState {
    const player = this.players.find((item) => item.id === playerId);
    const viewerSeat = player?.seat ?? -1;
    const revealAllHands = Boolean(this.result);
    return {
      roomId: this.roomId,
      phase: this.phase,
      viewerSeat: player?.seat ?? null,
      viewerDrawTile: this.currentDrawSeat === player?.seat ? this.currentDrawTile : null,
      players: this.players.map((item) => ({
        seat: item.seat,
        id: item.id,
        name: item.name,
        avatarKey: item.avatarKey,
        score: item.score,
        handCount: item.hand.length,
        hand: item.seat === viewerSeat || revealAllHands ? sortTiles(item.hand) : [],
        melds: item.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
        discards: item.discards.map((discard) => ({ ...discard })),
        seatWind: item.seatWind,
        isAi: item.isAi,
        connected: item.connected,
        riichiDeclared: item.riichiDeclared,
        riichiAccepted: item.riichiAccepted
      })),
      round: {
        roundWind: this.roundWind,
        handIndex: this.handIndex,
        dealerSeat: this.dealerSeat,
        riichiSticks: this.riichiSticks,
        honba: this.honba
      },
      wallTilesRemaining: this.wall?.totalRemaining ?? 0,
      liveWallTilesRemaining: this.wall?.liveCount ?? 0,
      doraIndicators: this.wall?.doraIndicators ?? [],
      currentTurnSeat: this.currentTurnSeat,
      currentDrawSeat: this.currentDrawSeat,
      latestDiscard: this.latestDiscard,
      latestClaim: this.latestClaim,
      pendingClaimSeats: this.pendingClaims ? [...this.pendingClaims.actionsBySeat.keys()] : [],
      awaitingNextHand: this.phase === "handComplete",
      nextHandReadySeats: [...this.nextHandReadySeats].sort((left, right) => left - right),
      nextHandPendingSeats: this.players
        .filter((item) => this.requiresContinueConfirmation(item) && !this.nextHandReadySeats.has(item.seat))
        .map((item) => item.seat)
        .sort((left, right) => left - right),
      legalActions: this.getLegalActionsForPlayer(playerId),
      aiInsights: [...this.aiInsights.values()].sort((left, right) => left.seat - right.seat),
      recommendation: null,
      logs: this.logs.slice(-16),
      result: this.result
    };
  }

  private markLatestDiscardCalled(): void {
    if (!this.latestDiscard) {
      return;
    }
    const discards = this.players[this.latestDiscard.seat].discards;
    const discard = discards[discards.length - 1];
    if (discard) {
      discard.called = true;
    }
  }

  private advanceAfterNoClaim(): void {
    if (!this.wall) {
      throw new Error("牌山不存在。");
    }
    if (this.wall.liveCount <= 0) {
      this.finishRyukyoku();
      return;
    }
    this.currentTurnSeat = nextSeat(this.currentTurnSeat);
    this.drawForSeat(this.currentTurnSeat, false);
  }

  private finishWin(
    winnerSeat: number,
    winType: "ron" | "tsumo",
    winningTile: Tile,
    loserSeat: number | null
  ): void {
    const player = this.players[winnerSeat];
    const evaluation = this.ruleEngine.evaluateWin(
      {
        concealedTiles: winType === "ron" ? sortTiles([...player.hand, winningTile]) : sortTiles(player.hand),
        melds: player.melds,
        seatWind: player.seatWind,
        roundWind: this.roundWind,
        riichiAccepted: player.riichiAccepted,
        ippatsu: player.ippatsu,
        winType,
        winningTile,
        doraIndicators: this.wall?.doraIndicators ?? []
      },
      winnerSeat,
      loserSeat,
      this.dealerSeat
    );
    if (!evaluation) {
      throw new Error("和牌驗證失敗。");
    }
    for (let seat = 0; seat < 4; seat += 1) {
      this.players[seat].score += evaluation.payments[seat];
    }
    this.players[winnerSeat].score += this.riichiSticks * 1000;
    const totalPoints = evaluation.totalPoints + this.riichiSticks * 1000;
    this.result = {
      winnerSeat,
      loserSeat: loserSeat ?? undefined,
      winType,
      winningTile,
      han: evaluation.han,
      fu: evaluation.fu,
      totalPoints,
      payments: evaluation.payments,
      yaku: evaluation.yaku
    };
    this.logs.push(
      `${this.players[winnerSeat].name}${winType === "ron" ? "胡牌" : "自摸"} ${tileToText(winningTile)}，${evaluation.yaku.join("、")}，${totalPoints} 點。`
    );
    this.nextHandReadySeats = new Set(this.players.filter((item) => item.isAi).map((item) => item.seat));
    this.phase = "handComplete";
    this.pendingClaims = null;
    this.currentDrawSeat = null;
    this.currentDrawTile = null;
    this.riichiSticks = 0;
  }

  private finishRyukyoku(): void {
    this.result = { tenpaiSeats: [] };
    this.nextHandReadySeats = new Set(this.players.filter((item) => item.isAi).map((item) => item.seat));
    this.phase = "handComplete";
    this.pendingClaims = null;
    this.currentDrawSeat = null;
    this.currentDrawTile = null;
    this.logs.push("流局。");
  }

  private createClaimMeld(action: ActionOption): Meld {
    if (!action.tile || action.fromSeat === undefined) {
      throw new Error("副露資料不完整。");
    }
    if (action.type === "chi") {
      return {
        type: "chi",
        tiles: sortTiles(action.tiles ?? []),
        calledTile: action.tile,
        fromSeat: action.fromSeat,
        open: true
      };
    }
    return {
      type: "kan" === action.type ? "kan" : "pon",
      tiles:
        action.type === "kan"
          ? [action.tile, action.tile, action.tile, action.tile]
          : [action.tile, action.tile, action.tile],
      calledTile: action.tile,
      fromSeat: action.fromSeat,
      open: true
    };
  }

  private applyClaimAction(action: ActionOption): void {
    const player = this.players[action.actorSeat];
    if (!action.tile) {
      throw new Error("副露缺少目標牌。");
    }
    this.markLatestDiscardCalled();
    for (const item of this.players) {
      item.ippatsu = false;
    }
    if (action.type === "ron") {
      this.finishWin(action.actorSeat, "ron", action.tile, action.fromSeat ?? null);
      return;
    }

    let tilesToRemove: Tile[] = [];
    if (action.type === "chi") {
      const tiles = (action.tiles ?? []).filter((tile) => tile !== action.tile);
      tilesToRemove = tiles.slice(0, 2);
    } else if (action.type === "pon") {
      tilesToRemove = [action.tile, action.tile];
    } else if (action.type === "kan") {
      tilesToRemove = [action.tile, action.tile, action.tile];
    }

    player.hand = sortTiles(removeTiles(player.hand, tilesToRemove));
    player.melds.push(this.createClaimMeld(action));
    this.pendingClaims = null;
    this.currentTurnSeat = action.actorSeat;
    this.currentDrawSeat = null;
    this.currentDrawTile = null;
    this.latestDiscard = null;
    this.claimSeq += 1;
    this.latestClaim = { seat: action.actorSeat, type: action.type as "chi" | "pon" | "kan", seq: this.claimSeq };
    this.phase = "awaitingDiscard";
    this.logs.push(`${player.name}${action.label.replace(/^.+? /, "")}。`);

    if (action.type === "kan") {
      this.drawForSeat(action.actorSeat, true);
    }
  }

  private resolveClaimsIfReady(): boolean {
    if (!this.pendingClaims) {
      return false;
    }
    const pendingSeats = [...this.pendingClaims.actionsBySeat.keys()];
    if (!pendingSeats.every((seat) => this.pendingClaims?.responses.has(seat))) {
      return false;
    }

    const choices = pendingSeats
      .map((seat) => this.pendingClaims?.responses.get(seat))
      .filter((action): action is ActionOption => Boolean(action) && action.type !== "pass");
    this.pendingClaims = this.pendingClaims;

    if (choices.length === 0) {
      this.pendingClaims = null;
      this.advanceAfterNoClaim();
      return true;
    }

    choices.sort((left, right) => {
      const priorityDiff = actionPriority(right.type) - actionPriority(left.type);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return relativeSeatOrder(this.latestDiscard?.seat ?? 0, left.actorSeat) - relativeSeatOrder(this.latestDiscard?.seat ?? 0, right.actorSeat);
    });
    this.applyClaimAction(choices[0]);
    return true;
  }

  private createClaimWindow(tile: Tile, fromSeat: number): void {
    const actionsBySeat = new Map<number, ActionOption[]>();
    for (const player of this.players) {
      if (player.seat === fromSeat) {
        continue;
      }
      const actions = this.getClaimActionsForSeat(player.seat, tile, fromSeat);
      if (actions.length > 0) {
        actionsBySeat.set(player.seat, actions);
      }
    }
    if (actionsBySeat.size === 0) {
      this.advanceAfterNoClaim();
      return;
    }
    this.pendingClaims = {
      tile,
      fromSeat,
      actionsBySeat,
      responses: new Map()
    };
    this.phase = "awaitingClaims";
  }

  private applyDiscard(player: PlayerRuntimeState, tile: Tile): void {
    player.hand = sortTiles(removeTiles(player.hand, [tile]));
    const tsumogiri = this.currentDrawSeat === player.seat && this.currentDrawTile === tile;
    const discard: DiscardTile = {
      tile,
      tsumogiri,
      called: false,
      riichi: false
    };
    player.discards.push(discard);
    player.ippatsu = false;
    this.currentDrawSeat = null;
    this.currentDrawTile = null;
    this.latestDiscard = { seat: player.seat, tile };
    this.logs.push(`${player.name}打出 ${tileToText(tile)}。`);
    this.createClaimWindow(tile, player.seat);
  }

  private applySelfKan(player: PlayerRuntimeState, tile: Tile, type: "concealedKan" | "addedKan"): void {
    for (const item of this.players) {
      item.ippatsu = false;
    }
    if (type === "concealedKan") {
      player.hand = sortTiles(removeTiles(player.hand, [tile, tile, tile, tile]));
      player.melds.push({
        type: "kan",
        tiles: [tile, tile, tile, tile],
        calledTile: tile,
        fromSeat: player.seat,
        open: false
      });
      this.claimSeq += 1;
      this.latestClaim = { seat: player.seat, type: "kan", seq: this.claimSeq };
      this.logs.push(`${player.name}暗槓 ${tileToText(tile)}。`);
    } else {
      player.hand = sortTiles(removeTiles(player.hand, [tile]));
      const meld = player.melds.find((item) => item.type === "pon" && item.tiles[0] === tile);
      if (!meld) {
        throw new Error("找不到可以加槓的碰牌。");
      }
      meld.type = "kan";
      meld.tiles = [tile, tile, tile, tile];
      meld.addedKan = true;
      this.claimSeq += 1;
      this.latestClaim = { seat: player.seat, type: "kan", seq: this.claimSeq };
      this.logs.push(`${player.name}加槓 ${tileToText(tile)}。`);
    }
    this.drawForSeat(player.seat, true);
  }

  handleAction(playerId: string, action: ActionOption): void {
    const player = this.players.find((item) => item.id === playerId);
    if (!player) {
      throw new Error("找不到玩家。");
    }
    const legalActions = this.getLegalActionsForPlayer(playerId);
    const legal = legalActions.find(
      (item) =>
        item.type === action.type &&
        item.tile === action.tile &&
        JSON.stringify(item.tiles ?? []) === JSON.stringify(action.tiles ?? [])
    );
    if (!legal) {
      throw new Error("目前不能執行這個動作。");
    }

    if (this.pendingClaims) {
      this.pendingClaims.responses.set(player.seat, legal);
      this.resolveClaimsIfReady();
      return;
    }

    if (player.seat !== this.currentTurnSeat) {
      throw new Error("尚未輪到你。");
    }

    switch (legal.type) {
      case "discard":
        this.applyDiscard(player, legal.tile!);
        return;
      case "concealedKan":
        this.applySelfKan(player, legal.tile!, "concealedKan");
        return;
      case "addedKan":
        this.applySelfKan(player, legal.tile!, "addedKan");
        return;
      case "tsumo":
        this.finishWin(player.seat, "tsumo", legal.tile!, null);
        return;
      default:
        throw new Error("不支援的自摸動作。");
    }
  }

  async runAiStep(ai: RuleBasedAi): Promise<boolean> {
    if (this.phase === "handComplete" || this.phase === "matchComplete") {
      return false;
    }

    if (this.pendingClaims) {
      for (const [seat, actions] of this.pendingClaims.actionsBySeat.entries()) {
        const player = this.players[seat];
        if (this.pendingClaims.responses.has(seat)) {
          continue;
        }
        if (!player.isAi && player.connected) {
          continue;
        }
        const chosen = await ai.chooseAction(player, actions, this.roundWind, this.wall?.liveCount ?? 0);
        const insight = ai.getDecisionInfo(player.id);
        if (insight) {
          this.aiInsights.set(player.seat, { seat: player.seat, ...insight });
        }
        this.pendingClaims.responses.set(seat, chosen);
        this.resolveClaimsIfReady();
        return true;
      }
      return false;
    }

    const player = this.players[this.currentTurnSeat];
    if (!player.isAi && player.connected) {
      return false;
    }
    const actions = this.getSelfActionsForSeat(player.seat);
    if (actions.length === 0) {
      return false;
    }
    const chosen = await ai.chooseAction(player, actions, this.roundWind, this.wall?.liveCount ?? 0);
    const insight = ai.getDecisionInfo(player.id);
    if (insight) {
      this.aiInsights.set(player.seat, { seat: player.seat, ...insight });
    }
    this.handleAction(player.id, chosen);
    return true;
  }
}
