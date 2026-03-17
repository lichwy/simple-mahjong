# Simple Mahjong Local Setup

這個專案是一個本地可啟動的日式麻將遊戲，前後端都在同一個 Node.js 專案裡。

## 需要先安裝的工具

- `Node.js`
  建議使用 `20+`
- `npm`
  一般會隨 `Node.js` 一起安裝
- `git`
  只有在你要拉取或提交程式碼時需要

可用下面指令確認：

```bash
node -v
npm -v
git --version
```

## 第一次安裝依賴

在專案根目錄 `~/indeed/simple-mahjong` 下執行：

```bash
npm install
```

## Build

```bash
npm run build
```

這會用 `esbuild` 打包 client 和 server 程式。

## 本地啟動

```bash
npm start
```

啟動後預設監聽：

- 本機：`http://localhost:3000`
- 區網：`http://你的電腦IP:3000`

例如你的電腦 IP 如果是 `192.168.1.23`，其他同一個區網的裝置可以用：

```text
http://192.168.1.23:3000
```

健康檢查網址：

```text
http://localhost:3000/health
```

## 常用指令

```bash
npm install
npm run build
npm start
npm test
```

## 如果 3000 port 被占用

可以改用其他 port 啟動：

```bash
PORT=3001 npm start
```

對應網址就會變成：

```text
http://localhost:3001
```

## 補充

- 這個專案不需要另外安裝資料庫
- 前端資源和 WebSocket 服務都由同一個 Node.js server 提供
- 如果是第一次換到新機器，最常見問題就是還沒執行 `npm install`
# 日式麻將 LAN 對戰

一個以 `Node.js + WebSocket + HTML` 實作的日式麻將遊戲，支援：

- 繁體中文介面
- 區網多人房間
- AI 補位
- 東風戰對局流程
- 吃、碰、槓、立直、榮和、自摸

## 啟動

```bash
npm install
npm start
```

預設會開在 `http://0.0.0.0:3000`，同一區網其他裝置可用主機 IP 連入。

## 測試

```bash
npm test
```
