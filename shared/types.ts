export const WINDS = ["east", "south", "west", "north"] as const;
export type Wind = (typeof WINDS)[number];

export const DRAGONS = ["5z", "6z", "7z"] as const;

export type Suit = "m" | "p" | "s" | "z";
export type NumberTile =
  | "1m"
  | "2m"
  | "3m"
  | "4m"
  | "5m"
  | "6m"
  | "7m"
  | "8m"
  | "9m"
  | "1p"
  | "2p"
  | "3p"
  | "4p"
  | "5p"
  | "6p"
  | "7p"
  | "8p"
  | "9p"
  | "1s"
  | "2s"
  | "3s"
  | "4s"
  | "5s"
  | "6s"
  | "7s"
  | "8s"
  | "9s";
export type HonorTile = "1z" | "2z" | "3z" | "4z" | "5z" | "6z" | "7z";
export type Tile = NumberTile | HonorTile;

export type MeldType = "chi" | "pon" | "kan";
export type SelfActionType = "discard" | "riichi" | "tsumo" | "concealedKan" | "addedKan";
export type ClaimActionType = "pass" | "chi" | "pon" | "kan" | "ron";
export type ActionType = SelfActionType | ClaimActionType;
export type WinType = "ron" | "tsumo";
export type GamePhase =
  | "waiting"
  | "awaitingDiscard"
  | "awaitingClaims"
  | "handComplete"
  | "matchComplete";

export interface Meld {
  type: MeldType;
  tiles: Tile[];
  calledTile: Tile;
  fromSeat: number;
  open: boolean;
  addedKan?: boolean;
}

export interface DiscardTile {
  tile: Tile;
  tsumogiri: boolean;
  called: boolean;
  riichi: boolean;
}

export interface PlayerRuntimeState {
  seat: number;
  id: string;
  name: string;
  avatarKey: string;
  score: number;
  hand: Tile[];
  melds: Meld[];
  discards: DiscardTile[];
  seatWind: Wind;
  isAi: boolean;
  connected: boolean;
  riichiDeclared: boolean;
  riichiAccepted: boolean;
  ippatsu: boolean;
}

export interface ActionOption {
  actorSeat: number;
  type: ActionType;
  tile?: Tile;
  tiles?: Tile[];
  targetTile?: Tile;
  fromSeat?: number;
  label: string;
}

export interface RoundInfo {
  roundWind: Wind;
  handIndex: number;
  dealerSeat: number;
  riichiSticks: number;
  honba: number;
}

export interface HandResult {
  winnerSeat: number;
  loserSeat?: number;
  winType: WinType;
  winningTile: Tile;
  han: number;
  fu: number;
  totalPoints: number;
  payments: number[];
  yaku: string[];
}

export interface RyukyokuResult {
  tenpaiSeats: number[];
}

export interface VisiblePlayerState {
  seat: number;
  id: string;
  name: string;
  avatarKey: string;
  score: number;
  handCount: number;
  hand: Tile[];
  melds: Meld[];
  discards: DiscardTile[];
  seatWind: Wind;
  isAi: boolean;
  connected: boolean;
  riichiDeclared: boolean;
  riichiAccepted: boolean;
}

export interface AiInsight {
  seat: number;
  mode: string;
  strength: string;
  summary: string;
}

export interface RecommendationInfo {
  tile: Tile | null;
  reason: string;
  source: string;
  strength: string;
  status: string;
}

export interface PublicGameState {
  roomId: string;
  phase: GamePhase;
  viewerSeat: number | null;
  viewerDrawTile: Tile | null;
  players: VisiblePlayerState[];
  round: RoundInfo;
  wallTilesRemaining: number;
  liveWallTilesRemaining: number;
  doraIndicators: Tile[];
  currentTurnSeat: number;
  currentDrawSeat: number | null;
  latestDiscard: { seat: number; tile: Tile } | null;
  latestClaim: { seat: number; type: "chi" | "pon" | "kan"; seq: number } | null;
  pendingClaimSeats: number[];
  awaitingNextHand: boolean;
  nextHandReadySeats: number[];
  nextHandPendingSeats: number[];
  legalActions: ActionOption[];
  aiInsights: AiInsight[];
  recommendation: RecommendationInfo | null;
  logs: string[];
  result: HandResult | RyukyokuResult | null;
}

export interface LobbySeat {
  seat: number;
  playerId: string | null;
  name: string | null;
  isAi: boolean;
  connected: boolean;
  occupied: boolean;
}

export interface RoomSummary {
  roomId: string;
  hostId: string;
  tableReady: boolean;
  started: boolean;
  seats: LobbySeat[];
}

export interface ClientHelloMessage {
  type: "hello";
  playerId: string;
}

export interface ClientCreateRoomMessage {
  type: "create_room";
  playerName: string;
}

export interface ClientJoinRoomMessage {
  type: "join_room";
  roomId: string;
  playerName: string;
}

export interface ClientStartGameMessage {
  type: "start_game";
  roomId: string;
}

export interface ClientBeginHandMessage {
  type: "begin_hand";
  roomId: string;
}

export interface ClientAddAiMessage {
  type: "add_ai";
  roomId: string;
}

export interface ClientActionMessage {
  type: "action";
  roomId: string;
  action: ActionOption;
}

export interface ClientRequestStateMessage {
  type: "request_state";
  roomId: string;
}

export interface ClientContinueAfterHandMessage {
  type: "continue_after_hand";
  roomId: string;
}

export interface ClientLeaveRoomMessage {
  type: "leave_room";
  roomId?: string;
}

export type ClientMessage =
  | ClientHelloMessage
  | ClientCreateRoomMessage
  | ClientJoinRoomMessage
  | ClientStartGameMessage
  | ClientBeginHandMessage
  | ClientAddAiMessage
  | ClientActionMessage
  | ClientRequestStateMessage
  | ClientContinueAfterHandMessage
  | ClientLeaveRoomMessage;

export interface ServerWelcomeMessage {
  type: "welcome";
  playerId: string;
}

export interface ServerRoomStateMessage {
  type: "room_state";
  room: RoomSummary;
}

export interface ServerGameStateMessage {
  type: "game_state";
  roomId: string;
  state: PublicGameState;
}

export interface ServerErrorMessage {
  type: "error";
  message: string;
}

export interface ServerInfoMessage {
  type: "info";
  message: string;
}

export interface ServerLeftRoomMessage {
  type: "left_room";
  roomId: string;
  message: string;
}

export type ServerMessage =
  | ServerWelcomeMessage
  | ServerRoomStateMessage
  | ServerGameStateMessage
  | ServerErrorMessage
  | ServerInfoMessage
  | ServerLeftRoomMessage;
