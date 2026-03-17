import http from "node:http";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import type { ClientMessage, ServerErrorMessage } from "../shared/types.js";
import { RoomManager } from "./room/RoomManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePublicDir = path.resolve(__dirname, "../dist/public");
const builtPublicDir = path.resolve(__dirname, "../public");
const publicDir = existsSync(builtPublicDir) ? builtPublicDir : sourcePublicDir;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();

app.use(
  express.static(publicDir, {
    setHeaders: (response) => {
      response.setHeader("Cache-Control", "no-store");
    }
  })
);
app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

wss.on("connection", (socket) => {
  let playerId = "";

  socket.on("message", (payload) => {
    try {
      const message = JSON.parse(payload.toString()) as ClientMessage;
      if (message.type === "hello") {
        playerId = message.playerId;
        roomManager.attachSocket(playerId, socket);
        socket.send(JSON.stringify({ type: "welcome", playerId }));
        return;
      }

      if (!playerId) {
        const error: ServerErrorMessage = { type: "error", message: "請先送出識別資訊。" };
        socket.send(JSON.stringify(error));
        return;
      }

      switch (message.type) {
        case "create_room": {
          roomManager.createRoom(playerId, message.playerName);
          return;
        }
        case "join_room": {
          roomManager.joinRoom(playerId, message.playerName, message.roomId);
          return;
        }
        case "add_ai": {
          roomManager.addAi(playerId, message.roomId);
          return;
        }
        case "start_game": {
          roomManager.startGame(playerId, message.roomId);
          return;
        }
        case "begin_hand": {
          roomManager.beginHand(playerId, message.roomId);
          return;
        }
        case "request_state": {
          roomManager.requestState(playerId, message.roomId);
          return;
        }
        case "continue_after_hand": {
          roomManager.continueAfterHand(playerId, message.roomId);
          return;
        }
        case "leave_room": {
          roomManager.leaveRoom(playerId, message.roomId);
          return;
        }
        case "action": {
          roomManager.handleAction(playerId, message.roomId, message.action);
          return;
        }
        default:
          return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "伺服器發生未知錯誤。";
      socket.send(JSON.stringify({ type: "error", message }));
    }
  });

  socket.on("close", () => {
    if (playerId) {
      roomManager.detachSocket(playerId);
    }
  });
});

const port = Number(process.env.PORT ?? "3000");
server.listen(port, "0.0.0.0", () => {
  console.log(`麻將伺服器已啟動：http://0.0.0.0:${port}`);
});
