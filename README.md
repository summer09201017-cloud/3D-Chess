# 3D 幻影西洋棋(repo `3D-Chess`)

單機對 AI 的 3D 西洋棋 PWA。純靜態、零建置、可安裝、可離線。

## 線上網址(正版)

**https://3dchess-an.pages.dev** —— Cloudflare Pages 專案 `3dchess-an`。

- 德義作品集卡片:`3dchess-an`「3D 幻影西洋棋」(棋類)。
- 舊址 `3dchess-an.netlify.app` 已於 2026-09-03 改成 301 殼,轉到上面的正版(curl 實測 301)。
  ⚠ 這個 Netlify 站原本連著本 repo 的 GitHub **自動建置**:0903 推 README 就觸發重建、把 301 殼蓋回完整站。
  已把該站 `build_settings.stop_builds` 設為 true(照 skill `netlify-autobuild-stop`),之後 push 不再觸發 Netlify 建置、不燒點數。
- ⚠ **名字陷阱**:repo 叫 `3D-Chess`,但 **`3d-chess.pages.dev` 不是本 repo**——那是德義另一個作品
  「3D 西洋棋(線上多人)」(5×5×5 五層棋盤,作品集卡 `3d-chess-online`),源碼在另一顆硬碟、不在這台機的
  Cloudflare 帳號 Pages 清單裡(0903 使用者確認)。本 repo 的對賬/部署一律認 `3dchess-an`。
- 同家族另兩個西洋棋 repo:`3d-chess-co` → `3dchesscodex.pages.dev`(3D 西洋棋 CO);它們是不同迭代,各自一張卡。

## 功能

- 📅 **每日殘局**:每天一組 5 題(2026-08-31,自 3d-chess-co 垂直搬運)。
- 💡 **AI 提示**:借同一支 `getBestMove` 從玩家這邊算一手(2026-09-01)。**2026-09-07 v9 提示品質**:使用者退件「提示叫我吃、吃完被吃回=等價交換」。病因 ①只算子力 ⇒ 中局九成的手 0 分平手,而吃子排最前、同分不換人 ⇒ 等價交換永遠勝出;②深度 3 是奇數層,「我吃→他回吃→我再吃」看起來賺、第 4 步被吃回看不到(horizon)。修法:`js/ai.js` 加 PST 位置分(Michniewski 表 ÷10)、葉子吃子用 SEE(swap-list,含 x-ray)算到底、提示走 `getBestMove(chess,'hard',{forHint:true})` ⇒ `searchRootForHint` 兩段式:先搜安靜手,吃子要多賺 `HINT_TRADE_MARGIN`=5(半個兵)才建議;AI 對手仍走 `searchRoot`。曾試過真的走棋算到底(quiescence):中局 5~24 秒,不可用。測試 `test/ai.mjs`(12 項:手工陷阱局面 + 30 隨機中局用獨立裁判 refQuiesce 驗「不虧」+ 耗時 <3s;實測平均 0.5s、最慢 1.2s)。2026-09-07 提速 11 倍(中局 5.2s → 0.46s):
  ①走法先排序(MVV-LVA)再搜,alpha-beta 才剪得到 ②根層也收窄視窗 ③終局用「沒棋可走」判,不在每個葉子呼叫
  `game_over()/in_checkmate()/in_draw()`(0.10.3 每支都會再產生一次全部著法,`in_draw` 還重播整譜)
  ④最後一層不真走棋:SAN 尾巴 `#` 就是將死,其他用「子力 ± 吃子」算。38 局面差分測試分數逐一相同。
  ★ 剩下 92% 時間在 chess.js 自己的著法生成(每次都算 SAN),再快要換引擎。按下去先顯示「想一下…」再算(rAF → tick)。
- ↩ 悔棋、💾 存檔/讀檔、⚙️ 設定、📱 安裝 APP(PWA)。
- 🧭 **版面(2026-09-06~07,三場 session 接力)**:選單是貼底的 `#bottom-bar` 工具列(v4,以前被 `space-between` 擠到棋盤正中央);
  📜 走步歷史是可摺疊側欄(v5,`body.dock-open` 撐開 `--dock-w`,畫布與 UI 層一起讓位,不是蓋上去;≤768px 藏起);
  🏷️ 棋子頭上名牌 + 「🏷️ 棋名」開關鈕(v6,`board.js PIECE_LABEL_TEXT`,提示文字共用同一張表);
  ⛶ 直向放大鈕(v7,`#controls-panel` 裡的一顆 `.btn`,對 `#game-container` 全螢幕、進出補發 resize)。
- 🏷️ **棋名一律西洋棋叫法**:兵/騎士/主教/城堡/皇后/國王(2026-09-07 使用者拍板;名牌與提示同一張表,別另抄)。
  ✅ `js/puzzles.js` 的題名/提示已改成西洋棋叫法(雙城堡梯殺、一支城堡就夠…;2026-09-07 使用者拍板,v14),與 `3d-chess-co` 正本逐字同步(test/daily.mjs 只對賬 id/mateIn/FEN,題名可改)。

## 檔案

| 檔 | 用途 |
|---|---|
| `index.html` / `styles.css` | 殼層與版面。★ **`#ui-layer` 不准用 `justify-content: space-between`**——流內只剩「header / 按鈕列 / 版本」三塊時,按鈕列會被擠到畫面垂直正中央,正好蓋在棋盤上而且擋掉點擊(2026-09-06 修)。選單一律放 `#bottom-bar`(`margin-top:auto` 貼底),而且只有 `.btn` 本身 `pointer-events:auto`,全寬容器不吃點擊 |
| `js/game.js` `js/board.js` `js/ai.js` | 規則、棋盤渲染、AI |
| `js/puzzles.js` | 每日殘局題庫 |
| `js/save.js` `js/undo.js` `js/app.js` | 存檔、悔棋、接線 |
| `sw.js` | Service Worker,`CACHE_NAME = 'chess3d-v15'`(改殼層檔必 +1;v15 = 提示不建議等價交換(PST + SEE + 半兵門檻)、v14 = 題庫題名改城堡/騎士(兩站同步)、v9 = 選單搬到底部工具列、v10 = 走步歷史可摺疊側欄、v11 = 棋子名牌 + 提示提速、v12 = 提示棋名對齊名牌、v13 = 直向放大鈕 + manifest orientation any)。⚠ 這個 repo 一天內被三場 session 接力改過,**bump 前先 `grep CACHE_NAME sw.js` 看現值**,別憑記憶(0907 有一場寫「sw v10」其實沒 bump) |
| `manifest.json` / `icons/` | PWA |
| `test/daily.mjs` | `npm test`:每日殘局資料檢查 |
| `scripts/browser-check.mjs` | 真瀏覽器冒煙檢查 |

## 現況(2026-09-07 深夜)

- 線上 = `origin/main` = `177e368`(sw v13);`npm test` 63/0、線上 `browser-check` 26/0、零 pageerror。
- 今天做完:v4 選單貼底 → v5 走步歷史側欄 → v6 名牌 + AI 提速 11 倍 → v7 放大鈕 → 提示棋名對齊(v12)。全部已部署、已驗線上。
- ✅ 已改(v14,2026-09-07):`puzzles.js` 題名/提示的 車/馬/王 → 城堡/騎士/國王(兩站共用題庫,同步改)。
- 沒有進行中的工程;下一步看使用者。

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
