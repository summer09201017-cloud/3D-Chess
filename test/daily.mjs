/* 🔬 📅 每日殘局(N 步殺)驗算 —— 幻影版(垂直搬運自 3d-chess-co)。
   跑法:node test/daily.mjs

   ★★ 這支**不是**信任「codex 版證過就算數」:那站是 chess.js 1.4.0(新式 API),
     這站是 **0.10.3(蛇底式 in_checkmate/game_over)**——引擎版本不同,
     規則實作可能有差異 ⇒ 16 題在**這個引擎上重新證明一次**。
     (垂直搬運最容易死在這裡:搬了程式、沒搬驗證。)

   釘五件:
     ①題庫合法:FEN 載得進 0.10.3、白先、局面沒結束
     ②★ mateIn 在**這個引擎**上也精確(N 步必殺、N-1 步殺不了)
     ③決定性:同一天同一題、UTC+8 換日、400 天輪出蓋滿
     ④對站上 AI(js/ai.js 的 minimax)實打:N 步內真的將死
     ⑤★ 防漂移:題庫內容與正本 3d-chess-co/puzzles.js **逐題相同**
       (兩份各自維護一定漂移;正本改了這裡要跟) */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chessModule from "chess.js";

const Chess = chessModule.Chess || chessModule;
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(path.join(here, "..", p), "utf8");

// 這站的 js/ 是全域 script ⇒ 用 new Function 取回題庫與 AI(不動產品程式)
const win = {};
new Function("window", src("js/puzzles.js"))(win);
const { DAILY_PUZZLES, DAILY_SET_SIZE, dailyPuzzleKey, puzzleForDate, puzzlesForDate } = win.ChessDaily;
/* 站上的 AI:class ChessAI(建構子不吃參數;**這站叫 getBestMove(chess, difficulty)**)。
   ⚠ 垂直搬運之雷:codex 版是 getBestMove(chess, preset) 匯出函式,這站是 class 方法,
     名字近似但不同物——搬運時照抄呼叫方式會 TypeError(首跑實測)。 */
const aiFactory = new Function(src("js/ai.js") + "\nreturn ChessAI;");
const ChessAI = aiFactory();

let pass = 0, fail = 0;
const ok = (label, cond, note = "") => {
  if (cond) { pass++; console.log("  🟢 " + label); }
  else { fail++; console.log("  🔴 " + label + (note ? "  → " + String(note).slice(0, 220) : "")); }
};
const section = (s) => console.log("\n── " + s + " ──");

/* ══ N 步殺證明器(0.10.3 蛇底式 API 版)══ */
function canMate(game, n) {
  if (n <= 0) return false;
  const moves = game.moves({ verbose: true });
  moves.sort((a, b) => (b.san.includes("#") || b.san.includes("+")) - (a.san.includes("#") || a.san.includes("+")));
  for (const m of moves) {
    game.move(m);
    if (game.in_checkmate()) { game.undo(); return true; }
    if (game.game_over()) { game.undo(); continue; }        // 逼和/僵局=這條路失敗
    let allDead = n > 1;
    if (allDead) {
      for (const reply of game.moves({ verbose: true })) {
        game.move(reply);
        const dead = canMate(game, n - 1);
        game.undo();
        if (!dead) { allDead = false; break; }
      }
    }
    game.undo();
    if (allDead) return true;
  }
  return false;
}
const minMate = (fen, cap = 4) => {
  for (let n = 1; n <= cap; n++) if (canMate(new Chess(fen), n)) return n;
  return 0;
};

/* ══ ① 合法 ══ */
section("① 題庫合法(" + DAILY_PUZZLES.length + " 題,chess.js 0.10.3)");
for (const p of DAILY_PUZZLES) {
  let why = "";
  try {
    const g = new Chess(p.fen);
    if (g.turn() !== "w") why = "不是白先";
    else if (g.game_over()) why = "開局就結束了";
    else if (g.moves().length === 0) why = "白方沒有合法手";
  } catch (e) { why = "FEN 壞了: " + e.message; }
  ok(`「${p.name}」在 0.10.3 上合法、白先、局面活著`, !why, why);
}

/* ══ ② 在這個引擎上重新證明 ══ */
section("② ★ mateIn 在 0.10.3 上也精確(不信任另一站的證明)");
for (const p of DAILY_PUZZLES) {
  const t0 = Date.now();
  const provedN = canMate(new Chess(p.fen), p.mateIn);
  const notLess = p.mateIn === 1 ? true : !canMate(new Chess(p.fen), p.mateIn - 1);
  const good = provedN && notLess;
  ok(`「${p.name}」精確 ${p.mateIn} 步殺(${Date.now() - t0}ms)`, good,
    good ? "" : `這個引擎上的最小殺步=${minMate(p.fen)}`);
}

/* ══ ③ 決定性 ══ */
section("③ 決定性與輪出");
{
  const t = Date.UTC(2026, 7, 31, 15, 59);
  ok("UTC 15:59 仍是台北 8/31", dailyPuzzleKey(t) === "2026-08-31", dailyPuzzleKey(t));
  ok("UTC 16:00 換成台北 9/01", dailyPuzzleKey(t + 60000) === "2026-09-01");
  const a = puzzleForDate("2026-08-31"), b = puzzleForDate("2026-08-31");
  ok("同一天必同一題", a.index === b.index && a.puzzle.id === b.puzzle.id);
  const hit = new Set();
  for (let i = 0; i < 400; i++) hit.add(puzzleForDate(dailyPuzzleKey(Date.UTC(2026, 7, 31) + i * 86400000)).index);
  ok("400 天內每一題都出過場", hit.size === DAILY_PUZZLES.length, `${hit.size}/${DAILY_PUZZLES.length}`);
}

/* ══ ③b 每日一組多題(0831 使用者點名「不要只有 1 題」)══ */
section("③b 每日一組:" + DAILY_SET_SIZE + " 題、決定性、不重複、由易到難");
{
  const a = puzzlesForDate("2026-08-31");
  const b = puzzlesForDate("2026-08-31");
  ok("一組 " + DAILY_SET_SIZE + " 題", a.puzzles.length === DAILY_SET_SIZE, String(a.puzzles.length));
  ok("★ 同一天同一組、同一順序(全世界一致)", JSON.stringify(a.indexes) === JSON.stringify(b.indexes), JSON.stringify(a.indexes));
  ok("同一組內不重複", new Set(a.indexes).size === a.indexes.length);
  const mates = a.puzzles.map((p) => p.mateIn);
  ok("由易到難排(mateIn 不遞減)", mates.every((v, i) => i === 0 || mates[i - 1] <= v), JSON.stringify(mates));
  const c = puzzlesForDate("2026-09-01");
  ok("隔天換一組", JSON.stringify(a.indexes) !== JSON.stringify(c.indexes), JSON.stringify(c.indexes));
  // 邊界:要求超過題庫大小 → 夾住、仍不重複
  const big = puzzlesForDate("2026-08-31", DAILY_PUZZLES.length + 99);
  ok("要求超過題庫時夾住且不重複", big.puzzles.length === DAILY_PUZZLES.length
    && new Set(big.indexes).size === DAILY_PUZZLES.length, String(big.puzzles.length));
  const one = puzzlesForDate("2026-08-31", 1);
  ok("要求 1 題可行(舊介面 puzzleForDate 走這條)", one.puzzles.length === 1
    && puzzleForDate("2026-08-31").puzzle.id === one.puzzles[0].id);
  // 400 天:每天都湊得出完整一組,而且題庫每題都出過場
  const seen = new Set();
  let allFull = true;
  for (let i = 0; i < 400; i += 1) {
    const s = puzzlesForDate(dailyPuzzleKey(Date.UTC(2026, 7, 31) + i * 86400000));
    if (s.puzzles.length !== DAILY_SET_SIZE) allFull = false;
    s.indexes.forEach((x) => seen.add(x));
  }
  ok("400 天每天都湊得出完整一組", allFull);
  ok("400 天內題庫每一題都出過場", seen.size === DAILY_PUZZLES.length, `${seen.size}/${DAILY_PUZZLES.length}`);
}

/* ══ ④ 對站上 AI 實打 ══ */
section("④ 證明器執白 vs 站上 AI(js/ai.js)執黑:N 步內真的殺得掉");
{
  const ai = new ChessAI();
  const origLog = console.log;
  for (const p of DAILY_PUZZLES) {
    const g = new Chess(p.fen);
    let whiteMoves = 0, mated = false;
    while (whiteMoves < p.mateIn && !g.game_over()) {
      const left = p.mateIn - whiteMoves;
      let picked = null;
      for (const m of g.moves({ verbose: true })) {
        g.move(m);
        const good = g.in_checkmate() || (!g.game_over()
          && g.moves({ verbose: true }).every((r) => { g.move(r); const d = canMate(g, left - 1); g.undo(); return d; }));
        g.undo();
        if (good) { picked = m; break; }
      }
      if (!picked) break;
      g.move(picked);
      whiteMoves++;
      if (g.in_checkmate()) { mated = true; break; }
      if (g.game_over()) break;
      console.log = () => {};                       // 站上 AI 每步都印思考時間,靜音
      const black = ai.getBestMove(g, "hard");
      console.log = origLog;
      if (!black) break;
      g.move(black);
    }
    ok(`「${p.name}」對站上 AI ${whiteMoves} 步將死`, mated && whiteMoves <= p.mateIn, `mated=${mated} moves=${whiteMoves}`);
  }
}

/* ══ ⑤ 防漂移:與正本題庫逐題相同 ══ */
section("⑤ ★ 題庫與正本(3d-chess-co)逐題相同");
{
  const CANDS = [
    path.join(here, "..", "..", "3d-chess-co", "puzzles.js"),
    path.join(here, "..", "..", "..", "3d-chess-co", "puzzles.js"),
  ];
  const other = CANDS.find((p) => existsSync(p));
  if (!other) {
    console.log("  🟠 找不到正本 3d-chess-co/puzzles.js —— **這一項沒驗到**(不算通過)");
    for (const c of CANDS) console.log("     找過:" + c);
    fail++;
  } else {
    const win2 = {};
    // 正本是 module(export)⇒ 去掉 export 再取值
    new Function("window", readFileSync(other, "utf8").replace(/^export /gm, "")
      + "\nwindow.__ref = DAILY_PUZZLES;")(win2);
    const mine = DAILY_PUZZLES.map((p) => `${p.id}|${p.mateIn}|${p.fen}`).join("\n");
    const ref = win2.__ref.map((p) => `${p.id}|${p.mateIn}|${p.fen}`).join("\n");
    ok("題數相同", DAILY_PUZZLES.length === win2.__ref.length, `${DAILY_PUZZLES.length} vs ${win2.__ref.length}`);
    ok("★ 每一題的 id/mateIn/FEN 逐字相同(正本改了這裡要跟)", mine === ref,
      mine === ref ? "" : "有題目漂移了——比對兩份 puzzles.js");
  }
}

console.log(`\n🔬 daily:${pass} 過 / ${fail} 失敗`);
process.exitCode = fail ? 1 : 0;
