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


/* ══════ 🐾 動物對手(2026-09-28,skill animal-opponent-kit 第七個活例;照 3D-Xiangqi / gomoku3d ⑩ 段)══════
   檔案側對賬 → 真點擊設定面板選三段 + 開新局(中等・白)→ 坐對面 / 鐵則遍歷 / 頭在畫面裡 / 凳子落地 / 狀態列帶臉 /
   臉沒被 header・工具列蓋到(桌機・手機橫向・直向)→ 讓位縮盤 ≤ 25% → 走 e2e4 等牠回手(figs.log 有 think + place)
   → 姿勢手動推時間(無頭 fps 低,等真實秒數等不到)→ 🔃 換邊仍坐對面 → 對局視角 → 三段開關 → 玩黑棋牠坐白方那側 → 人聲 runtime → 每日 = 🦉。
   ★ 本站世界 Y-up:pos 回世界 XZ,相機在 +z(白方)時牠在 -z。 */
console.log("—— 🐾 動物對手 ——");
{
  const fs = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { VOICE_FILES } = await import(pathToFileURL(join(root, "js", "voicePhrases.js")).href);
  const vdir = join(root, "voice");
  const mp3 = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => f.endsWith(".mp3")).sort() : [];
  const want = [...VOICE_FILES].sort();
  ok(mp3.join() === want.join(), `🗣 voice/ 有 ${mp3.length} 支 mp3,跟詞庫 ${want.length} 句一一對應`);
  const sw = fs.readFileSync(join(root, "sw.js"), "utf8");
  const missing = mp3.filter((f) => !sw.includes(`"./voice/${f}"`));
  ok(missing.length === 0 && sw.includes('"./voice/manifest.json"'), `🗣 sw.js 清單含 manifest + 每支 mp3(gen-voice 照目錄重生)${missing.length ? ":漏 " + missing.join(",") : ""}`);
  let manifestOk = false;
  try { const mf = JSON.parse(fs.readFileSync(join(vdir, "manifest.json"), "utf8")); manifestOk = mp3.length > 0 && mp3.every((f) => mf[f.replace(/\.mp3$/, "")] === "voice/" + f); } catch { /* 沒烤 */ }
  ok(manifestOk, "🗣 manifest.json 的鍵值跟目錄一致");
  const tiny = mp3.filter((f) => fs.statSync(join(vdir, f)).size < 2048);
  ok(tiny.length === 0, `🗣 每支 mp3 > 2KB(空檔 = 烤失敗)${tiny.length ? ":" + tiny.join(",") : ""}`);
  const webSpeech = fs.readdirSync(join(root, "js")).filter((f) => f.endsWith(".js") && fs.readFileSync(join(root, "js", f), "utf8").includes("speech" + "Synthesis"));
  ok(webSpeech.length === 0, `🗣 js/ 裡沒有 Web Speech 機器聲${webSpeech.length ? ":" + webSpeech.join(",") : ""}`);
  const kit = join(process.env.USERPROFILE || process.env.HOME || "", ".claude", "skills", "animal-opponent-kit", "assets");
  if (fs.existsSync(kit)) {
    const drift = [["animals.js", "animals.js"], ["voice.js", "voice.js"], ["three-shim.js", "three-global-shim.js"]]
      .filter(([site, asset]) => fs.readFileSync(join(root, "js", site), "utf8") !== fs.readFileSync(join(kit, asset), "utf8")).map(([site]) => site);
    ok(drift.length === 0, `🐾 引擎三支與 skill 同一份${drift.length ? ":漂移 " + drift.join(",") : ""}`);
  }
}
await page.setViewportSize({ width: 1200, height: 860 });
await page.click("#btn-settings");
await page.waitForTimeout(400);
await page.click('#pet-row [data-pet="voice"]');
ok(await page.locator('#pet-row .pet-opt[aria-pressed="true"]').getAttribute("data-pet") === "voice", "🐾 設定面板有三段動物開關,按了會亮");
await page.selectOption("#ai-difficulty", "medium");
await page.selectOption("#player-color", "w");
await page.click("#btn-new-game");
await page.waitForFunction(() => { const g = window.__phantom.game; return g.opponent && g.opponent.kind === "cat" && !g.dailyKey && g.playerColor === "w"; }, null, { timeout: 5000 });
await page.waitForTimeout(500);
const pet0 = await page.evaluate(() => {
  const O = window.__phantom.game.opponent, f = O.figure;
  let neck = 0, eyes = 0, ears = 0, brows = 0, mouth = 0;
  f.group.traverse((o) => { if (o.userData.neck) neck++; if (o.userData.eye) eyes++; if (o.userData.ear) ears++; if (o.userData.brow) brows++; if (o.userData.mouth) mouth++; });
  return { ...O.probe(), neck, eyes, ears, brows, mouth, petName: document.getElementById("pet-name").textContent,
    petLineShown: !document.getElementById("pet-line").classList.contains("hidden"), petOn: document.body.classList.contains("pet-on"), capsule: !!window.THREE.CapsuleGeometry };
});
ok(pet0.figure && pet0.visible && pet0.kind === "cat" && pet0.pos.z < 0, `🐾 中等 ⇒ 🐱 橘貓坐在對面(黑方那一側 z<0,世界 ${JSON.stringify(pet0.pos)},scale ${pet0.scale})`);
ok(pet0.capsule, "🐾 three-shim 補上了 r128 沒有的 CapsuleGeometry");
ok(pet0.neck === 1 && pet0.eyes === 2 && pet0.ears === 2 && pet0.brows === 2 && pet0.mouth === 1, "🐾 人物鐵則遍歷:脖子 1、眼 2、耳 2、眉 2、嘴 1");
ok(pet0.head.inside, `🐾 桌機:頭頂在畫面裡(NDC ${pet0.head.x}, ${pet0.head.y})`);
ok(pet0.stoolY <= pet0.floorY + 0.05, `🐾 凳子不懸空(凳底 y ${pet0.stoolY} ≤ 底座底 ${pet0.floorY})`);
ok(pet0.petLineShown && /^🐱/.test(pet0.petName) && pet0.petOn, `🐾 狀態列對手名字帶動物(${pet0.petName})、body.pet-on`);
const hudHits = (box) => [...document.querySelectorAll("#ui-layer header, #bottom-bar, #view-panel, #history-dock")].filter((el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !(r.right < box.l || r.left > box.r || r.bottom < box.t || r.top > box.b);
}).map((el) => el.id || el.tagName.toLowerCase());
const faceAt = () => page.evaluate((fn) => { const hits = eval(fn); const p = window.__phantom.game.opponent.probe(); return { box: p.headBox, head: p.head, hits: hits(p.headBox) }; }, `(${hudHits.toString()})`);
const faceDesk = await faceAt();
ok(faceDesk.hits.length === 0, `🐾 桌機:牠的臉沒被 header / 工具列蓋到(頭框 ${JSON.stringify(faceDesk.box)}${faceDesk.hits.length ? ";蓋到 " + faceDesk.hits.join(",") : ""})`);
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(600);
const faceLand = await faceAt();
ok(faceLand.head.inside && faceLand.hits.length === 0, `🐾 手機橫向:頭在畫面裡(${faceLand.head.x}, ${faceLand.head.y})、臉沒被蓋到${faceLand.hits.length ? ":" + faceLand.hits.join(",") : ""}`);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(700);
const facePort = await faceAt();
ok(facePort.head.inside && facePort.hits.length === 0, `🐾 手機直向:頭在畫面裡(${facePort.head.x}, ${facePort.head.y})、臉沒被蓋到${facePort.hits.length ? ":" + facePort.hits.join(",") : ""}`);
await page.setViewportSize({ width: 1200, height: 860 });
await page.waitForTimeout(600);
const shrink = await page.evaluate(() => {
  const g = window.__phantom.game, b = g.board3d;
  const px = (sq) => { const t = b.tiles[sq]; const v = new THREE.Vector3(t.position.x, 0.1, t.position.z).project(b.camera); return { x: (v.x + 1) / 2 * b.width, y: (1 - v.y) / 2 * b.height }; };
  const width = () => { const a = px("a1"), h = px("h1"); return Math.hypot(h.x - a.x, h.y - a.y); };
  const on = width();
  g.opponent.setMode("off"); const off = width();
  g.opponent.setMode("voice");
  return { on: Math.round(on), off: Math.round(off), ratio: +(on / off).toFixed(3) };
});
ok(shrink.ratio >= 0.75 && shrink.ratio <= 1.0001, `🐾 為牠讓位但棋盤最多縮 25%(開 ${shrink.on}px / 關 ${shrink.off}px = ${shrink.ratio})`);
/* 走一手(e2e4)等牠回手:think 在牠開算時、place 在牠落子後 —— 看 figs.log,不是 grep 程式碼 */
const moved = await page.evaluate(async () => {
  const g = window.__phantom.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g.handleSquareClick("e2"); g.handleSquareClick("e4");
  for (let i = 0; i < 60 && !(g.chess.turn() === "w" && !g.isAiThinking && g.opponent.figs.log.some((e) => e.kind === "place")); i++) await sleep(250);
  await sleep(200);
  return { turn: g.chess.turn(), log: g.opponent.figs.log.map((e) => e.kind), focus: !!g._focus, history: g.chess.history().length };
});
ok(moved.turn === "w" && moved.history >= 2 && moved.log.includes("think") && moved.log.includes("place") && moved.focus, `🐾 事件真的接到(figs.log):${moved.log.join(",")}`);
const pose = await page.evaluate(() => {
  const O = window.__phantom.game.opponent, f = O.figure, F = O.figs;
  const said = []; const o = O.voice.say.bind(O.voice); O.voice.say = (a, e, d) => { said.push(a + ":" + e); return o(a, e, d); };
  O.react("win", "win"); F.update(0.4);
  const up = { armL: +f.arms[0].rotation.x.toFixed(2), armR: +f.arms[1].rotation.x.toFixed(2), open: f.mouthOpen.visible };
  F.update(3.5); F.update(0.5);
  const back = { armL: +f.arms[0].rotation.x.toFixed(2), smile: f.smile.visible };
  O.react("lose", "lose"); F.update(0.4);
  const sad = { pitch: +f.head.rotation.x.toFixed(2), smileZ: +f.smile.rotation.z.toFixed(2) };
  F.update(3.5); F.update(0.5);
  O.react("think", null); F.update(0.4);
  const think = { armR: +f.arms[1].rotation.x.toFixed(2), tilt: +f.head.rotation.z.toFixed(2) };
  O.cancel(); F.update(1);
  O.voice.say = o;
  return { up, back, sad, think, said };
});
ok(pose.up.armL < -2.2 && pose.up.armR < -2.2 && pose.up.open, `🐾 win:雙手高舉 + 張嘴(${JSON.stringify(pose.up)})`);
ok(Math.abs(pose.back.armL + 1.2) < 0.15 && pose.back.smile, `🐾 反應完回休息姿勢、笑臉回來(${JSON.stringify(pose.back)})`);
ok(pose.sad.pitch > 0.3 && pose.sad.smileZ < 1.6, `🐾 lose:低頭 + 苦臉(${JSON.stringify(pose.sad)})`);
ok(pose.think.armR < -1.9 && pose.think.tilt < -0.05, `🐾 think:手托腮、頭歪(${JSON.stringify(pose.think)})`);
ok(pose.said.join(" ") === "cat:win cat:lose", `🗣 同一個入口也叫了人聲:${pose.said.join(" ")}`);
/* 🔃 換邊(真的按面板那顆):相機轉到 -z ⇒ 牠要坐到 +z(還是你對面),頭還在畫面裡 */
await page.click("#btn-camera");
await page.waitForTimeout(300);
const beforeFlip = await page.evaluate(() => window.__phantom.game.opponent.probe().pos);
await page.click("[data-vk-flip]");
await page.waitForTimeout(900);
const afterFlip = await page.evaluate(() => { window.__phantom.game.opponent.update(0.016); return window.__phantom.game.opponent.probe(); });
ok(Math.sign(beforeFlip.z) !== Math.sign(afterFlip.pos.z) && afterFlip.head.inside, `🐾 🔃 換邊後牠還是坐你對面(z ${beforeFlip.z} → ${afterFlip.pos.z})、頭在畫面裡(${afterFlip.head.x}, ${afterFlip.head.y})`);
await page.click('[data-vk-view="sit"]');
await page.waitForTimeout(900);
const sitPet = await page.evaluate(() => window.__phantom.game.opponent.probe().head);
ok(sitPet.inside, `🐾 對局視角(34°):頭頂在畫面裡(${sitPet.x}, ${sitPet.y})`);
await page.click("[data-vk-reset]");
await page.waitForTimeout(600);
await page.click("#btn-view-close");
const toggled = await page.evaluate(() => {
  const O = window.__phantom.game.opponent;
  O.setMode("off"); const off = { visible: O.figure.group.visible, saved: localStorage.getItem("chess3d-pet") };
  O.setMode("mute"); const mute = { visible: O.figure.group.visible, voiceOn: O.voiceOn };
  O.setMode("voice");
  return { off, mute };
});
ok(toggled.off.visible === false && toggled.off.saved === "off", `🐾 關掉 ⇒ 隱藏、localStorage 記 off(${JSON.stringify(toggled.off)})`);
ok(toggled.mute.visible === true && toggled.mute.voiceOn === false, `🐾 不出聲 ⇒ 還坐著、不唸(${JSON.stringify(toggled.mute)})`);
/* 玩黑棋:相機到 -z(黑方那側)⇒ 牠(白方)坐 +z,還是你對面;AI 先走一手 */
await page.click("#btn-settings");
await page.waitForTimeout(300);
await page.selectOption("#player-color", "b");
await page.click("#btn-new-game");
await page.waitForFunction(() => { const g = window.__phantom.game; return g.playerColor === "b" && g.chess.history().length >= 1 && !g.isAiThinking; }, null, { timeout: 10000 });
await page.waitForTimeout(400);
const black = await page.evaluate(() => ({ ...window.__phantom.game.opponent.probe(), cam: +window.__phantom.game.board3d.camera.position.z.toFixed(2) }));
ok(black.cam < 0 && black.pos.z > 0 && black.head.inside, `🐾 玩黑棋 ⇒ 相機到 z<0、牠坐白方那側 z>0(${JSON.stringify(black.pos)})、頭在畫面裡`);
await page.click("#btn-settings");
await page.waitForTimeout(300);
await page.selectOption("#player-color", "w");
await page.click("#btn-new-game");
await page.waitForTimeout(500);
await page.waitForFunction(() => window.__phantom.game.voice && window.__phantom.game.voice.ready(), null, { timeout: 10000 }).catch(() => {});
const v = await page.evaluate(() => { const V = window.__phantom.game.voice; return { ready: V.ready(), has: V.has("owl", "check"), yes: V.say("cat", "win"), no: V.say("cat", "nope") }; });
ok(v.ready && v.has && v.yes === true && v.no === false, `🗣 人聲 runtime:manifest 載到、cat-win 送去放、沒烤的不唸(${JSON.stringify(v)})`);
await page.click("#btn-daily");
await page.waitForFunction(() => { const g = window.__phantom.game; return g.dailyKey && g.opponent.kind === "owl"; }, null, { timeout: 5000 });
const owl = await page.evaluate(() => ({ ...window.__phantom.game.opponent.probe(), name: document.getElementById("pet-name").textContent }));
ok(owl.kind === "owl" && owl.visible && owl.head.inside && /^🦉/.test(owl.name), `🐾 每日殘局 ⇒ 🦉 貓頭鷹守黑方(${owl.name};頭 ${owl.head.x}, ${owl.head.y})`);

/* 🎲 擲骰 / 擲硬幣決定先後(0929,skill dice-coin-toss):
   ★ 刻意緊接在每日殘局之後擲:那時坐著的是 🦉,浮層要印「這一局要坐的」🐱(中等),不是上一局的 🦉。
   判定=畫面:matrix3d 反推朝上那面 = 記錄值;贏的人執白;執黑 ⇒ AI 先走、相機到 z<0、悔到開局 AI 再走一次。
   ★ 等「開始鈕出現 / AI 走完」這種狀態,不用 waitForTimeout 等動畫(無頭 fps 低)。 */
console.log("—— 🎲 擲骰決定先後 ——");
const sideState = () => page.evaluate(() => { const g = window.__phantom.game; return {
  color: g.playerColor, plies: g.chess.history().length, turn: g.chess.turn(), camZ: g.board3d.camera.position.z, thinking: g.isAiThinking,
  status: document.getElementById("game-status") ? document.getElementById("game-status").textContent : g.uiStatus.textContent }; });
ok(await page.locator('#player-color option').count() === 4, "🎲 玩家顏色多兩個選項:擲骰 / 擲硬幣");
for (const kind of ["dice", "coin"]) {
  await page.click("#btn-settings");
  await page.selectOption("#player-color", kind);
  await page.selectOption("#ai-difficulty", "medium");
  await page.click("#btn-new-game");
  await page.waitForSelector(".dt-ov .dt-go:not([hidden])", { timeout: 15000 });
  const t = await page.evaluate(async () => {
    const els = [...document.querySelectorAll(".dt-die,.dt-coin")];
    return { shown: (await Promise.all(els.map((el) => window.__phantom.topFace(el)))).map(String), rec: els.map((el) => el.dataset.v), msg: document.querySelector(".dt-msg").textContent,
      seats: [...document.querySelectorAll(".dt-seat")].map((s) => s.textContent.trim().slice(0, 12)),
      firstSeat: [...document.querySelectorAll(".dt-seat")].findIndex((s) => s.classList.contains("first")), goH: document.querySelector(".dt-go").getBoundingClientRect().height };
  });
  ok(t.shown.join() === t.rec.join(), `${kind}:畫面朝上 = 記錄值(畫面 ${t.shown} / 記錄 ${t.rec})`);
  ok(t.goH >= 44, `${kind}:開始鈕 ≥44px(${t.goH})`);
  if (kind === "dice") ok(t.seats.some((s) => s.includes("🐱")) && !t.seats.some((s) => s.includes("🦉")), `🎲 浮層是這一局要坐的 🐱(中等),不是上一局的 🦉(${t.seats.join(" / ")})`);
  const youFirst = kind === "coin" ? t.shown[0] === "heads" : t.firstSeat === 0;
  await page.click(".dt-go");
  await page.waitForFunction(() => !document.querySelector(".dt-ov"), null, { timeout: 5000 });
  await page.waitForFunction(() => { const g = window.__phantom.game; return !g.isAiThinking && g.chess.turn() === g.playerColor && !g.dailyKey; }, null, { timeout: 20000 });
  const s = await sideState();
  ok(s.color === (youFirst ? "w" : "b") && (s.color === "b" ? s.camZ < 0 : s.camZ > 0) && s.plies === (s.color === "b" ? 1 : 0),
    `${kind}:${t.msg} ⇒ 你執 ${s.color}、相機 z=${s.camZ.toFixed(1)}、已走 ${s.plies} 手`);
  ok(await page.evaluate((k) => document.getElementById("player-color").value === k, kind), `${kind}:選單還留著 ${kind}(再玩一局照樣重擲)`);
}
// 執黑:局號守門 —— AI 還在想(一開局就在想)時馬上按新局執白 ⇒ 舊那手不可跑進新局
await page.click("#btn-settings");
await page.selectOption("#player-color", "b");
await page.click("#btn-new-game");
await page.waitForFunction(() => window.__phantom.game.isAiThinking, null, { timeout: 5000 });
await page.click("#btn-settings");
await page.selectOption("#player-color", "w");
await page.click("#btn-new-game");
await page.waitForFunction(() => { const g = window.__phantom.game; return g.playerColor === "w" && !g.isAiThinking; }, null, { timeout: 5000 });
await page.waitForFunction(() => document.getElementById("ai-thinking").classList.contains("hidden"), null, { timeout: 5000 }).catch(() => {});
await page.evaluate(() => new Promise((r) => setTimeout(r, 900)));   // 舊那手的 500ms 計時一定已到點(真時鐘,不是遊戲時間)
const guard = await sideState();
ok(guard.plies === 0 && guard.turn === "w", `🎲 AI 想到一半換新局 ⇒ 舊那手作廢(新局已走 ${guard.plies} 手、輪到 ${guard.turn})`);
ok(await page.evaluate(() => document.getElementById("ai-thinking").classList.contains("hidden")), "🎲 作廢那手不留「AI 思考中」");
// 執黑:AI 先走 → 自動存檔記執黑 → 悔棋悔到開局 AI 再走一次
await page.click("#btn-settings");
await page.selectOption("#player-color", "b");
await page.click("#btn-new-game");
await page.waitForFunction(() => { const g = window.__phantom.game; return g.playerColor === "b" && g.chess.history().length === 1 && !g.isAiThinking; }, null, { timeout: 20000 });
const blk = await sideState();
ok(blk.camZ < 0 && blk.turn === "b" && /你/.test(blk.status), `⚫ 執黑 ⇒ AI 執白先走一手、相機到黑方、狀態寫你(${blk.status})`);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("chess3d_autosave") || "{}").playerColor);
ok(saved === "b", `⚫ 自動存檔記得執黑(playerColor ${saved})`);
await page.click("#btn-undo");
await page.waitForFunction(() => { const g = window.__phantom.game; return g.chess.history().length === 1 && !g.isAiThinking && g.chess.turn() === "b"; }, null, { timeout: 20000 });
ok(true, "⚫ 悔棋悔到開局 ⇒ AI 執白再走一次、又輪到你");

ok(errors.length === 0, "整場零 pageerror", errors.join(" | ").slice(0, 200));

await browser.close();
console.log(`\n🔬 browser-check:${pass} 過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
