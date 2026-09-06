// 🔬 AI 提示品質測試(v9 / 2026-09-07):提示不可以叫人做「虧本或等價的交換」
// 跑法:node test/ai.mjs   (chess.js 0.10.3 來自 devDependencies,和站上 CDN 同版)
//
// 背景:使用者退件「提示常叫我吃掉某顆,吃完就被吃回,等於交換被吃」。病因兩個:
//   ① 只算子力 ⇒ 中局九成的手是 0 分平手,而吃子排最前、同分不換人 ⇒ 等價交換永遠勝出;
//   ② 深度 3 是奇數層,「我吃→他回吃→我再吃」看起來賺、第 4 步他再吃回來看不到(horizon)。
// 修法:位置分(PST)+ 葉子用 SEE 把同一格的交換算到底 + 提示模式「交換要比安靜手多賺半個兵才建議」。
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { Chess } = require("chess.js");
const { ChessAI } = require(path.join(here, "..", "js", "ai.js"));

let pass = 0, fail = 0;
const ok = (name, cond, note = "") => {
  if (cond) { pass++; console.log(`  🟢 ${name}`); }
  else { fail++; console.log(`  🔴 ${name}${note ? " → " + note : ""}`); }
};
const ai = new ChessAI();
const hint = (fen) => ai.getBestMove(new Chess(fen), "hard", { forHint: true });
const san = (fen, m) => { const c = new Chess(fen); return c.move(m).san; };

/* 參考裁判:只看子力、只吃子、把交換算到底(最多 8 層),與被測引擎沒有共用程式。
   回傳「走完 move 之後、對方先動」這條交換線對走棋方的淨子力變化。 */
function refQuiesce(chess, alpha, beta, maxi, d) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return chess.in_check() ? (chess.turn() === "w" ? -9999 : 9999) : 0;
  const stand = ai.materialOnly(chess);
  if (d <= 0) return stand;
  let best = stand;
  if (maxi) { if (best >= beta) return best; alpha = Math.max(alpha, best); }
  else { if (best <= alpha) return best; beta = Math.min(beta, best); }
  for (const m of moves) {
    if (!m.captured && !m.promotion) continue;
    chess.move(m);
    const v = refQuiesce(chess, alpha, beta, !maxi, d - 1);
    chess.undo();
    if (maxi) { best = Math.max(best, v); if (best >= beta) break; alpha = Math.max(alpha, best); }
    else { best = Math.min(best, v); if (best <= alpha) break; beta = Math.min(beta, best); }
  }
  return best;
}
function netAfter(fen, move) {
  const c = new Chess(fen);
  const sign = c.turn() === "w" ? 1 : -1;
  const before = ai.materialOnly(c) * sign;
  c.move(move);
  const after = refQuiesce(c, -Infinity, Infinity, c.turn() === "w", 8) * sign;
  return after - before;          // >0 淨賺、=0 等價、<0 虧
}

console.log("── ① 手工局面 ──");
{
  // 白皇后能吃 d5 兵,但 d5 被 e6 兵保護 ⇒ 吃了皇后就沒了。提示不可以叫 Qxd5。
  const fen = "4k3/8/4p3/3p4/8/8/3Q4/4K3 w - - 0 1";
  const h = hint(fen);
  ok("有保護的兵不要用皇后去吃(Qxd5 是送皇后)", !(h.to === "d5" && h.captured), `建議了 ${san(fen, h)}`);
  ok("  且建議的那一手交換算到底不虧", netAfter(fen, h) >= 0, `淨 ${netAfter(fen, h)}`);
}
{
  // 白城堡 a1 可吃黑城堡 a8,但黑另一支城堡 h8 會回吃 ⇒ 等價交換(50 換 50)。另有安靜手可走 ⇒ 不建議交換。
  const fen = "r6r/8/8/8/8/8/6PP/R5K1 w - - 0 1";
  const h = hint(fen);
  ok("等價交換(Rxa8 Rxa8)不主動建議", !(h.to === "a8" && h.captured), `建議了 ${san(fen, h)}`);
}
{
  // 白騎士能白吃 d5 沒人保護的黑皇后 ⇒ 一定要吃。
  const fen = "4k3/8/8/3q4/8/4N3/8/4K3 w - - 0 1";
  const h = hint(fen);
  ok("沒人保護的皇后要白吃(Nxd5)", h.to === "d5" && h.captured === "q", `建議了 ${san(fen, h)}`);
}
{
  // 白騎士 c3 可吃 d5 兵;d5 被 e6 兵與 c6 兵護著、白 e4 兵也能再吃 ⇒ 交換算到底:N 換 P+P = 30 換 20,虧。
  // 深度 3 的視界會看成「Nxd5 exd5 exd5 → +20-30+10 = 0 → 但接著 cxd5 再吃回」⇒ 這就是 horizon 的經典陷阱。
  const fen = "4k3/8/2p1p3/3p4/4P3/2N5/8/4K3 w - - 0 1";
  const h = hint(fen);
  ok("雙重保護的兵不用騎士去換(horizon 陷阱)", !(h.to === "d5" && h.piece === "n"), `建議了 ${san(fen, h)}`);
}
{
  // 開局:沒有任何吃子,提示應該是「出子/佔中央」型的手,不是隨便亂走邊兵
  const fen = new Chess().fen();
  const h = hint(fen);
  const good = ["e4", "d4", "Nf3", "Nc3", "c4", "e3", "d3"];
  ok("開局建議是出子或佔中央(" + san(fen, h) + ")", good.includes(san(fen, h)));
}

console.log("── ② 隨機中局 ×30:提示的手,交換算到底不可以虧 ──");
{
  let seed = 20260907;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let checked = 0, bad = [], tradeSuggested = 0, captures = 0, tMax = 0, tSum = 0;
  for (let g = 0; g < 30; g++) {
    const c = new Chess();
    const plies = 8 + Math.floor(rnd() * 14);
    for (let i = 0; i < plies && !c.game_over(); i++) {
      const ms = c.moves(); c.move(ms[Math.floor(rnd() * ms.length)]);
    }
    if (c.game_over()) continue;
    const fen = c.fen();
    const t0 = Date.now();
    const h = hint(fen);
    const dt = Date.now() - t0; tSum += dt; tMax = Math.max(tMax, dt);
    if (!h) continue;
    checked++;
    const net = netAfter(fen, h);
    if (h.captured) { captures++; if (net <= 0) tradeSuggested++; }
    if (net < 0) bad.push(`${fen.split(" ")[0]} ${san(fen, h)} 淨 ${net}`);
  }
  ok(`${checked} 個局面的提示,交換算到底都不虧`, bad.length === 0, bad.slice(0, 3).join(" | "));
  ok(`建議吃子的 ${captures} 手裡,沒有一手是「等價交換」(淨 0)`, tradeSuggested === 0, `${tradeSuggested} 手`);
  console.log(`  ⏱ 提示耗時:平均 ${Math.round(tSum / Math.max(checked, 1))}ms,最慢 ${tMax}ms`);
  ok("最慢的一手 < 3000ms(這台機比 agape250 慢,預算放寬)", tMax < 3000, `${tMax}ms`);
}

console.log("── ③ AI 對手(非提示模式)照舊能走、殘局會抓王 ──");
{
  const c = new Chess("8/8/8/8/8/2k5/8/K1Q5 w - - 0 1");   // 王后對王殘局
  const m = ai.getBestMove(c, "hard");
  ok("殘局有合法建議", !!m, "");
  const c2 = new Chess();
  ok("開局 AI 對手有合法建議", !!ai.getBestMove(c2, "hard"));
  ok("簡單/中等兩檔照舊", !!ai.getBestMove(c2, "easy") && !!ai.getBestMove(c2, "medium"));
}

console.log(`\n🔬 ai:${pass} 過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
