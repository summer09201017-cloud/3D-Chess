// 🔬 「裝成 App 打開就 ERR_FAILED」的真瀏覽器重演(2026-09-14 使用者實機截圖)。
// 跑法:CHECK_URL=https://3dchess-an.pages.dev node scripts/check-sw-nav.mjs(本機伺服器不會 308,重演不到,主要對線上跑)
//
// 重演步驟 = 使用者手機發生的事:①開 /index.html 一次(讓 SW 裝好、快取填滿)②再開一次 /index.html
//   ⇒ 舊版這一步就是 ERR_FAILED(快取裡的轉址回應被拿去回導覽);新版要正常載入。
//   ③斷網再開 /index.html ⇒ 殼層退路要接得住(不再空白 / ERR_FAILED)。
import { chromium } from "playwright-core";

const URL = (process.env.CHECK_URL || "http://localhost:8798").replace(/\/$/, "");
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

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

console.log("\n── ① 第一次開 /index.html:裝 SW、填快取 ──");
{
  const r = await page.goto(URL + "/index.html", { waitUntil: "domcontentloaded" }).catch((e) => ({ error: String(e) }));
  ok(!r.error, "第一次開得起來", r.error || "");
  await page.waitForFunction(() => window.__phantom && window.__phantom.game, null, { timeout: 30000 }).catch(() => {});
  const swState = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "no-sw";
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg) return "no-reg";
    for (let i = 0; i < 100 && !(reg.active && reg.active.state === "activated"); i++) await new Promise((r) => setTimeout(r, 100));
    return reg.active ? reg.active.state : "none";
  });
  ok(swState === "activated", "SW 已 activated", swState);
  // 給 install 一點時間把名單逐一抓完(逐一 add 比 addAll 慢)
  await page.waitForFunction(async () => { const ks = await caches.keys(); const k = ks.find((x) => x.startsWith("chess3d")); if (!k) return false; const c = await caches.open(k); return (await c.keys()).length >= 8; }, null, { timeout: 20000 }).catch(() => {});
  const keys = await page.evaluate(async () => { const ks = await caches.keys(); const k = ks.find((x) => x.startsWith("chess3d")) || ks[0]; const c = k ? await caches.open(k) : null; return { names: ks, n: c ? (await c.keys()).length : 0 }; });
  ok(keys.names.some((k) => /chess3d-v\d+/.test(k)) && keys.n >= 8, `快取有貨(${keys.names.join(",")};${keys.n} 筆)`, JSON.stringify(keys));
  ok(keys.names.filter((k) => k.startsWith("chess3d")).length === 1, "舊版快取已清掉(只剩現役那一個)", keys.names.join(","));
}

console.log("\n── ② 第二次開 /index.html(使用者截圖那一步)──");
{
  const r = await page.goto(URL + "/index.html", { waitUntil: "domcontentloaded" }).catch((e) => ({ error: String(e) }));
  ok(!r.error, "★★ 第二次開 /index.html 不再 ERR_FAILED(舊版:快取裡轉址過的回應回給導覽 ⇒ 瀏覽器拒絕)", r.error || "");
  ok(await page.evaluate(() => !!document.getElementById("btn-fold")), "頁面是真的載進來(有收起選單鈕)");
  ok(page.url().startsWith(URL), "落在正式網址底下", page.url());
  /* 真的按一顆:載進來只是第一關,人要玩得到才算(evaluate-not-click-guard #29 的理由)。
     按「▼ 收起選單」再按回來,順手驗 SW 回的這一頁 JS 真的接上了。 */
  await page.locator("#btn-fold").click();
  await page.waitForFunction(() => document.body.classList.contains("menu-folded"), null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => document.body.classList.contains("menu-folded")), "★ 真點「▼ 收起選單」有反應(SW 回的頁面 JS 是活的)");
  await page.locator("#btn-fold").click();
  await page.waitForFunction(() => !document.body.classList.contains("menu-folded"), null, { timeout: 5000 }).catch(() => {});
}

console.log("\n── ③ 斷網再開 /index.html:殼層退路 ──");
{
  await ctx.setOffline(true);
  const r = await page.goto(URL + "/index.html", { waitUntil: "domcontentloaded" }).catch((e) => ({ error: String(e) }));
  ok(!r.error, "★ 離線開 /index.html 由 SW 回殼層,不是 ERR_FAILED", r.error || "");
  ok(await page.evaluate(() => !!document.getElementById("controls-panel")).catch(() => false), "離線殼層有內容(工具列在)");
  await ctx.setOffline(false);
}
ok(errors.length === 0, "整段零 pageerror", errors.join(" | "));

await browser.close();
console.log("\n" + (fail === 0 ? "🟢" : "🔴") + ` sw-nav:${pass} 過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
