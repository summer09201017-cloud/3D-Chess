// 🔬 test/fit.mjs — 守「棋盤真的裝得進看得到的那條帶」(2026-09-14 立)
//
// 由來:使用者兩張實機截圖退件:「直式的棋盤被裁掉」「橫式的棋盤太小」。
//   相機以前釘死在 (0,8,10) ⇒ 直向 a/h 兩路被切、橫向縮在標題列與工具列之間一小塊。
//   這支不開瀏覽器,直接對 js/fit.js 的純數學反算:把棋盤 8 個角投影到相機平面,
//   斷言每個角都落在「可用帶 × 全寬」之內 —— 「裝不裝得下」變成算得出來的數字。
// 跑法:node test/fit.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computeFit, corners, BOARD, axes } = require('../js/fit.js');

let pass = 0, fail = 0;
const ok = (c, m, n = '') => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m + (n ? ' → ' + n : '')); } };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 8 角在螢幕上的 px 座標範圍(獨立於 fit.js 的 worst,用 fit 回傳的 camera/target 重新投影) */
function projectAll(fit, fovDeg, W, H, dir) {
    const { d, right, up } = axes(dir);
    const tanV = Math.tan((fovDeg * Math.PI) / 180 / 2), tanH = tanV * (W / H);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners(BOARD)) {
        const v = sub(c, fit.camera);
        const depth = -dot(v, d);
        const x = dot(v, right) / (depth * tanH), y = dot(v, up) / (depth * tanV);
        const px = ((x + 1) / 2) * W, py = ((1 - y) / 2) * H;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    return { minX, maxX, minY, maxY };
}

const DIR = [0, 8, 10];
const CASES = [
    { name: '直向 iPhone 390×844(標題 96 / 工具列 4 排 250)', W: 390, H: 844, top: 96, bottom: 844 - 250 },
    { name: '直向 Android 360×800', W: 360, H: 800, top: 96, bottom: 800 - 250 },
    { name: '橫向 iPhone 844×390(標題 52 / 工具列一排 88)', W: 844, H: 390, top: 52, bottom: 390 - 88 },
    { name: '橫向 844×390 選單收起(工具列只剩藥丸 34)', W: 844, H: 390, top: 52, bottom: 390 - 34 },
    { name: '桌機 1200×860', W: 1200, H: 860, top: 70, bottom: 860 - 90 },
    { name: '整個畫布(沒有 UI)844×390', W: 844, H: 390, top: 0, bottom: 390 },
];

console.log('\n── ① 每個尺寸:8 個角都在「可用帶 × 全寬」內,而且沒退太遠 ──');
const results = {};
for (const c of CASES) {
    const fit = computeFit({ fovDeg: 45, W: c.W, H: c.H, bandTop: c.top, bandBottom: c.bottom, dir: DIR });
    results[c.name] = fit;
    const p = projectAll(fit, 45, c.W, c.H, DIR);
    const inside = p.minX >= -0.5 && p.maxX <= c.W + 0.5 && p.minY >= c.top - 0.5 && p.maxY <= c.bottom + 0.5;
    ok(inside, `${c.name}:8 角全在帶內(x ${p.minX.toFixed(0)}~${p.maxX.toFixed(0)} / ${c.W},y ${p.minY.toFixed(0)}~${p.maxY.toFixed(0)} / 帶 ${c.top}~${c.bottom})`, JSON.stringify(p));
    // 剛好裝滿:寬或高至少有一邊填到 ≥ 85%(否則就是退太遠)。
    // 極端的那一個角停在 1/margin ≈ 96%,但外接盒另一側本來就有餘裕(近排底 vs 遠排頂不對稱),所以整體不會到 96。
    const fillW = (p.maxX - p.minX) / c.W, fillH = (p.maxY - p.minY) / (c.bottom - c.top);
    ok(Math.max(fillW, fillH) >= 0.85, `${c.name}:填滿其中一邊 ≥ 85%(寬 ${(fillW * 100).toFixed(0)}% / 高 ${(fillH * 100).toFixed(0)}%)`);
    ok(Number.isFinite(fit.dist) && fit.dist > 2 && fit.dist < 100, `${c.name}:距離合理(${fit.dist.toFixed(1)})`);
}

console.log('\n── ② 對準的是「帶的中心」,不是畫布中心 ──');
{
    const fit = results['直向 iPhone 390×844(標題 96 / 工具列 4 排 250)'];
    // 帶 96~594 的中心 345 < 畫布中心 422 ⇒ 注視點要往「畫面上方」偏(ndcCenterY > 0)
    ok(fit.ndcCenterY > 0.1, `直向:帶中心在畫布中心上方 ⇒ 注視點往上偏(ndc y=${fit.ndcCenterY.toFixed(3)})`);
    ok(Math.hypot(...fit.target) > 0.1, `注視點真的離開了原點(|T|=${Math.hypot(...fit.target).toFixed(2)})`);
    const sym = results['整個畫布(沒有 UI)844×390'];
    ok(Math.abs(sym.ndcCenterY) < 1e-9 && Math.hypot(...sym.target) < 1e-9, '沒有 UI 時注視原點、不偏');
}

console.log('\n── ③ 收起選單 ⇒ 帶變高 ⇒ 鏡頭靠近 ⇒ 棋盤變大 ──');
{
    const open = results['橫向 iPhone 844×390(標題 52 / 工具列一排 88)'];
    const folded = results['橫向 844×390 選單收起(工具列只剩藥丸 34)'];
    ok(folded.dist < open.dist - 0.3, `★ 收起後距離更近(${open.dist.toFixed(2)} → ${folded.dist.toFixed(2)})`);
}

console.log('\n── ④ 舊版寫死 (0,8,10) 在直向真的裝不下(反例)──');
{
    const W = 390, H = 844;
    const { d, right, up } = axes(DIR);
    const cam = [0, 8, 10];
    const tanV = Math.tan((45 * Math.PI) / 180 / 2), tanH = tanV * (W / H);
    let worstX = 0;
    for (const c of corners(BOARD)) { const v = sub(c, cam); const depth = -dot(v, d); worstX = Math.max(worstX, Math.abs(dot(v, right)) / (depth * tanH)); }
    ok(worstX > 1.0, `舊版在 390×844 左右要 ${(worstX * 100).toFixed(0)}% 的畫面寬 ⇒ 被切(使用者截圖的病)`, String(worstX));
    const fit = results['直向 iPhone 390×844(標題 96 / 工具列 4 排 250)'];
    ok(fit.dist > Math.hypot(...cam), `新版直向退到 ${fit.dist.toFixed(1)}(舊 ${Math.hypot(...cam).toFixed(1)}),才裝得下`);
}

console.log(`\n${fail === 0 ? '🟢' : '🔴'} fit:${pass} 過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
