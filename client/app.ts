import type {
  ActionOption,
  Meld,
  PublicGameState,
  RoomSummary,
  ServerMessage,
  Tile
} from "../shared/types.js";
import { parseTile, sortTiles, tileToText } from "../shared/tileUtils.js";

const playerNameInput = document.querySelector<HTMLInputElement>("#player-name");
const roomCodeInput = document.querySelector<HTMLInputElement>("#room-code");
const appLayout = document.querySelector<HTMLElement>("#app-layout");
const connectionStatus = document.querySelector<HTMLElement>("#connection-status");
const roomSummaryBox = document.querySelector<HTMLElement>("#room-summary");
const roomShareBox = document.querySelector<HTMLElement>("#room-share");
const table = document.querySelector<HTMLElement>("#table");
const tableCenterButton = document.querySelector<HTMLElement>("#table-center-button");
const handBox = document.querySelector<HTMLElement>("#hand");
const drawTileBox = document.querySelector<HTMLElement>("#draw-tile");
const claimHintBox = document.querySelector<HTMLElement>("#claim-hint");
const readHintBox = document.querySelector<HTMLElement>("#read-hint");
const aiHintBox = document.querySelector<HTMLElement>("#ai-hint");
const actionsBox = document.querySelector<HTMLElement>("#actions");
const tableActionsFixedBox = document.querySelector<HTMLElement>("#table-actions-fixed");
const logsBox = document.querySelector<HTMLElement>("#logs");
const resultBox = document.querySelector<HTMLElement>("#result-box");
const lanHint = document.querySelector<HTMLElement>("#lan-hint");
const centerSummary = document.querySelector<HTMLElement>("#center-summary");
const centerScoreSouth = document.querySelector<HTMLElement>("#center-score-south");
const centerScoreNorth = document.querySelector<HTMLElement>("#center-score-north");
const centerScoreWest = document.querySelector<HTMLElement>("#center-score-west");
const centerScoreEast = document.querySelector<HTMLElement>("#center-score-east");
const catPawAnimation = document.querySelector<HTMLElement>("#cat-paw-animation");
const catPawImg = document.querySelector<HTMLImageElement>("#cat-paw-img");
const southPlayerInfoBox = document.querySelector<HTMLElement>("#south-player-info");
const playerInfoNorth = document.querySelector<HTMLElement>("#player-info-north");
const playerInfoWest = document.querySelector<HTMLElement>("#player-info-west");
const playerInfoEast = document.querySelector<HTMLElement>("#player-info-east");
const meldFixedSouth = document.querySelector<HTMLElement>("#meld-fixed-south");
const meldFixedNorth = document.querySelector<HTMLElement>("#meld-fixed-north");
const meldFixedWest = document.querySelector<HTMLElement>("#meld-fixed-west");
const meldFixedEast = document.querySelector<HTMLElement>("#meld-fixed-east");
const southPlayerOpenBox = document.querySelector<HTMLElement>("#south-player-open");
const claimFlash = document.querySelector<HTMLElement>("#claim-flash");
const claimFlashAvatar = document.querySelector<HTMLImageElement>("#claim-flash-avatar");
const claimFlashText = document.querySelector<HTMLElement>("#claim-flash-text");
const resultOverlay = document.querySelector<HTMLElement>("#result-overlay");
const resultOverlayCard = document.querySelector<HTMLElement>("#result-overlay-card");
const resultOverlayCat = document.querySelector<HTMLImageElement>("#result-overlay-cat");
const resultOverlayBadge = document.querySelector<HTMLElement>("#result-overlay-badge");
const resultOverlayTitle = document.querySelector<HTMLElement>("#result-overlay-title");
const resultOverlaySubtitle = document.querySelector<HTMLElement>("#result-overlay-subtitle");
const scoreDialogBackdrop = document.querySelector<HTMLElement>("#score-dialog-backdrop");
const scoreDialogSummary = document.querySelector<HTMLElement>("#score-dialog-summary");
const scoreDialogBody = document.querySelector<HTMLElement>("#score-dialog-body");

const createRoomButton = document.querySelector<HTMLButtonElement>("#create-room");
const joinRoomButton = document.querySelector<HTMLButtonElement>("#join-room");
const requestStateButton = document.querySelector<HTMLButtonElement>("#request-state");
const addAiButton = document.querySelector<HTMLButtonElement>("#add-ai");
const startGameButton = document.querySelector<HTMLButtonElement>("#start-game");
const leaveRoomButton = document.querySelector<HTMLButtonElement>("#leave-room");
const tableLeaveRoomButton = document.querySelector<HTMLButtonElement>("#table-leave-room");
const scoreDialogCloseButton = document.querySelector<HTMLButtonElement>("#score-dialog-close");

let socket: WebSocket | null = null;
let room: RoomSummary | null = null;
let gameState: PublicGameState | null = null;
const playerId = loadPlayerId();
let autoJoinAttempted = false;
const tableSkeleton = table?.innerHTML ?? "";
let lastPresentedResultKey = "";
let overlayTimer: number | null = null;
let leavingRoomId: string | null = null;
let lastAnimatedDiscardKey = "";
let catPawCleanupTimer: number | null = null;
let catPawRevealTimer: number | null = null;
let dealIntroTimer: number | null = null;
let lastGamePhase: string | null = null;
let lastClaimSeq = 0;
let claimFlashTimer: number | null = null;
const CAT_PAW_SIZE = 360;
let centerButtonPressed = false;
let lastClickedTileIndex = -1;
let animationReadyTime = Date.now() + 2000;
let scoreDialogDismissed = false;

function ensureTableSkeleton(): void {
  if (!table) {
    return;
  }
  if (!table.querySelector(".seat-zone.south")) {
    table.innerHTML = tableSkeleton;
  }
}

function generatePlayerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join("")
    ].join("-");
  }
  return `player-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function loadPlayerId(): string {
  const existing = localStorage.getItem("mahjong-player-id");
  if (existing) {
    return existing;
  }
  const created = generatePlayerId();
  localStorage.setItem("mahjong-player-id", created);
  return created;
}

function savePlayerName(): string {
  const value = (playerNameInput?.value || "").trim() || "玩家";
  localStorage.setItem("mahjong-player-name", value);
  return value;
}

function loadPlayerName(): string {
  return localStorage.getItem("mahjong-player-name") || "玩家";
}

function saveRoomId(roomId: string): void {
  localStorage.setItem("mahjong-room-id", roomId);
}

function loadRoomId(): string {
  return localStorage.getItem("mahjong-room-id") || "";
}

function queryRoomId(): string {
  return new URL(window.location.href).searchParams.get("room")?.trim().toUpperCase() || "";
}

function preferredRoomId(): string {
  return queryRoomId() || loadRoomId();
}

function updateRoomUrl(roomId: string): void {
  const url = new URL(window.location.href);
  if (roomId) {
    url.searchParams.set("room", roomId);
  } else {
    url.searchParams.delete("room");
  }
  window.history.replaceState({}, "", url);
}

function clearCurrentRoomState(message?: string): void {
  room = null;
  gameState = null;
  lastPresentedResultKey = "";
  lastAnimatedDiscardKey = "";
  lastClaimSeq = 0;
  lastGamePhase = null;
  animationReadyTime = Date.now() + 2000;
  localStorage.removeItem("mahjong-room-id");
  updateRoomUrl("");
  if (roomCodeInput) {
    roomCodeInput.value = "";
  }
  if (roomShareBox) {
    roomShareBox.textContent = "尚未建立";
    roomShareBox.parentElement?.setAttribute("hidden", "");
  }
  roomSummaryBox?.setAttribute("hidden", "");
  handBox!.innerHTML = "";
  southPlayerInfoBox?.replaceChildren();
  southPlayerOpenBox?.replaceChildren();
  meldFixedSouth?.replaceChildren();
  meldFixedNorth?.replaceChildren();
  meldFixedWest?.replaceChildren();
  meldFixedEast?.replaceChildren();
  drawTileBox!.textContent = "尚未摸牌";
  claimHintBox!.hidden = true;
  claimHintBox!.textContent = "目前沒有可碰牌提示。";
  actionsBox!.innerHTML = "";
  tableActionsFixedBox?.replaceChildren();
  ensureTableSkeleton();
  centerSummary!.innerHTML = buildIdleCenterSummary();
  logsBox!.innerHTML = "";
  resultBox!.textContent = "尚無結果。";
  hideResultOverlay();
  hideScoreDialog();
  if (catPawRevealTimer !== null) {
    window.clearTimeout(catPawRevealTimer);
    catPawRevealTimer = null;
  }
  if (catPawCleanupTimer !== null) {
    window.clearTimeout(catPawCleanupTimer);
    catPawCleanupTimer = null;
  }
  if (dealIntroTimer !== null) {
    window.clearTimeout(dealIntroTimer);
    dealIntroTimer = null;
  }
  table?.classList.remove("deal-intro");
  table?.querySelectorAll(".discard-under-paw, .discard-revealed").forEach((element) => {
    element.classList.remove("discard-under-paw", "discard-revealed");
  });
  if (catPawAnimation) {
    catPawAnimation.hidden = true;
    catPawAnimation.classList.remove("play", "from-south", "from-north", "from-east", "from-west");
  }
  updateViewMode();
  renderRoom();
  if (message) {
    connectionStatus!.textContent = message;
  }
}

function updateViewMode(): void {
  const inMatch = Boolean(room?.tableReady || gameState);
  appLayout?.classList.toggle("in-match", inMatch);
  document.body.classList.toggle("in-match", inMatch);
}

function buildIdleCenterSummary(): string {
  if (!room) {
    return `
      <div class="center-summary-item">
        <span class="center-summary-label">牌桌中央</span>
        <span class="center-summary-value">建立或加入房間</span>
      </div>
    `;
  }
  if (!room.tableReady) {
    return `
      <div class="center-summary-item">
        <span class="center-summary-label">房間配置</span>
        <span class="center-summary-value">${room.seats.filter((seat) => seat.occupied).length} / 4</span>
      </div>
      <div class="center-summary-item">
        <span class="center-summary-label">下一步</span>
        <span class="center-summary-value">先按開始對局</span>
      </div>
    `;
  }
  if (!room.started) {
    const amHost = room.hostId === playerId;
    return `
      <div class="center-summary-item">
        <span class="center-summary-label">牌桌待機</span>
        <span class="center-summary-value">${room.seats.filter((seat) => seat.occupied).length} / 4</span>
      </div>
      <div class="center-summary-item">
        <span class="center-summary-label">中央按鈕</span>
        <span class="center-summary-value">${amHost ? "按下發牌" : "等待房主發牌"}</span>
      </div>
    `;
  }
  return `
    <div class="center-summary-item">
      <span class="center-summary-label">牌桌中央</span>
      <span class="center-summary-value">對局準備中</span>
    </div>
  `;
}

function getCenterButtonAction():
  | { type: "start_game"; roomId: string }
  | { type: "begin_hand"; roomId: string }
  | { type: "continue_after_hand"; roomId: string }
  | null {
  if (gameState?.awaitingNextHand || gameState?.phase === "handComplete") {
    return { type: "continue_after_hand", roomId: gameState!.roomId };
  }
  if (room && room.tableReady && !room.started && room.hostId === playerId) {
    return { type: "begin_hand", roomId: room.roomId };
  }
  if (room && !room.tableReady && room.hostId === playerId) {
    return { type: "start_game", roomId: room.roomId };
  }
  return null;
}

function handleCenterButtonRelease(): void {
  const action = getCenterButtonAction();
  if (!action) {
    return;
  }
  scoreDialogDismissed = true;
  hideScoreDialog();
  send(action);
}

function hideResultOverlay(): void {
  if (!resultOverlay) {
    return;
  }
  resultOverlay.hidden = true;
  if (resultOverlayCat) {
    resultOverlayCat.hidden = true;
    resultOverlayCat.removeAttribute("src");
  }
  resultOverlay.classList.remove("state-self-win", "state-self-lose", "state-other-win", "state-draw");
  resultOverlayCard?.classList.remove("show", "win", "draw");
  if (overlayTimer !== null) {
    window.clearTimeout(overlayTimer);
    overlayTimer = null;
  }
}

function hideScoreDialog(): void {
  if (scoreDialogBackdrop) {
    scoreDialogBackdrop.hidden = true;
  }
}

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}`);
  connectionStatus!.textContent = "正在建立連線...";

  socket.addEventListener("open", () => {
    connectionStatus!.textContent = "已連線";
    socket?.send(JSON.stringify({ type: "hello", playerId }));
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    handleMessage(message);
  });

  socket.addEventListener("close", () => {
    connectionStatus!.textContent = "連線中斷，正在重連...";
    window.setTimeout(connect, 1200);
  });
}

function send(payload: unknown): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    alert("尚未連上伺服器。");
    return;
  }
  socket.send(JSON.stringify(payload));
}

function handleMessage(message: ServerMessage): void {
  switch (message.type) {
    case "welcome":
      connectionStatus!.textContent = `已連線，玩家代碼 ${message.playerId.slice(0, 8)}`;
      if (queryRoomId() && !autoJoinAttempted) {
        autoJoinAttempted = true;
        send({ type: "join_room", roomId: queryRoomId(), playerName: loadPlayerName() });
      } else {
        const rememberedRoomId = preferredRoomId();
        if (rememberedRoomId) {
          send({ type: "request_state", roomId: rememberedRoomId });
        }
      }
      return;
    case "room_state":
      if (leavingRoomId && message.room.roomId === leavingRoomId) {
        return;
      }
      room = message.room;
      saveRoomId(message.room.roomId);
      updateRoomUrl(message.room.roomId);
      if (roomCodeInput) {
        roomCodeInput.value = message.room.roomId;
      }
      updateViewMode();
      renderRoom();
      return;
    case "game_state":
      if (leavingRoomId && message.roomId === leavingRoomId) {
        return;
      }
      gameState = message.state;
      saveRoomId(message.roomId);
      updateViewMode();
      renderGame();
      return;
    case "left_room":
      leavingRoomId = null;
      clearCurrentRoomState(message.message);
      return;
    case "error":
      leavingRoomId = null;
      alert(message.message);
      return;
    case "info":
      connectionStatus!.textContent = message.message;
      return;
  }
}

function renderRoom(): void {
  if (!roomSummaryBox) {
    return;
  }
  if (!room) {
    roomSummaryBox.textContent = "尚未加入房間。";
    roomSummaryBox.hidden = true;
    roomShareBox?.parentElement?.setAttribute("hidden", "");
    addAiButton!.disabled = true;
    startGameButton!.disabled = true;
    leaveRoomButton!.disabled = true;
    centerSummary!.innerHTML = buildIdleCenterSummary();
    return;
  }
  roomSummaryBox.hidden = false;
  roomShareBox?.parentElement?.removeAttribute("hidden");
  const currentRoom = room;
  const seatLines = currentRoom.seats
    .map((seat) => {
      if (!seat.occupied) {
        return `座位 ${seat.seat + 1}：空位`;
      }
      const hostMark = currentRoom.hostId === seat.playerId ? " 房主" : "";
      const aiMark = seat.isAi ? " AI" : "";
      const online = seat.connected ? "在線" : "離線";
      return `座位 ${seat.seat + 1}：${seat.name}${hostMark}${aiMark}（${online}）`;
    })
    .join("<br />");
  roomSummaryBox.innerHTML = `房間代碼：<strong>${currentRoom.roomId}</strong><br />${seatLines}`;
  if (roomShareBox) {
    const shareUrl = `${window.location.origin}/?room=${currentRoom.roomId}`;
    roomShareBox.innerHTML = `<a href="${shareUrl}">${shareUrl}</a>`;
  }

  const amHost = currentRoom.hostId === playerId;
  addAiButton!.disabled = !amHost || currentRoom.tableReady;
  startGameButton!.disabled = !amHost || currentRoom.tableReady;
  leaveRoomButton!.disabled = false;
  if (!gameState) {
    centerSummary!.innerHTML = buildIdleCenterSummary();
  }
}

function actionByTile(type: ActionOption["type"], tile: Tile): ActionOption | undefined {
  return gameState?.legalActions.find((action) => action.type === type && action.tile === tile);
}

function actionGlyph(action: ActionOption): string {
  switch (action.type) {
    case "chi":
      return "吃";
    case "pon":
      return "碰";
    case "kan":
    case "concealedKan":
    case "addedKan":
      return "槓";
    case "ron":
      return "胡";
    case "tsumo":
      return "自摸";
    case "pass":
      return "過";
    case "riichi":
      return "立";
    default:
      return action.label;
  }
}

function incrementTileCount(map: Map<Tile, number>, tile: Tile): void {
  map.set(tile, (map.get(tile) ?? 0) + 1);
}

function mergeTileCounts(target: Map<Tile, number>, source: Map<Tile, number>): void {
  for (const [tile, count] of source) {
    target.set(tile, Math.max(target.get(tile) ?? 0, count));
  }
}

function claimActionHighlightTiles(action: ActionOption): { handTiles: Map<Tile, number>; pondTiles: Map<Tile, number> } {
  const handTiles = new Map<Tile, number>();
  const pondTiles = new Map<Tile, number>();
  const highlightAllMatchingHandTiles = action.type === "pon";
  if (action.type === "chi" || action.type === "pon" || action.type === "kan" || action.type === "concealedKan" || action.type === "addedKan") {
    for (const tile of action.tiles ?? []) {
      incrementTileCount(handTiles, tile);
    }
  }
  if (action.type === "pon" || action.type === "kan") {
    if (action.tile) {
      incrementTileCount(handTiles, action.tile);
      incrementTileCount(pondTiles, action.tile);
    }
    if (action.targetTile) {
      incrementTileCount(pondTiles, action.targetTile);
    }
  }
  if (action.type === "chi") {
    if (action.tile) {
      incrementTileCount(pondTiles, action.tile);
    }
    if (action.targetTile) {
      incrementTileCount(pondTiles, action.targetTile);
    }
  }
  if (action.type === "ron" && action.tile) {
    incrementTileCount(pondTiles, action.tile);
  }
  if (highlightAllMatchingHandTiles && action.tile) {
    handTiles.set(action.tile, Number.POSITIVE_INFINITY);
  }
  return { handTiles, pondTiles };
}

function updateClaimHighlights(claimActions: ActionOption[], activeAction: ActionOption | null): void {
  if (!handBox || !table) {
    return;
  }
  const unionHandTiles = new Map<Tile, number>();
  const unionPondTiles = new Map<Tile, number>();
  for (const action of claimActions) {
    const highlights = claimActionHighlightTiles(action);
    mergeTileCounts(unionHandTiles, highlights.handTiles);
    mergeTileCounts(unionPondTiles, highlights.pondTiles);
  }
  const activeHighlights = activeAction
    ? claimActionHighlightTiles(activeAction)
    : { handTiles: new Map<Tile, number>(), pondTiles: new Map<Tile, number>() };

  const remainingUnionHand = new Map(unionHandTiles);
  const remainingActiveHand = new Map(activeHighlights.handTiles);
  handBox.querySelectorAll<HTMLButtonElement>(".tile-button").forEach((button) => {
    const tile = button.dataset.tile as Tile | undefined;
    const related = Boolean(tile && (remainingUnionHand.get(tile) ?? 0) > 0);
    const active = Boolean(tile && (remainingActiveHand.get(tile) ?? 0) > 0);
    button.classList.toggle("claim-related", related);
    button.classList.toggle("claim-active", active);
    if (tile && related && (remainingUnionHand.get(tile) ?? 0) !== Number.POSITIVE_INFINITY) {
      remainingUnionHand.set(tile, Math.max(0, (remainingUnionHand.get(tile) ?? 0) - 1));
    }
    if (tile && active && (remainingActiveHand.get(tile) ?? 0) !== Number.POSITIVE_INFINITY) {
      remainingActiveHand.set(tile, Math.max(0, (remainingActiveHand.get(tile) ?? 0) - 1));
    }
  });

  const remainingUnionPond = new Map(unionPondTiles);
  const remainingActivePond = new Map(activeHighlights.pondTiles);
  table.querySelectorAll<HTMLElement>(".discard-tile-wrap").forEach((wrap) => {
    const tile = wrap.dataset.tile as Tile | undefined;
    const related = Boolean(tile && (remainingUnionPond.get(tile) ?? 0) > 0);
    const active = Boolean(tile && (remainingActivePond.get(tile) ?? 0) > 0);
    wrap.classList.toggle("claim-related", related);
    wrap.classList.toggle("claim-active", active);
    if (tile && related) {
      remainingUnionPond.set(tile, Math.max(0, (remainingUnionPond.get(tile) ?? 0) - 1));
    }
    if (tile && active) {
      remainingActivePond.set(tile, Math.max(0, (remainingActivePond.get(tile) ?? 0) - 1));
    }
  });
}

type TablePosition = "south" | "east" | "north" | "west";

function relativePosition(viewerSeat: number | null, seat: number): TablePosition {
  if (viewerSeat === null) {
    return "south";
  }
  const diff = (seat - viewerSeat + 4) % 4;
  return ["south", "west", "north", "east"][diff] as TablePosition;
}

function latestDiscardKey(state: PublicGameState): string {
  if (!state.latestDiscard) {
    return "";
  }
  const owner = state.players[state.latestDiscard.seat];
  return `${state.latestDiscard.seat}:${state.latestDiscard.tile}:${owner?.discards.length ?? 0}`;
}

function pawImageForAvatar(avatarKey: string): string {
  switch (avatarKey) {
    case "avatar-cat-west":
      return "/cat-paw-black.png";
    case "avatar-cat-north":
      return "/cat-paw-white.png";
    case "avatar-cat-south":
      return "/cat-paw-gray.png";
    case "avatar-cat-east":
    default:
      return "/cat-paw.png";
  }
}

function pawContactOffset(position: TablePosition, pawSize: number): { x: number; y: number } {
  const baseX = pawSize * 0.13;
  const baseY = pawSize * 0.15;
  switch (position) {
    case "south":
      return { x: baseX, y: baseY };
    case "north":
      return { x: -baseX, y: -baseY };
    case "east":
      return { x: baseY, y: -baseX };
    case "west":
      return { x: -baseY, y: baseX };
  }
}

function pawTopLeftForCenter(
  centerX: number,
  centerY: number,
  position: TablePosition,
  pawSize: number
): { x: number; y: number } {
  const offset = pawContactOffset(position, pawSize);
  return {
    x: centerX - pawSize / 2 - offset.x,
    y: centerY - pawSize / 2 - offset.y
  };
}

function playCatPawForLatestDiscard(state: PublicGameState): boolean {
  if (!table || !catPawAnimation || !state.latestDiscard) {
    return false;
  }
  const key = latestDiscardKey(state);
  if (!key || key === lastAnimatedDiscardKey) {
    return false;
  }
  const target = table.querySelector<HTMLElement>(".tile-face.latest-discard");
  const viewerSeat = state.viewerSeat;
  const fromPosition = relativePosition(viewerSeat, state.latestDiscard.seat);
  if (!target) {
    lastAnimatedDiscardKey = key;
    return false;
  }

  const tableRect = table.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const pawSize = CAT_PAW_SIZE;
  const targetCenterX = targetRect.left - tableRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top - tableRect.top + targetRect.height / 2;
  const targetPos = pawTopLeftForCenter(targetCenterX, targetCenterY, fromPosition, pawSize);
  const targetX = targetPos.x;
  const targetY = targetPos.y;

  let startX: number;
  let startY: number;
  if (savedHandTilePos) {
    startX = savedHandTilePos.x;
    startY = savedHandTilePos.y;
  } else {
    const handAreaEl =
      fromPosition === "south" ? table.querySelector(".south-player-hand")
      : fromPosition === "north" ? table.querySelector(".north-player-hand")
      : fromPosition === "west" ? table.querySelector(".seat-zone.west .tile-back-row")
      : table.querySelector(".seat-zone.east .tile-back-row");
    if (handAreaEl) {
      const handRect = handAreaEl.getBoundingClientRect();
      const handCenterX = handRect.left - tableRect.left + handRect.width / 2;
      const handCenterY = handRect.top - tableRect.top + handRect.height / 2;
      const handPos = pawTopLeftForCenter(handCenterX, handCenterY, fromPosition, pawSize);
      startX = handPos.x;
      startY = handPos.y;
    } else {
      startX = targetX;
      startY = targetY;
    }
  }

  const exitX = startX + (targetX - startX) * 0.6;
  const exitY = startY + (targetY - startY) * 0.6;

  if (catPawRevealTimer !== null) {
    window.clearTimeout(catPawRevealTimer);
    catPawRevealTimer = null;
  }
  if (catPawCleanupTimer !== null) {
    window.clearTimeout(catPawCleanupTimer);
    catPawCleanupTimer = null;
  }
  table.querySelectorAll(".discard-under-paw, .discard-revealed").forEach((element) => {
    element.classList.remove("discard-under-paw", "discard-revealed");
  });
  target.classList.add("discard-under-paw");

  const discardPlayer = state.players[state.latestDiscard.seat];
  if (catPawImg && discardPlayer) {
    catPawImg.src = pawImageForAvatar(discardPlayer.avatarKey);
  }

  catPawAnimation.hidden = false;
  catPawAnimation.classList.remove("play", "from-south", "from-north", "from-east", "from-west");
  catPawAnimation.style.setProperty("--paw-start-x", `${startX}px`);
  catPawAnimation.style.setProperty("--paw-start-y", `${startY}px`);
  catPawAnimation.style.setProperty("--paw-end-x", `${targetX}px`);
  catPawAnimation.style.setProperty("--paw-end-y", `${targetY}px`);
  catPawAnimation.style.setProperty("--paw-exit-x", `${exitX}px`);
  catPawAnimation.style.setProperty("--paw-exit-y", `${exitY}px`);
  catPawAnimation.classList.add(`from-${fromPosition}`);
  void catPawAnimation.offsetWidth;
  catPawAnimation.classList.add("play");
  catPawRevealTimer = window.setTimeout(() => {
    target.classList.remove("discard-under-paw");
    target.classList.add("discard-revealed");
    catPawRevealTimer = null;
  }, 780);
  catPawCleanupTimer = window.setTimeout(() => {
    catPawAnimation.classList.remove("play", "from-south", "from-north", "from-east", "from-west");
    catPawAnimation.hidden = true;
    target.classList.remove("discard-revealed");
    catPawCleanupTimer = null;
  }, 1100);
  lastAnimatedDiscardKey = key;
  return true;
}

function insertHandGapSpacer(position: TablePosition, _state: PublicGameState): void {
  if (!table) {
    return;
  }
  const idx = savedHandTilePos?.index ?? -1;
  savedHandTilePos = null;
  const spacer = document.createElement("span");
  spacer.className = "hand-gap-spacer";

  if (position === "south" && handBox) {
    spacer.style.width = "39px";
    spacer.style.height = "54px";
    const buttons = handBox.querySelectorAll(".tile-button");
    const insertAt = idx >= 0 && idx <= buttons.length ? idx : Math.floor(buttons.length / 2);
    if (insertAt < buttons.length) {
      handBox.insertBefore(spacer, buttons[insertAt]);
    } else {
      handBox.appendChild(spacer);
    }
  } else if (position === "north") {
    spacer.style.width = "28px";
    spacer.style.height = "38px";
    const row = table.querySelector(".north-player-hand .tile-back-row");
    if (row) {
      const insertAt = idx >= 0 && idx <= row.children.length ? idx : Math.floor(row.children.length / 2);
      if (insertAt < row.children.length) {
        row.insertBefore(spacer, row.children[insertAt]);
      } else {
        row.appendChild(spacer);
      }
    }
  } else if (position === "west" || position === "east") {
    spacer.style.width = "28px";
    spacer.style.height = "28px";
    spacer.style.margin = "-5px 0";
    const row = table.querySelector(`.seat-zone.${position} .tile-back-row`);
    if (row) {
      const insertAt = idx >= 0 && idx <= row.children.length ? idx : Math.floor(row.children.length / 2);
      if (insertAt < row.children.length) {
        row.insertBefore(spacer, row.children[insertAt]);
      } else {
        row.appendChild(spacer);
      }
    }
  }

  window.setTimeout(() => {
    void spacer.offsetWidth;
    spacer.classList.add("closing");
    window.setTimeout(() => spacer.remove(), 550);
  }, 550);
}

function seatStateText(player: PublicGameState["players"][number], state: PublicGameState): string {
  if (player.seat === state.currentTurnSeat) {
    return "輪到此家";
  }
  if (state.pendingClaimSeats.includes(player.seat)) {
    return "可吃碰槓和";
  }
  if (player.riichiAccepted) {
    return "已立直";
  }
  return "";
}

function numberText(rank: number): string {
  return ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"][rank] || String(rank);
}

function suitText(suit: string): string {
  switch (suit) {
    case "m":
      return "萬";
    case "p":
      return "筒";
    case "s":
      return "索";
    default:
      return "";
  }
}

function suitCategoryText(suit: string): string {
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

function meldTypeText(type: Meld["type"]): string {
  switch (type) {
    case "chi":
      return "吃";
    case "pon":
      return "碰";
    case "kan":
      return "槓";
    default:
      return type;
  }
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

function suggestedDiscard(state: PublicGameState): string {
  return state.recommendation?.tile ? `${tileToText(state.recommendation.tile)}，${state.recommendation.reason}` : "目前無建議";
}

function estimateMissingSuit(player: PublicGameState["players"][number]): string {
  const earlyDiscards = player.discards.slice(0, 6);
  const counts = { m: 0, p: 0, s: 0, z: 0 };
  for (const discard of earlyDiscards) {
    counts[parseTile(discard.tile).suit] += 1;
  }
  const meldSuits = new Set(player.melds.map((meld) => parseTile(meld.calledTile).suit));
  const candidates = (["m", "p", "s"] as const)
    .map((suit) => ({ suit, count: counts[suit] }))
    .sort((left, right) => right.count - left.count);
  const best = candidates[0];
  const second = candidates[1];
  if (best.count >= 2 && best.count >= second.count + 1 && !meldSuits.has(best.suit)) {
    return `像在清${suitCategoryText(best.suit)}`;
  }
  if (counts.z >= 2) {
    return "字牌整理得較早";
  }
  return "缺門不明";
}

function estimateLikelyWait(player: PublicGameState["players"][number]): string {
  if (player.discards.length < 5 && player.melds.length === 0) {
    return "聽牌方向尚不明";
  }
  const topSuits = likelyWaitSuits(player);
  if (topSuits.length === 0) {
    return "可能在等熟張或字牌";
  }
  return `可能聽${topSuits.map((suit) => suitCategoryText(suit)).join("、")}`;
}

function buildReadHints(state: PublicGameState): string {
  const viewerSeat = state.viewerSeat;
  const opponents = state.players.filter((player) => player.seat !== viewerSeat);
  if (opponents.length === 0) {
    return "對手牌況推測：目前資訊不足。";
  }
  const hints = opponents.map((player) => `${player.name}：${estimateMissingSuit(player)}，${estimateLikelyWait(player)}`);
  return `對手牌況推測（僅供參考）：${hints.join(" ｜ ")}`;
}

function buildAiHints(state: PublicGameState): string {
  const recommendationStatus = state.recommendation
    ? `出牌建議來源：${state.recommendation.source} / ${state.recommendation.strength}強度 / ${state.recommendation.status}`
    : "出牌建議來源：尚未產生";
  if (!state.aiInsights || state.aiInsights.length === 0) {
    return `${recommendationStatus} ｜ AI 狀態：目前尚無可用摘要。`;
  }
  const hints = state.aiInsights
    .map((insight) => {
      const player = state.players.find((item) => item.seat === insight.seat);
      const name = player?.name ?? `AI${insight.seat + 1}`;
      return `${name}（${insight.mode} / ${insight.strength}強度）：${insight.summary}`;
    })
    .join(" ｜ ");
  return `${recommendationStatus} ｜ AI 狀態：${hints}`;
}

function compactRecommendation(state: PublicGameState): string {
  if (!state.recommendation?.tile) {
    return "建議：暫無";
  }
  return `建議：${tileToText(state.recommendation.tile)}，${state.recommendation.reason}`;
}

function renderTileFace(tile: Tile, className = ""): string {
  return `<span class="tile-face ${className}" aria-label="${tileToText(tile)}" title="${tileToText(tile)}">${renderTileGraphic(tile)}</span>`;
}

function renderHonor(rank: number): string {
  switch (rank) {
    case 1:
      return '<span class="honor-icon wind east">東</span>';
    case 2:
      return '<span class="honor-icon wind south">南</span>';
    case 3:
      return '<span class="honor-icon wind west">西</span>';
    case 4:
      return '<span class="honor-icon wind north">北</span>';
    case 5:
      return '<span class="honor-icon dragon white"></span>';
    case 6:
      return '<span class="honor-icon dragon green">發</span>';
    case 7:
      return '<span class="honor-icon dragon red">中</span>';
    default:
      return '<span class="honor-icon">?</span>';
  }
}

function renderTileGraphic(tile: Tile): string {
  const { rank, suit } = parseTile(tile);
  if (suit === "m") {
    return `
      <span class="tile-graphic suit-wan">
        <span class="wan-rank">${numberText(rank)}</span>
        <span class="wan-char">萬</span>
      </span>
    `;
  }
  if (suit === "p") {
    return `
      <span class="tile-graphic suit-pin">
        <span class="pip-grid">
          ${pipPattern(rank)
            .map(
              ([column, row]) =>
                `<span class="pin-pip" style="grid-column:${column};grid-row:${row};"></span>`
            )
            .join("")}
        </span>
      </span>
    `;
  }
  if (suit === "s") {
    return `
      <span class="tile-graphic suit-bamboo">
        <span class="pip-grid">
          ${pipPattern(rank)
            .map(
              ([column, row]) => `<span class="bamboo-pip" style="grid-column:${column};grid-row:${row};"></span>`
            )
            .join("")}
        </span>
      </span>
    `;
  }
  return `
    <span class="tile-graphic suit-honor">
      ${renderHonor(rank)}
    </span>
  `;
}

function pipPattern(rank: number): Array<[number, number]> {
  switch (rank) {
    case 1:
      return [[2, 2]];
    case 2:
      return [
        [2, 1],
        [2, 3]
      ];
    case 3:
      return [
        [2, 1],
        [2, 2],
        [2, 3]
      ];
    case 4:
      return [
        [1, 1],
        [3, 1],
        [1, 3],
        [3, 3]
      ];
    case 5:
      return [
        [1, 1],
        [3, 1],
        [2, 2],
        [1, 3],
        [3, 3]
      ];
    case 6:
      return [
        [1, 1],
        [3, 1],
        [1, 2],
        [3, 2],
        [1, 3],
        [3, 3]
      ];
    case 7:
      return [
        [2, 1],
        [1, 1],
        [3, 1],
        [1, 2],
        [3, 2],
        [1, 3],
        [3, 3]
      ];
    case 8:
      return [
        [1, 1],
        [2, 1],
        [3, 1],
        [1, 2],
        [3, 2],
        [1, 3],
        [2, 3],
        [3, 3]
      ];
    case 9:
      return [
        [1, 1],
        [2, 1],
        [3, 1],
        [1, 2],
        [2, 2],
        [3, 2],
        [1, 3],
        [2, 3],
        [3, 3]
      ];
    default:
      return [[2, 2]];
  }
}

function renderTileBacks(count: number, vertical = false, extraClass = ""): string {
  const backs = Array.from({ length: count }, () => `<span class="tile-back small">牌背</span>`).join("");
  const className = ["tile-back-row", vertical ? "vertical" : "", extraClass].filter(Boolean).join(" ");
  return `<div class="${className}">${backs}</div>`;
}

function renderRevealedHand(tiles: Tile[], position: TablePosition): string {
  if (tiles.length === 0) {
    return "";
  }
  const className = ["tile-row", "revealed-hand-row", position === "east" || position === "west" ? `side ${position}` : ""]
    .filter(Boolean)
    .join(" ");
  return `<div class="${className}">${tiles.map((tile) => renderTileFace(tile, "small")).join("")}</div>`;
}

function renderDiscardTiles(
  discards: Array<{ tile: Tile; riichi: boolean; called?: boolean }>,
  latestDiscard: { seat: number; tile: Tile } | null,
  seat: number
): string {
  if (discards.length === 0) {
    return `<div class="discard-grid"></div>`;
  }
  return `<div class="discard-grid">${discards
    .map((discard, index) => {
      const isLatest =
        latestDiscard?.seat === seat &&
        index === discards.length - 1 &&
        latestDiscard.tile === discard.tile &&
        !discard.called;
      return `<span class="discard-tile-wrap${isLatest ? " latest-discard-tile" : ""}" data-tile="${discard.tile}">${renderTileFace(
        discard.tile,
        `tiny ${discard.riichi ? "riichi-mark" : ""} ${discard.called ? "called-mark" : ""} ${isLatest ? "latest-discard" : ""}`.trim()
      )}</span>`;
    })
    .join("")}</div>`;
}

function renderMeld(meld: Meld, highlight = false): string {
  return `
    <div class="meld-group meld-${meld.type}${meld.addedKan ? " meld-added-kan" : ""}${highlight ? " meld-highlight" : ""}">
      ${meld.tiles.map((tile, index) => renderTileFace(tile, `tiny meld-tile meld-tile-${index}`)).join("")}
    </div>
  `;
}

function renderSeatInfoPanel(player: PublicGameState["players"][number], state: PublicGameState): string {
  const avatarSrc = `/${player.avatarKey || "avatar-default"}.png`;
  return `
    <div class="seat-info-card${player.seat === state.currentTurnSeat ? " current-turn" : ""}">
      <div class="seat-avatar-wrap">
        <img class="seat-avatar" src="${avatarSrc}" alt="${player.name} 頭像" />
      </div>
      <span class="seat-card-name">${player.name}</span>
    </div>
  `;
}

function renderSeatMeldPanel(player: PublicGameState["players"][number], state?: PublicGameState): string {
  if (player.melds.length === 0) {
    return `<div class="meld-strip"></div>`;
  }
  const highlightLast = Boolean(state?.latestClaim && state.latestClaim.seat === player.seat && state.latestClaim.seq > lastClaimSeq);
  return `<div class="meld-strip">${player.melds.map((meld, index) => renderMeld(meld, highlightLast && index === player.melds.length - 1)).join("")}</div>`;
}

function renderPondPanel(
  player: PublicGameState["players"][number],
  position: TablePosition,
  state: PublicGameState
): string {
  return `
    <div class="pond-panel ${position}">
      ${renderDiscardTiles(player.discards, state.latestDiscard, player.seat)}
    </div>
  `;
}

function renderOpenArea(
  _player: PublicGameState["players"][number],
  _position: TablePosition,
  _state: PublicGameState
): string {
  return "";
}

function renderSeatArea(
  player: PublicGameState["players"][number],
  position: TablePosition,
  state: PublicGameState
): string {
  const stackClass = position === "east" || position === "west" ? "seat-stack side" : "seat-stack";
  const inlineInfo = position === "south";
  const revealHand = Boolean(state.result) && position !== "south" && player.hand.length > 0;
  const infoPanel = renderSeatInfoPanel(player, state);
  const meldPanel = renderSeatMeldPanel(player, state);
  const openArea = renderOpenArea(player, position, state);
  const handPanel =
    revealHand
      ? renderRevealedHand(player.hand, position)
      : renderTileBacks(player.handCount, position === "east" || position === "west", position === "east" || position === "west" ? "side" : "");

  if (position === "north") {
    return `
      <div class="${stackClass}">
        <div class="north-player-bar">
          <div class="north-player-box north-player-open">${openArea}</div>
          <div class="north-player-lower">
            <div class="north-player-hand">${handPanel}</div>
          </div>
        </div>
      </div>
    `;
  }

  if (position === "west") {
    return `
      <div class="${stackClass}">
        ${handPanel}
        ${openArea}
      </div>
    `;
  }

  if (position === "east") {
    return `
      <div class="${stackClass}">
        ${handPanel}
        ${openArea}
      </div>
    `;
  }

  return `
    <div class="${stackClass}">
      ${infoPanel}
    </div>
  `;
}

function renderCenterSummary(state: PublicGameState): string {
  if (state.phase === "waiting") {
    const amHost = room?.hostId === playerId;
    return `
      <div class="center-summary-item">
        <span class="center-summary-label">牌桌待機</span>
        <span class="center-summary-value">${state.players.length} / 4</span>
      </div>
      <div class="center-summary-item">
        <span class="center-summary-label">中央按鈕</span>
        <span class="center-summary-value">${amHost ? "按下發牌" : "等待房主發牌"}</span>
      </div>
    `;
  }
  if (state.awaitingNextHand) {
    const viewerReady = state.viewerSeat !== null && state.nextHandReadySeats.includes(state.viewerSeat);
    return `
      <div class="center-summary-item">
        <span class="center-summary-label">本局結束</span>
        <span class="center-summary-value">${viewerReady ? "等待他家" : "按下繼續"}</span>
      </div>
      <div class="center-summary-item">
        <span class="center-summary-label">已準備</span>
        <span class="center-summary-value">${state.nextHandReadySeats.length}</span>
      </div>
      <div class="center-summary-item">
        <span class="center-summary-label">待確認</span>
        <span class="center-summary-value">${state.nextHandPendingSeats.length}</span>
      </div>
    `;
  }
  const latestDiscard = state.latestDiscard
    ? `${state.players[state.latestDiscard.seat]?.name ?? "玩家"} ${tileToText(state.latestDiscard.tile)}`
    : "-";
  return `
    <div class="center-summary-item">
      <span class="center-summary-label">當前輪次</span>
      <span class="center-summary-value">${state.players[state.currentTurnSeat]?.name ?? "-"}</span>
    </div>
    <div class="center-summary-item">
      <span class="center-summary-label">最新出牌</span>
      <span class="center-summary-value">${latestDiscard}</span>
    </div>
    <div class="center-summary-item">
      <span class="center-summary-label">剩餘牌</span>
      <span class="center-summary-value">${state.liveWallTilesRemaining}</span>
    </div>
  `;
}

function resultKey(state: PublicGameState): string {
  if (!state.result) {
    return "";
  }
  if ("winnerSeat" in state.result) {
    return [
      state.roomId,
      state.round.handIndex,
      state.result.winnerSeat,
      state.result.winType,
      state.result.winningTile,
      state.result.totalPoints
    ].join(":");
  }
  return [state.roomId, state.round.handIndex, "ryukyoku", state.result.tenpaiSeats.join(",")].join(":");
}

function formatPayment(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function buildNextHandStatus(state: PublicGameState): string {
  const readyNames = state.nextHandReadySeats
    .map((seat) => state.players[seat]?.name)
    .filter((name): name is string => Boolean(name));
  const pendingNames = state.nextHandPendingSeats
    .map((seat) => state.players[seat]?.name)
    .filter((name): name is string => Boolean(name));
  const readyText = readyNames.length > 0 ? readyNames.join("、") : "尚無";
  const pendingText = pendingNames.length > 0 ? pendingNames.join("、") : "全員已準備";
  return `
    <div class="score-continue-status">
      <div>已按繼續：${readyText}</div>
      <div>等待中：${pendingText}</div>
    </div>
  `;
}

function buildScoreDialog(state: PublicGameState): { summary: string; body: string } {
  if (!state.result) {
    return { summary: "", body: "" };
  }
  if ("winnerSeat" in state.result) {
    const result = state.result;
    const winner = state.players[result.winnerSeat];
    const loser = result.loserSeat !== undefined ? state.players[result.loserSeat] : null;
    const summary = `${winner.name}${result.winType === "ron" ? "榮和" : "自摸"} ${tileToText(result.winningTile)}，${result.totalPoints} 點`;
    const body = `
      <div class="score-summary-grid">
        <div>役種</div>
        <div>${result.yaku.join("、")}</div>
        <div>符翻</div>
        <div>${result.han} 飜 ${result.fu} 符</div>
        <div>放銃</div>
        <div>${loser ? loser.name : "無"}</div>
      </div>
      <div class="score-table">
        <div class="score-row score-row-header">
          <span>玩家</span>
          <span>本局增減</span>
          <span>目前總分</span>
        </div>
        ${state.players
          .map(
            (player, index) => `
              <div class="score-row${index === result.winnerSeat ? " winner" : ""}${index === result.loserSeat ? " loser" : ""}">
                <span>${player.name}</span>
                <span>${formatPayment(result.payments[index])}</span>
                <span>${player.score}</span>
              </div>
            `
          )
          .join("")}
      </div>
      ${state.awaitingNextHand ? buildNextHandStatus(state) : ""}
    `;
    return { summary, body };
  }
  const tenpaiNames = state.result.tenpaiSeats.length > 0 ? state.result.tenpaiSeats.map((seat) => state.players[seat].name).join("、") : "無";
  return {
    summary: `本局流局，聽牌：${tenpaiNames}`,
    body: `
      <div class="score-summary-grid">
        <div>結果</div>
        <div>流局</div>
        <div>聽牌</div>
        <div>${tenpaiNames}</div>
      </div>
      <div class="score-table">
        <div class="score-row score-row-header">
          <span>玩家</span>
          <span>本局增減</span>
          <span>目前總分</span>
        </div>
        ${state.players
          .map(
            (player) => `
              <div class="score-row">
                <span>${player.name}</span>
                <span>+0</span>
                <span>${player.score}</span>
              </div>
            `
          )
          .join("")}
      </div>
      ${state.awaitingNextHand ? buildNextHandStatus(state) : ""}
    `
  };
}

function updateScoreDialog(state: PublicGameState): void {
  if (!state.result || !scoreDialogBackdrop || !scoreDialogSummary || !scoreDialogBody) {
    return;
  }
  const dialog = buildScoreDialog(state);
  scoreDialogSummary.textContent = dialog.summary;
  scoreDialogBody.innerHTML = dialog.body;
  scoreDialogBackdrop.hidden = false;
}

function showResultPresentation(state: PublicGameState): void {
  if (!state.result || !resultOverlay || !resultOverlayCard || !resultOverlayBadge || !resultOverlayTitle || !resultOverlaySubtitle) {
    return;
  }
  resultOverlay.hidden = false;
  if (resultOverlayCat) {
    resultOverlayCat.hidden = true;
  }
  resultOverlay.classList.remove("state-self-win", "state-self-lose", "state-other-win", "state-draw");
  resultOverlayCard.classList.remove("show", "win", "draw");
  if ("winnerSeat" in state.result) {
    const winner = state.players[state.result.winnerSeat];
    const selfWin = state.viewerSeat === state.result.winnerSeat;
    const selfLose = state.result.loserSeat !== undefined && state.viewerSeat === state.result.loserSeat;
    resultOverlayBadge.textContent = state.result.winType === "ron" ? "榮和" : "自摸";
    if (selfWin) {
      if (resultOverlayCat) {
        resultOverlayCat.src = "/maneki-neko-win.png";
        resultOverlayCat.alt = "招財貓胡牌動畫";
        resultOverlayCat.hidden = false;
      }
      resultOverlayTitle.textContent = "你胡牌了！";
      resultOverlaySubtitle.textContent = `${tileToText(state.result.winningTile)} | ${state.result.han} 飜 ${state.result.fu} 符 | ${state.result.totalPoints} 點`;
      resultOverlay.classList.add("state-self-win");
    } else if (selfLose) {
      if (resultOverlayCat) {
        resultOverlayCat.src = "/maneki-neko-blasted.png";
        resultOverlayCat.alt = "被炸黑的招財貓動畫";
        resultOverlayCat.hidden = false;
      }
      resultOverlayTitle.textContent = "你放銃了";
      resultOverlaySubtitle.textContent = `${winner.name}${state.result.winType === "ron" ? "榮和" : "自摸"} ${tileToText(state.result.winningTile)} | ${state.result.totalPoints} 點`;
      resultOverlay.classList.add("state-self-lose");
    } else {
      if (resultOverlayCat) {
        resultOverlayCat.src = "/maneki-neko-cry.png";
        resultOverlayCat.alt = "哭泣招財貓動畫";
        resultOverlayCat.hidden = false;
      }
      resultOverlayTitle.textContent = `${winner.name}胡牌！`;
      resultOverlaySubtitle.textContent = `${state.result.winType === "ron" ? "榮和" : "自摸"} ${tileToText(state.result.winningTile)} | ${state.result.han} 飜 ${state.result.fu} 符 | ${state.result.totalPoints} 點`;
      resultOverlay.classList.add("state-other-win");
    }
    resultOverlayCard.classList.add("win");
  } else {
    resultOverlayBadge.textContent = "流局";
    resultOverlayTitle.textContent = "本局流局";
    resultOverlaySubtitle.textContent =
      state.result.tenpaiSeats.length > 0
        ? `聽牌：${state.result.tenpaiSeats.map((seat) => state.players[seat].name).join("、")}`
        : "無人聽牌";
    resultOverlay.classList.add("state-draw");
    resultOverlayCard.classList.add("draw");
  }
  window.requestAnimationFrame(() => {
    resultOverlayCard.classList.add("show");
  });
  if (overlayTimer !== null) {
    window.clearTimeout(overlayTimer);
    overlayTimer = null;
  }
  overlayTimer = window.setTimeout(() => {
    hideResultOverlay();
  }, 3200);

  updateScoreDialog(state);
}

function handleResultPresentation(state: PublicGameState): void {
  if (!state.result) {
    return;
  }
  const key = resultKey(state);
  if (!key || key === lastPresentedResultKey) {
    return;
  }
  lastPresentedResultKey = key;
  showResultPresentation(state);
}

function claimTypeLabel(type: "chi" | "pon" | "kan"): string {
  switch (type) {
    case "chi":
      return "吃！";
    case "pon":
      return "碰！";
    case "kan":
      return "槓！";
  }
}

function playClaimFlash(state: PublicGameState): void {
  if (!claimFlash || !claimFlashAvatar || !claimFlashText || !state.latestClaim) {
    return;
  }
  if (state.latestClaim.seq <= lastClaimSeq) {
    return;
  }
  lastClaimSeq = state.latestClaim.seq;
  const player = state.players[state.latestClaim.seat];
  if (!player) {
    return;
  }
  const avatarSrc = `/${player.avatarKey || "avatar-default"}.png`;
  claimFlashAvatar.src = avatarSrc;
  claimFlashAvatar.alt = player.name;
  claimFlashText.textContent = claimTypeLabel(state.latestClaim.type);
  claimFlashText.className = `claim-flash-text claim-type-${state.latestClaim.type}`;

  const position = relativePosition(state.viewerSeat, state.latestClaim.seat);
  const meldTarget = table?.querySelector(`#meld-fixed-${position} .meld-strip`);
  let shrinkX = 0;
  let shrinkY = 0;
  if (meldTarget) {
    const rect = meldTarget.getBoundingClientRect();
    shrinkX = rect.left + rect.width / 2 - window.innerWidth / 2;
    shrinkY = rect.top + rect.height / 2 - window.innerHeight / 2;
  }
  claimFlash.style.setProperty("--shrink-x", `${shrinkX}px`);
  claimFlash.style.setProperty("--shrink-y", `${shrinkY}px`);

  claimFlash.hidden = false;
  claimFlash.classList.remove("show");
  void claimFlash.offsetWidth;
  claimFlash.classList.add("show");
  if (claimFlashTimer !== null) {
    window.clearTimeout(claimFlashTimer);
  }
  claimFlashTimer = window.setTimeout(() => {
    claimFlash.classList.remove("show");
    claimFlash.hidden = true;
    claimFlashTimer = null;
  }, 1260);
}

function captureHandTilePosition(state: PublicGameState): { x: number; y: number; index: number } | null {
  if (!table || !state.latestDiscard) {
    return null;
  }
  const key = latestDiscardKey(state);
  if (!key || key === lastAnimatedDiscardKey) {
    return null;
  }
  const tableRect = table.getBoundingClientRect();
  const pawSize = CAT_PAW_SIZE;
  const fromPosition = relativePosition(state.viewerSeat, state.latestDiscard.seat);

  if (fromPosition === "south") {
    const tileButtons = handBox?.querySelectorAll<HTMLElement>(".tile-button");
    if (tileButtons && tileButtons.length > 0) {
      const idx = lastClickedTileIndex >= 0 && lastClickedTileIndex < tileButtons.length
        ? lastClickedTileIndex
        : Array.from(tileButtons).findIndex((btn) => btn.getAttribute("aria-label") === tileToText(state.latestDiscard!.tile));
      const pickIdx = idx >= 0 ? idx : 0;
      const picked = tileButtons[pickIdx];
      const rect = picked.getBoundingClientRect();
      lastClickedTileIndex = -1;
      const tileCenterX = rect.left - tableRect.left + rect.width / 2;
      const tileCenterY = rect.top - tableRect.top + rect.height / 2;
      const topLeft = pawTopLeftForCenter(tileCenterX, tileCenterY, fromPosition, pawSize);
      return {
        x: topLeft.x,
        y: topLeft.y,
        index: pickIdx
      };
    }
  }

  const selectorMap: Record<string, string> = {
    north: ".north-player-hand .tile-back",
    west: ".seat-zone.west .tile-back-row .tile-back",
    east: ".seat-zone.east .tile-back-row .tile-back"
  };
  const selector = selectorMap[fromPosition];
  if (selector) {
    const tiles = table.querySelectorAll<HTMLElement>(selector);
    if (tiles.length > 0) {
      const pickIndex = Math.min(tiles.length - 1, Math.floor(Math.random() * Math.min(tiles.length, 5)) + Math.floor(tiles.length / 3));
      const picked = tiles[pickIndex];
      const rect = picked.getBoundingClientRect();
      const tileCenterX = rect.left - tableRect.left + rect.width / 2;
      const tileCenterY = rect.top - tableRect.top + rect.height / 2;
      const topLeft = pawTopLeftForCenter(tileCenterX, tileCenterY, fromPosition, pawSize);
      return {
        x: topLeft.x,
        y: topLeft.y,
        index: pickIndex
      };
    }
  }
  return null;
}

let savedHandTilePos: { x: number; y: number; index: number } | null = null;

function renderGame(): void {
  if (!gameState || !table || !handBox || !actionsBox || !logsBox || !resultBox || !drawTileBox || !centerSummary) {
    return;
  }
  ensureTableSkeleton();
  const state = gameState;

  if (Date.now() < animationReadyTime) {
    lastAnimatedDiscardKey = latestDiscardKey(state);
    if (state.latestClaim) {
      lastClaimSeq = state.latestClaim.seq;
    }
    lastGamePhase = state.phase;
  }

  savedHandTilePos = captureHandTilePosition(state);

  const shouldPlayDealIntro =
    state.phase === "awaitingDiscard" &&
    (lastGamePhase === "waiting" || lastGamePhase === "handComplete");
  if (!state.result) {
    hideResultOverlay();
    hideScoreDialog();
    scoreDialogDismissed = false;
  } else if (!scoreDialogDismissed) {
    updateScoreDialog(state);
  }
  const viewerSeat = state.viewerSeat;
  for (const position of ["north", "west", "east", "south"] as TablePosition[]) {
    const zone = table.querySelector<HTMLElement>(`.seat-zone.${position}`);
    if (!zone) {
      continue;
    }
    const player = state.players.find((item) => relativePosition(viewerSeat, item.seat) === position);
    zone.innerHTML = player && position !== "south" ? renderSeatArea(player, position, state) : "";
  }
  for (const position of ["north", "west", "east", "south"] as TablePosition[]) {
    const pond = table.querySelector<HTMLElement>(`.pond-zone.${position}`);
    if (!pond) {
      continue;
    }
    const player = state.players.find((item) => relativePosition(viewerSeat, item.seat) === position);
    pond.innerHTML = player ? renderDiscardTiles(player.discards, state.latestDiscard, player.seat) : "";
  }
  centerSummary.innerHTML = renderCenterSummary(state);

  const scoreEls = { south: centerScoreSouth, north: centerScoreNorth, west: centerScoreWest, east: centerScoreEast };
  for (const position of ["south", "north", "west", "east"] as TablePosition[]) {
    const el = scoreEls[position];
    if (!el) {
      continue;
    }
    const player = state.players.find((item) => relativePosition(viewerSeat, item.seat) === position);
    el.textContent = player ? String(player.score) : "";
  }

  const infoEls: Record<string, HTMLElement | null> = { north: playerInfoNorth, west: playerInfoWest, east: playerInfoEast };
  for (const pos of ["north", "west", "east"] as TablePosition[]) {
    const el = infoEls[pos];
    if (!el) {
      continue;
    }
    const player = state.players.find((item) => relativePosition(viewerSeat, item.seat) === pos);
    el.innerHTML = player ? renderSeatInfoPanel(player, state) : "";
  }

  const self = state.players.find((player) => player.seat === state.viewerSeat);
  handBox.innerHTML = "";
  if (southPlayerInfoBox) {
    southPlayerInfoBox.innerHTML = self ? renderSeatInfoPanel(self, state) : "";
  }
  if (southPlayerOpenBox) {
    southPlayerOpenBox.innerHTML = "";
  }
  const meldEls: Record<string, HTMLElement | null> = { south: meldFixedSouth, north: meldFixedNorth, west: meldFixedWest, east: meldFixedEast };
  for (const pos of ["south", "north", "west", "east"] as TablePosition[]) {
    const el = meldEls[pos];
    if (!el) {
      continue;
    }
    const player = state.players.find((item) => relativePosition(viewerSeat, item.seat) === pos);
    el.innerHTML = player ? renderSeatMeldPanel(player, state) : "";
  }
  drawTileBox.innerHTML = "尚未摸牌";
  claimHintBox!.hidden = true;
  claimHintBox!.textContent = "目前沒有可碰牌提示。";
  if (readHintBox) {
    readHintBox.textContent = buildReadHints(state);
  }
  if (aiHintBox) {
    aiHintBox.textContent = buildAiHints(state);
  }
  if (self) {
    const sortedTiles = sortTiles([...self.hand]);
    const drawnTile = state.viewerDrawTile;
    const suggestedTile = state.recommendation?.tile ?? null;
    if (drawnTile) {
      drawTileBox.innerHTML = `
        <span class="draw-status-line">
          <span class="draw-status-main">摸牌：<span class="tile-chip" aria-label="${tileToText(drawnTile)}">${renderTileGraphic(drawnTile)}</span></span>
          <span class="draw-status-suggestion">${compactRecommendation(state)}</span>
        </span>
      `;
    } else {
      drawTileBox.innerHTML = `
        <span class="draw-status-line">
          <span class="draw-status-main">摸牌：-</span>
          <span class="draw-status-suggestion">${compactRecommendation(state)}</span>
        </span>
      `;
    }

    for (let tileIdx = 0; tileIdx < sortedTiles.length; tileIdx++) {
      const tile = sortedTiles[tileIdx];
      const discardAction = actionByTile("discard", tile);
      const tileButton = document.createElement("button");
      tileButton.className = "tile-button";
      tileButton.innerHTML = renderTileGraphic(tile);
      tileButton.setAttribute("aria-label", tileToText(tile));
      tileButton.dataset.tile = tile;
      tileButton.disabled = !discardAction;
      if (actionByTile("riichi", tile)) {
        tileButton.classList.add("riichi");
      }
      if (suggestedTile === tile) {
        tileButton.classList.add("suggested");
      }
      if (discardAction) {
        const capturedIdx = tileIdx;
        tileButton.addEventListener("click", () => {
          lastClickedTileIndex = capturedIdx;
          send({ type: "action", roomId: state.roomId, action: discardAction });
        });
      }
      handBox.append(tileButton);
    }
  }

  actionsBox.innerHTML = "";
  tableActionsFixedBox?.replaceChildren();
  const nonDiscardActions = state.legalActions.filter((item) => item.type !== "discard");
  const claimActions = nonDiscardActions.filter((action) =>
    action.type === "chi" || action.type === "pon" || action.type === "kan" || action.type === "ron" || action.type === "tsumo"
  );
  for (const action of nonDiscardActions) {
    const button = document.createElement("button");
    const glyph = actionGlyph(action);
    button.className = `action-word-btn action-${action.type}`;
    button.textContent = glyph;
    button.title = action.label;
    button.setAttribute("aria-label", action.label);
    button.dataset.glyphLength = String(glyph.length);
    button.addEventListener("click", () => {
      send({ type: "action", roomId: state.roomId, action });
    });
    if (claimActions.includes(action)) {
      button.addEventListener("mouseenter", () => updateClaimHighlights(claimActions, action));
      button.addEventListener("mouseleave", () => updateClaimHighlights(claimActions, null));
      button.addEventListener("focus", () => updateClaimHighlights(claimActions, action));
      button.addEventListener("blur", () => updateClaimHighlights(claimActions, null));
    }
    tableActionsFixedBox?.append(button);
  }
  if (tableActionsFixedBox) {
    tableActionsFixedBox.hidden = nonDiscardActions.length === 0;
  }

  const ponActions = state.legalActions.filter((action) => action.type === "pon");
  const chiActions = state.legalActions.filter((action) => action.type === "chi");
  const ronActions = state.legalActions.filter((action) => action.type === "ron");
  const tsumoActions = state.legalActions.filter((action) => action.type === "tsumo");
  if (ponActions.length > 0 || chiActions.length > 0 || ronActions.length > 0 || tsumoActions.length > 0) {
    claimHintBox!.hidden = false;
    const parts: string[] = [];
    if (tsumoActions.length > 0) {
      parts.push(`可自摸：${tsumoActions.map((action) => tileToText(action.tile!)).join("、")}`);
    }
    if (ronActions.length > 0) {
      parts.push(`可胡：${ronActions.map((action) => tileToText(action.tile!)).join("、")}`);
    }
    if (chiActions.length > 0) {
      parts.push(`可吃：${chiActions.map((action) => action.tiles?.map(tileToText).join("")).join("、")}`);
    }
    if (ponActions.length > 0) {
      parts.push(`可碰：${ponActions.map((action) => tileToText(action.tile!)).join("、")}`);
    }
    claimHintBox!.textContent = parts.join(" | ");
  }
  updateClaimHighlights(claimActions, null);

  logsBox.innerHTML = state.logs.map((line) => `<li>${line}</li>`).join("");
  resultBox.innerHTML = describeResult(state);
  const playedPawAnim = playCatPawForLatestDiscard(state);
  if (playedPawAnim && state.latestDiscard) {
    const discardPosition = relativePosition(state.viewerSeat, state.latestDiscard.seat);
    insertHandGapSpacer(discardPosition, state);
  }
  playClaimFlash(state);
  handleResultPresentation(state);
  if (shouldPlayDealIntro && table) {
    table.classList.remove("deal-intro");
    void table.offsetWidth;
    table.classList.add("deal-intro");
    if (dealIntroTimer !== null) {
      window.clearTimeout(dealIntroTimer);
    }
    dealIntroTimer = window.setTimeout(() => {
      table.classList.remove("deal-intro");
      dealIntroTimer = null;
    }, 1500);
  }
  lastGamePhase = state.phase;
}

function describeResult(state: PublicGameState): string {
  if (!state.result) {
    return "牌局進行中。";
  }
  if ("winnerSeat" in state.result) {
    const winner = state.players[state.result.winnerSeat];
    const loser = state.result.loserSeat !== undefined ? state.players[state.result.loserSeat] : null;
    return [
      `${winner.name}${state.result.winType === "ron" ? "榮和" : "自摸"} ${tileToText(state.result.winningTile)}`,
      `${state.result.han} 飜 ${state.result.fu} 符`,
      `役種：${state.result.yaku.join("、")}`,
      `得點：${state.result.totalPoints}`,
      loser ? `放銃：${loser.name}` : "放銃：無"
    ].join("<br />");
  }
  if (state.result.tenpaiSeats.length === 0) {
    return "本局流局，無人聽牌。";
  }
  return `本局流局，聽牌：${state.result.tenpaiSeats.map((seat) => state.players[seat].name).join("、")}`;
}

function windText(wind: string): string {
  switch (wind) {
    case "east":
      return "東";
    case "south":
      return "南";
    case "west":
      return "西";
    case "north":
      return "北";
    default:
      return wind;
  }
}

playerNameInput!.value = loadPlayerName();
roomCodeInput!.value = loadRoomId();
if (queryRoomId()) {
  roomCodeInput!.value = queryRoomId();
}
lanHint!.textContent = `${location.protocol}//${location.host}`;

createRoomButton?.addEventListener("click", () => {
  send({ type: "create_room", playerName: savePlayerName() });
});

joinRoomButton?.addEventListener("click", () => {
  const roomId = roomCodeInput?.value.trim().toUpperCase();
  if (!roomId) {
    alert("請輸入房間代碼。");
    return;
  }
  send({ type: "join_room", roomId, playerName: savePlayerName() });
});

requestStateButton?.addEventListener("click", () => {
  const roomId = room?.roomId || roomCodeInput?.value.trim().toUpperCase();
  if (!roomId) {
    alert("目前沒有房間代碼。");
    return;
  }
  send({ type: "request_state", roomId });
});

addAiButton?.addEventListener("click", () => {
  if (!room) {
    return;
  }
  send({ type: "add_ai", roomId: room.roomId });
});

startGameButton?.addEventListener("click", () => {
  if (!room) {
    return;
  }
  send({ type: "start_game", roomId: room.roomId });
});

leaveRoomButton?.addEventListener("click", () => {
  leaveCurrentRoom();
});

tableLeaveRoomButton?.addEventListener("click", () => {
  leaveCurrentRoom();
});

tableCenterButton?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  centerButtonPressed = true;
  tableCenterButton.classList.add("pressing");
  tableCenterButton.setPointerCapture(event.pointerId);
});

tableCenterButton?.addEventListener("pointerup", () => {
  if (!centerButtonPressed) {
    return;
  }
  centerButtonPressed = false;
  tableCenterButton.classList.remove("pressing");
  handleCenterButtonRelease();
});

tableCenterButton?.addEventListener("pointercancel", () => {
  centerButtonPressed = false;
  tableCenterButton.classList.remove("pressing");
});

tableCenterButton?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  tableCenterButton.classList.add("pressing");
});

tableCenterButton?.addEventListener("keyup", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  tableCenterButton.classList.remove("pressing");
  handleCenterButtonRelease();
});

scoreDialogCloseButton?.addEventListener("click", () => {
  scoreDialogDismissed = true;
  hideScoreDialog();
});

scoreDialogBackdrop?.addEventListener("click", (event) => {
  if (event.target === scoreDialogBackdrop) {
    hideScoreDialog();
  }
});

updateViewMode();
renderRoom();
connect();

function leaveCurrentRoom(): void {
  if (!room) {
    return;
  }
  leavingRoomId = room.roomId;
  hideResultOverlay();
  hideScoreDialog();
  send({ type: "leave_room", roomId: room.roomId });
}
