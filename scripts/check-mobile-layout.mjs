// 🔬 手機版面真瀏覽器驗收(2026-09-14):使用者兩張截圖退件「直式棋盤被裁掉」「橫式棋盤太小」
//    + 新加的「▼ 收起選單」與「🎥 重置視角」。playwright-core + 系統 Edge/Chrome。
// 跑法:python -m http.server 8798(另一個視窗)→ node scripts/check-mobile-layout.mjs
//      (或 CHECK_URL=線上網址 node scripts/check-mobile-layout.mjs)
//
// 守的事(每一條對應一個退件或一個新功能):
//   ① 直向 390×844:棋盤 8 個角投影後全在畫布**寬**內(a/h 路不再被切)、全在「標題列底 ~ 工具列頂」那條帶內(不躲在 UI 底下)、寬填滿 ≥ 85%。
//   ② 橫向 844×390:同上,且棋盤高填滿帶的 ≥ 80%(以前縮在中間一小塊)。
//   ③ 收起選單:按「▼ 收起選單」⇒ 工具列藏掉、鏡頭更近、棋盤在畫面上變高;再按展開;reload 後記得住。
//   ④ 重置視角:真滑鼠拖曳把鏡頭轉走 ⇒ 按「🎥 重置視角」⇒ 相機回到開場位置(連注視點),且不會被阻尼殘量再飄走。
//   ⑤ 全程零 pageerror。
// ★ 一律真點擊 / 真拖曳(page.click / page.mouse),不在 evaluate 裡呼叫函式。
import { chromium } from "playwright-core";

const URL = process.env.CHECK_URL || "http://localhost:8798";
const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

let browser = null;
for (const channel of ["msedge", "chrome"]) {
    try { browser = await chromium.launch({ channel, headless: true }); break; }
    catch { /* 換下一個 channel */ }
}
if (!browser) { console.error("找不到系統 Edge/Chrome"); process.exit(1); }

let pass = 0, fail = 0;
const ok = (cond, msg, note = "") => {
    if (cond) { pass++; console.log("  ✓ " + msg); }
    else { fail++; console.error("  ✗ " + msg + (note ? " → " + note : "")); }
};

const open = async (viewport) => {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("dialog", (d) => d.accept());
    await page.goto(URL + "/?v=" + Date.now(), { waitUntil: "domcontentloaded" });
    /* fitCamera 跑過才算就緒(_lastFit 有值);相機是 game 建構時就有的,不用等 SW */
    await page.waitForFunction(() => window.__phantom && window.__phantom.game && window.__phantom.game.board3d
        && window.__phantom.game.board3d._lastFit, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    return { page, errors };
};

/** 棋盤 8 角的螢幕投影 + UI 帶 + 相機狀態(全部量真的 DOM / 真的相機) */
const geo = (page) => page.evaluate(() => {
    const b = window.__phantom.game.board3d;
    const cv = b.renderer.domElement.getBoundingClientRect();
    const header = document.querySelector("#ui-layer header").getBoundingClientRect();
    const bar = document.getElementById("bottom-bar").getBoundingClientRect();
    const pts = window.ChessFit.corners(window.ChessFit.BOARD).map(([x, y, z]) => {
        const v = new THREE.Vector3(x, y, z).project(b.camera);
        return { x: cv.left + ((v.x + 1) / 2) * cv.width, y: cv.top + ((1 - v.y) / 2) * cv.height };
    });
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return {
        cv: { left: cv.left, right: cv.right, top: cv.top, bottom: cv.bottom, w: cv.width, h: cv.height },
        headerBottom: header.bottom, barTop: bar.top, barH: bar.height,
        minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
        cam: b.camera.position.toArray().map((v) => +v.toFixed(3)),
        target: b.controls.target.toArray().map((v) => +v.toFixed(3)),
        dist: b._lastFit ? +b._lastFit.dist.toFixed(3) : null,
        folded: document.body.classList.contains("menu-folded"),
        controlsVisible: !!(document.getElementById("controls-panel").offsetParent),
    };
});
const insideBand = (g) => g.minX >= g.cv.left - 1 && g.maxX <= g.cv.right + 1 && g.minY >= g.headerBottom - 1 && g.maxY <= g.barTop + 1;

console.log("\n── ① 直向 390×844:棋盤不被裁、不躲在 UI 底下(使用者截圖:a/h 兩路被切)──");
{
    const { page, errors } = await open(PORTRAIT);
    const g = await geo(page);
    ok(g.minX >= g.cv.left - 1 && g.maxX <= g.cv.right + 1, `★★ 左右沒被切(x ${g.minX.toFixed(0)}~${g.maxX.toFixed(0)},畫布寬 ${g.cv.w})`, JSON.stringify(g));
    ok(g.minY >= g.headerBottom - 1, `★ 上緣沒躲在標題列底下(棋盤頂 ${g.minY.toFixed(0)} ≥ 標題底 ${g.headerBottom.toFixed(0)})`);
    ok(g.maxY <= g.barTop + 1, `★ 下緣沒躲在工具列底下(棋盤底 ${g.maxY.toFixed(0)} ≤ 工具列頂 ${g.barTop.toFixed(0)})`);
    ok((g.maxX - g.minX) / g.cv.w >= 0.85, `★ 寬填滿 ≥ 85%(${(((g.maxX - g.minX) / g.cv.w) * 100).toFixed(0)}%)`);
    ok(g.dist > 20, `直向鏡頭退到 ${g.dist}(舊版寫死 12.8 才會被切;maxDistance 已放寬)`, String(g.dist));
    ok(errors.length === 0, "直向零 pageerror", errors.join(" | "));
    await page.close();
}

console.log("\n── ② 橫向 844×390:棋盤填滿標題列與工具列之間(使用者截圖:縮在中間一小塊)──");
let landscapeOpenDist = null;
{
    const { page, errors } = await open(LANDSCAPE);
    const g = await geo(page);
    landscapeOpenDist = g.dist;
    ok(insideBand(g), "★ 8 角全在畫布寬 × 可用帶內", JSON.stringify(g));
    const bandH = g.barTop - g.headerBottom;
    const fillH = (g.maxY - g.minY) / bandH;
    ok(fillH >= 0.8, `★★ 棋盤高填滿可用帶 ≥ 80%(${(fillH * 100).toFixed(0)}%;帶 ${bandH.toFixed(0)}px)`, JSON.stringify({ minY: g.minY, maxY: g.maxY, bandH }));
    ok(Math.abs(g.target[1]) > 0.05 || Math.abs(g.target[2]) > 0.05, `★ 注視點對準帶的中心而不是畫布中心(target ${JSON.stringify(g.target)})`);

    console.log("\n── ③ 收起選單:工具列藏掉、鏡頭靠近、棋盤變高;再按展開;reload 記得住 ──");
    await page.click("#btn-fold");
    await page.waitForFunction((d0) => document.body.classList.contains("menu-folded")
        && window.__phantom.game.board3d._lastFit.dist < d0 - 0.2, g.dist, { timeout: 5000 })
        .then(() => ok(true, "★★ 按下去:body.menu-folded + 鏡頭距離變近(棋盤放大)"))
        .catch(() => ok(false, "★★ 按下去:body.menu-folded + 鏡頭距離變近", "5 秒內沒發生"));
    await page.waitForTimeout(300);
    const f = await geo(page);
    ok(!f.controlsVisible, "★ 工具列真的藏掉了(offsetParent null)");
    ok(f.barH < g.barH - 20, `★ 底部列變矮(${g.barH.toFixed(0)} → ${f.barH.toFixed(0)}px)`);
    ok(insideBand(f), "★ 收起後棋盤仍全在帶內(沒被藥丸鈕蓋到)", JSON.stringify(f));
    ok((f.maxY - f.minY) > (g.maxY - g.minY) + 10, `★ 棋盤在畫面上真的變高(${(g.maxY - g.minY).toFixed(0)} → ${(f.maxY - f.minY).toFixed(0)}px)`);
    ok((await page.locator("#btn-fold").textContent()).includes("展開"), "藥丸鈕文字改成「展開」");
    // reload 記得住
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__phantom && window.__phantom.game && window.__phantom.game.board3d && window.__phantom.game.board3d._lastFit, null, { timeout: 30000 });
    ok(await page.evaluate(() => document.body.classList.contains("menu-folded")), "★ reload 後仍是收起(localStorage)");
    await page.click("#btn-fold");
    await page.waitForFunction(() => !document.body.classList.contains("menu-folded"), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const r = await geo(page);
    ok(!r.folded && r.controlsVisible, "★ 再按一次展開,工具列回來");
    ok(Math.abs(r.dist - landscapeOpenDist) < 0.2, `展開後距離回到原值(${landscapeOpenDist} vs ${r.dist})`);
    ok(errors.length === 0, "橫向 + 收起/展開 零 pageerror", errors.join(" | "));
    await page.close();
}

console.log("\n── ④ 重置視角:真拖曳轉走 ⇒ 按「🎥 重置視角」⇒ 回到開場位置(連注視點),阻尼殘量不會再飄 ──");
{
    const { page, errors } = await open(LANDSCAPE);
    const home = await geo(page);
    // 真滑鼠在畫布上拖一段(避開上下 UI:從畫布中央往右上拖)
    const cx = home.cv.left + home.cv.w / 2, cy = home.cv.top + home.cv.h / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 18, cy - i * 6);
    await page.mouse.up();
    await page.waitForTimeout(700);   // 讓阻尼把殘量吃完,量到的才是「使用者放手後」的位置
    const moved = await geo(page);
    const dCam = Math.hypot(...moved.cam.map((v, i) => v - home.cam[i]));
    ok(dCam > 0.5, `★ 拖曳後相機真的轉走了(位移 ${dCam.toFixed(2)})`, JSON.stringify({ home: home.cam, moved: moved.cam }));
    ok(await page.locator("#btn-camera").count() === 1, "★ 工具列有「🎥 重置視角」鈕");
    await page.click("#btn-camera");
    await page.waitForTimeout(700);   // 若阻尼殘量沒清乾淨,這 700ms 內會再飄走 —— 故意等過去再量
    const back = await geo(page);
    const dBack = Math.hypot(...back.cam.map((v, i) => v - home.cam[i]));
    const dTgt = Math.hypot(...back.target.map((v, i) => v - home.target[i]));
    ok(dBack < 0.05, `★★ 重置後相機回到開場位置(差 ${dBack.toFixed(3)})`, JSON.stringify({ home: home.cam, back: back.cam }));
    ok(dTgt < 0.05, `★ 注視點也回到開場(差 ${dTgt.toFixed(3)})`, JSON.stringify({ home: home.target, back: back.target }));
    ok(errors.length === 0, "重置視角零 pageerror", errors.join(" | "));
    await page.close();
}

await browser.close();
console.log("\n" + (fail === 0 ? "🟢" : "🔴") + ` mobile-layout:${pass} 過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
