// 🔬 每日殘局(一組多題)真瀏覽器冒煙 —— 幻影版。playwright-core + 系統 Edge/Chrome。
// 跑法:node scripts/browser-check.mjs   (先起本機伺服器,或 CHECK_URL=線上網址)
// 驗:每日鈕 → 今天第 1 題 → 解掉 → 進度 1/5 且「下一題」是第 2 題 → 解第 2 題 →
//     一般開局離開每日模式 → 每日模式不寫 PGN 自動存檔。
import { chromium } from "playwright-core";

const URL = process.env.CHECK_URL || "http://localhost:8798";
let browser = null;
for (const channel of ["msedge", "chrome"]) {
  try { browser = await chromium.launch({ channel, headless: true }); break; }
  catch { /* 換下一個 */ }
}
if (!browser) { console.error("找不到系統 Edge/Chrome"); process.exit(1); }

let pass = 0, fail = 0;
const ok = (cond, msg, note = "") => {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.error("  ✗ " + msg + (note ? " → " + note : "")); }
};

const page = await browser.newPage({ viewport: { width: 1200, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("dialog", (d) => d.accept());     // 每日鈕會 alert 題目說明
await page.goto(URL + "/?v=" + Date.now(), { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

ok(await page.locator("#btn-daily").count() === 1, "有「📅 每日殘局」鈕");
ok((await page.locator("#verTag").textContent()).includes("一組 5 題"), "verTag 講了一組 5 題");
ok(await page.evaluate(() => !!window.ChessDaily), "puzzles.js 載進來了(window.ChessDaily 在)");
ok(await page.evaluate(() => typeof window.__phantom.game.startDaily === "function"), "game 有 startDaily");

/* 💡 提示鈕:真的用滑鼠按(不是 evaluate 裡呼叫 showHint)。
   evaluate-not-click-guard 存在的理由就是這個 —— 繞過真點擊的話,
   「鈕被別的東西蓋住、按不到」這種病照樣全綠。 */
ok(await page.locator("#btn-hint").count() === 1, "有「💡 提示」鈕");
await page.click("#btn-hint");
// 提示現在是「先畫『想一下…』、下一個 tick 才算」,等它真的算出來,不賭固定毫秒(慢機器會假紅)
await page.waitForFunction(() => Boolean(window.__phantom.game._hint), null, { timeout: 20000 });
await page.waitForTimeout(150);
const hintA = await page.evaluate(() => {
  const g = window.__phantom.game;
  return {
    hint: g._hint && { from: g._hint.from, to: g._hint.to },
    selected: g.selectedSquare,
    status: g.uiStatus.textContent,
    legal: g._hint
      ? g.chess.moves({ square: g._hint.from, verbose: true }).some((m) => m.to === g._hint.to)
      : false,
    // 目的地那一格要真的變成紫色(判定=畫面,不是只看 state)
    purple: g._hint
      ? g.board3d.tiles[g._hint.to].material.color.getHex() === 0xa855f7
      : false,
  };
});
ok(Boolean(hintA.hint), "按下去算得出一手", JSON.stringify(hintA));
ok(hintA.status.includes("建議"), "狀態列講出建議", hintA.status);
ok(hintA.legal, "建議的那一手是合法著法");
ok(hintA.selected === hintA.hint.from, "順手幫你把那顆棋選起來", `${hintA.selected} vs ${hintA.hint.from}`);
ok(hintA.purple, "★ 目的地那一格真的變紫(不是被 selectSquare 的藍/紅蓋掉)");

await page.click("#btn-hint");                     // 同局面再按一次 ⇒ 同一手
await page.waitForTimeout(400);
const hintB = await page.evaluate(() => {
  const h = window.__phantom.game._hint;
  return h.from + h.to;
});
ok(hintB === hintA.hint.from + hintA.hint.to,
  "同一個局面按兩次 ⇒ 同一手(不跳針)", hintA.hint.from + hintA.hint.to + " vs " + hintB);

// 走一手之後,舊建議的 FEN 就對不上了 ⇒ 下次按會重算(不會指著過期的格子)
await page.evaluate(() => {
  const g = window.__phantom.game;
  g.handleSquareClick("e2");
  g.handleSquareClick("e4");
});
await page.waitForTimeout(500);
ok(await page.evaluate(() => {
  const g = window.__phantom.game;
  return g._hint.fen !== g.chess.fen();
}), "★ 走一手之後,上一手的建議自己就失效了(比對 FEN,不靠逐處清)");

// 回到乾淨的起點,別讓上面兩手污染下面的每日流程
await page.goto(URL + "/?v=" + Date.now(), { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

await page.evaluate(() => localStorage.removeItem("chess3d:daily:v1"));
await page.evaluate(() => localStorage.removeItem("chess3d_autosave"));

/** 用「必殺樹」解掉當前這一題(chess.js 就在頁面裡,借它算) */
const solveCurrent = () => page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__phantom.game;
  const target = g.dailyPuzzle.mateIn;
  function canMate(c, n) {
    if (n <= 0) return false;
    for (const m of c.moves({ verbose: true })) {
      c.move(m);
      if (c.in_checkmate()) { c.undo(); return true; }
      if (c.game_over()) { c.undo(); continue; }
      let allDead = n > 1;
      if (allDead) for (const r of c.moves({ verbose: true })) { c.move(r); const d = canMate(c, n - 1); c.undo(); if (!d) { allDead = false; break; } }
      c.undo();
      if (allDead) return true;
    }
    return false;
  }
  for (let guard = 0; guard < 10 && !g.chess.in_checkmate(); guard += 1) {
    while ((g.isAiThinking || g.chess.turn() !== "w") && !g.chess.game_over()) await sleep(150);
    if (g.chess.game_over()) break;
    const left = target - g.whiteMoveCount();
    const probe = new Chess(g.chess.fen());
    let picked = null;
    for (const m of probe.moves({ verbose: true })) {
      probe.move(m);
      const good = probe.in_checkmate() || (!probe.game_over()
        && probe.moves({ verbose: true }).every((r) => { probe.move(r); const d = canMate(probe, left - 1); probe.undo(); return d; }));
      probe.undo();
      if (good) { picked = m; break; }
    }
    if (!picked) break;
    g.handleSquareClick(picked.from);      // 與真手指同一條輸入管線
    await sleep(200);
    g.handleSquareClick(picked.to);
    await sleep(900);
  }
  await sleep(600);
  const prog = g.dailyProgress();
  return { mated: g.chess.in_checkmate(), moves: g.whiteMoveCount(), index: g.dailyIndex,
    name: g.dailyPuzzle.name, target, done: prog && prog.done, total: prog && prog.total,
    nextIdx: g.nextUnsolvedIndex(), status: document.getElementById("game-status").textContent,
    store: localStorage.getItem("chess3d:daily:v1"), auto: localStorage.getItem("chess3d_autosave") };
});

// 第 1 題
await page.click("#btn-daily");
await page.waitForTimeout(700);
const start = await page.evaluate(() => {
  const g = window.__phantom.game;
  const prog = g.dailyProgress();
  return { key: g.dailyKey, index: g.dailyIndex, total: prog.total, mateIn: g.dailyPuzzle.mateIn,
    line: document.getElementById("daily-line").textContent };
});
ok(start.total === 5 && start.index === 0, `開在今天那一組的第 1 題(共 ${start.total} 題)`, JSON.stringify(start));
ok(start.line.includes("第 1/5 題") && start.line.includes("已解 0 題"), "常駐狀態行帶進度", start.line);

const r1 = await solveCurrent();
ok(r1.mated && r1.moves <= r1.target, `第 1 題「${r1.name}」${r1.moves} 步將死(目標 ${r1.target})`, JSON.stringify(r1).slice(0, 160));
ok(r1.done === 1, "進度 1/5", `done=${r1.done}`);
ok(r1.nextIdx === 1, "下一題=第 2 題", `nextIdx=${r1.nextIdx}`);
ok(r1.status.includes("今天已解 1/5"), "結算訊息帶今天進度", r1.status);
ok(!r1.auto, "★ 每日模式沒寫 PGN 自動存檔(PGN 吃不下自訂 FEN)", String(r1.auto));

// 第 2 題:結算框裡的「📅 下一題」(★ 這顆就是冒煙抓到「框蓋住每日鈕」後補的)
ok(await page.locator("#btn-daily-next").isVisible(), "結算框有「📅 下一題」鈕(每日模式)");
ok(!(await page.locator("#btn-restart").isVisible()), "每日模式藏掉「再玩一局」(它會回一般對局)");
await page.click("#btn-daily-next");
await page.waitForTimeout(700);
const second = await page.evaluate(() => window.__phantom.game.dailyIndex);
ok(second === 1, "按「下一題」=接第 2 題", `index=${second}`);
const r2 = await solveCurrent();
ok(r2.mated && r2.done === 2, `第 2 題「${r2.name}」也解掉(進度 ${r2.done}/5)`, JSON.stringify(r2).slice(0, 140));
const rec = JSON.parse(r2.store || "{}");
ok(Object.keys(rec[start.key]?.solved || {}).length === 2, "★ 戰績每題分開記(" + JSON.stringify(rec[start.key]) + ")");

// 一般開局要離開每日模式
await page.evaluate(() => { const b = document.getElementById("btn-restart"); b.classList.remove("hidden"); b.click(); });
await page.waitForTimeout(600);
const left = await page.evaluate(() => ({ key: window.__phantom.game.dailyKey,
  hidden: document.getElementById("daily-line").classList.contains("hidden") }));
ok(!left.key && left.hidden, "一般開局=離開每日模式(狀態行收起來)", JSON.stringify(left));

ok(errors.length === 0, "整場零 pageerror", errors.join(" | ").slice(0, 200));

await browser.close();
console.log(`\n🔬 browser-check:${pass} 過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
