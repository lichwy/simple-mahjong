# WebSocket 協議

此遊戲使用單一 WebSocket 連線，由伺服器維護唯一真實狀態。

## Client -> Server

- `hello`
  - 欄位：`playerId`
  - 用途：識別玩家，支援同一玩家重連

- `create_room`
  - 欄位：`playerName`
  - 用途：建立房間並成為房主

- `join_room`
  - 欄位：`roomId`, `playerName`
  - 用途：加入既有房間

- `add_ai`
  - 欄位：`roomId`
  - 用途：由房主補一名 AI

- `start_game`
  - 欄位：`roomId`
  - 用途：開始對局，空位自動補齊 AI

- `request_state`
  - 欄位：`roomId`
  - 用途：手動要求重新同步房間與牌局狀態

- `continue_after_hand`
  - 欄位：`roomId`
  - 用途：手局結束後按下繼續；所有真人玩家都送出後才開始下一局

- `action`
  - 欄位：`roomId`, `action`
  - 用途：送出玩家操作，例如打牌、吃碰槓、立直、和牌

## Server -> Client

- `welcome`
  - 欄位：`playerId`
  - 用途：確認伺服器已接受該識別碼

- `room_state`
  - 欄位：`room`
  - 用途：同步房間座位、房主、是否已開局

- `game_state`
  - 欄位：`roomId`, `state`
  - 用途：同步牌局公開資訊與該玩家專屬可見手牌/操作

- `error`
  - 欄位：`message`
  - 用途：操作非法或伺服器拒絕請求

- `info`
  - 欄位：`message`
  - 用途：一般資訊回饋
