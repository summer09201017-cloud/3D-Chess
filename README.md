# 3D 幻影西洋棋(repo `3D-Chess`)

單機對 AI 的 3D 西洋棋 PWA。純靜態、零建置、可安裝、可離線。

## 線上網址(正版)

**https://3dchess-an.pages.dev** —— Cloudflare Pages 專案 `3dchess-an`。

- 德義作品集卡片:`3dchess-an`「3D 幻影西洋棋」(棋類)。
- 舊址 `3dchess-an.netlify.app` 已於 2026-09-03 改成 301 殼,轉到上面的正版(curl 實測 301)。
- ⚠ **名字陷阱**:repo 叫 `3D-Chess`,但 **`3d-chess.pages.dev` 不是本 repo**——那是德義另一個作品
  「3D 西洋棋(線上多人)」(5×5×5 五層棋盤,作品集卡 `3d-chess-online`),源碼在另一顆硬碟、不在這台機的
  Cloudflare 帳號 Pages 清單裡(0903 使用者確認)。本 repo 的對賬/部署一律認 `3dchess-an`。
- 同家族另兩個西洋棋 repo:`3d-chess-co` → `3dchesscodex.pages.dev`(3D 西洋棋 CO);它們是不同迭代,各自一張卡。

## 功能

- 📅 **每日殘局**:每天一組 5 題(2026-08-31,自 3d-chess-co 垂直搬運)。
- 💡 **AI 提示**:借同一支 `getBestMove` 從玩家這邊算一手(2026-09-01)。
- ↩ 悔棋、💾 存檔/讀檔、⚙️ 設定、📱 安裝 APP(PWA)。

## 檔案

| 檔 | 用途 |
|---|---|
| `index.html` / `styles.css` | 殼層與版面 |
| `js/game.js` `js/board.js` `js/ai.js` | 規則、棋盤渲染、AI |
| `js/puzzles.js` | 每日殘局題庫 |
| `js/save.js` `js/undo.js` `js/app.js` | 存檔、悔棋、接線 |
| `sw.js` | Service Worker,`CACHE_NAME = 'chess3d-v6'`(改殼層檔必 +1) |
| `manifest.json` / `icons/` | PWA |
| `test/daily.mjs` | `npm test`:每日殘局資料檢查 |
| `scripts/browser-check.mjs` | 真瀏覽器冒煙檢查 |

## 跑起來 / 測試

```bash
npx serve .            # 或任何靜態伺服器;直接雙擊 index.html 會讓 SW 失效
npm test               # node test/daily.mjs
```

## 部署(手動,push 不會上線)

```bash
npx wrangler pages deploy . --project-name 3dchess-an --branch main   # --branch main 必帶,否則進 Preview
curl -s "https://3dchess-an.pages.dev/sw.js?b=$RANDOM" | grep CACHE_NAME   # 要是新版號
```

改了 `index.html` / CSS / manifest / icons 任何殼層檔,先把 `sw.js` 的 `CACHE_NAME` 版本 +1 再部署,
否則已安裝的 PWA 永遠看到舊版。

## 帳本

作品集已收、`sites.json` 棋類已登。新功能上線後照 skill `portfolio-ledger-guard` 收尾。

---
GitHub:`summer09201017-cloud/3D-Chess`。本 README 2026-09-03 補(此前文件沒寫網址,作品集對賬只能靠名字猜到本 repo)。
