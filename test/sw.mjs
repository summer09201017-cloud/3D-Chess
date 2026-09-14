// 🔬 sw.js 的離線韌性(2026-09-14 立,使用者實機截圖「裝成 App 打開 ERR_FAILED」之後)
//
// 真因(見 sw.js 檔頭):Pages 把 /index.html 308 到 /,舊快取名單存了轉址過的 index.html,導覽拿到它就 ERR_FAILED;
//   install 又是 addAll 全部或全無;app.js 每次載入砍光快取。這支守四件,每一件都是那次事故的一環:
//   ① 名單裡沒有 ./index.html、有 ./(殼層)   ② install 逐一 add:一個 CDN 抓不到,其餘照樣進快取
//   ③ 導覽有專用分支、退回殼層、回給導覽前 sanitize 轉址旗標、資產比對 ignoreSearch
//   ④ manifest start_url 是 ./(不是會被 308 的 index.html)、id 保留舊值(已裝的 App 才認得是同一支)
//   ⑤ app.js 不再砍快取
// ★ 用假的 caches 而不是真瀏覽器:Playwright 攔不到 SW 自己發的請求(3D-Xiangqi 0908 實測);要驗「某資產抓不到」就直接餵一個抓不到的。
// 跑法:node test/sw.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const app = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (cond, msg, note = '') => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg + (note ? ' → ' + note : '')); }
};

/** 假 SW 環境。failUrls 一 fetch 就 reject(模擬 CDN 抓不到);redirectUrls 回 redirected:true 的回應(模擬 308 跟過去)。 */
function runSw({ failUrls = [], redirectUrls = [] } = {}) {
  const store = new Map();
  const listeners = {};
  class FakeResponse {
    constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.ok = this.status >= 200 && this.status < 300; this.headers = init.headers || {}; this.type = init.type || 'basic'; this.redirected = !!init.redirected; }
    clone() { return new FakeResponse(this.body, { status: this.status, headers: this.headers, type: this.type, redirected: this.redirected }); }
    static error() { return new FakeResponse(null, { status: 0, type: 'error' }); }
  }
  const cache = {
    put: async (req, res) => { store.set(typeof req === 'string' ? req : req.url, res); },
    match: async (req) => { const url = typeof req === 'string' ? req : req.url; return store.get(url); },
    keys: async () => [...store.keys()],
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['chess3d-old', 'chess3d-v18'],
    delete: async () => true,
    match: async (req, opts) => cache.match(req, opts),
  };
  const fetchFn = async (url) => {
    const u = typeof url === 'string' ? url : url.url;
    if (failUrls.some((f) => u.includes(f))) throw new TypeError('Failed to fetch');
    return new FakeResponse('body:' + u, { redirected: redirectUrls.some((r) => u.includes(r)), type: /^https?:/.test(u) ? 'cors' : 'basic' });
  };
  const self = { addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); }, skipWaiting: () => {}, clients: { claim: async () => {} } };
  const fn = new Function('self', 'caches', 'fetch', 'Response', src);
  fn(self, caches, fetchFn, FakeResponse);
  return { listeners, store, cache, FakeResponse };
}
async function install(env) {
  const waits = [];
  for (const fn of env.listeners.install || []) await fn({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits.map((p) => Promise.resolve(p).catch(() => null)));
}

console.log('── ① 名單:沒有 ./index.html、有 ./ 殼層 ──');
{
  const list = (src.match(/ASSETS_TO_CACHE\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
  ok(!/['"]\.\/index\.html['"]/.test(list), '★★ 快取名單沒有 ./index.html(Pages 會 308 它,存進去的是轉址過的回應 ⇒ 導覽拿到就 ERR_FAILED)');
  ok(/['"]\.\/['"]/.test(list), '名單有 ./(殼層)');
  ok(/['"]\.\/js\/fit\.js['"]/.test(list), '名單有 js/fit.js(v16 新檔,漏了離線就沒相機 fit)');
}

console.log('── ② install 逐一 add:一個 CDN 抓不到,其餘照樣進快取 ──');
{
  const env = runSw({ failUrls: ['cdnjs.cloudflare.com'] });
  await install(env);
  const keys = await env.cache.keys();
  ok(keys.length >= 10, `★★ CDN 抓不到時其餘資產仍進了快取(${keys.length} 筆)—— 舊版 addAll 這裡是 0 筆`, keys.join(' '));
  ok(keys.includes('./'), '殼層 ./ 在快取裡');
  ok(!keys.some((k) => k.includes('cdnjs')), '抓不到的那兩個 cdnjs 資產不在(略過,不是整批失敗)');
}

console.log('── ③ 轉址過的回應要洗乾淨 + 導覽分支 + ignoreSearch ──');
{
  const env = runSw({ redirectUrls: ['./'] });   // 模擬 fetch('./') 也被跟轉址(極端)
  await install(env);
  const shell = await env.cache.match('./');
  ok(shell && shell.redirected === false, '★★ install 存進快取的殼層已洗掉 redirected 旗標(導覽才敢用)', shell ? 'redirected=' + shell.redirected : '沒存');
  ok(/req\.mode === ['"]navigate['"]/.test(src), '★ fetch 有導覽請求(navigate)的專用分支');
  ok(/ignoreSearch:\s*true/.test(src), '★ 資產比對 ignoreSearch(js 用 ?v=N 破快取,install 存的鍵不帶 query)');
  ok(/function sanitize/.test(src) && /res\.redirected/.test(src), '有 sanitize():回給導覽前重新包一份不帶 redirected 的回應');
  ok(/opaqueredirect/.test(src), '導覽拿到 308(opaqueredirect)時照原樣交給瀏覽器跟轉址,不自己亂處理');
  ok(/skipWaiting\(\)/.test(src) && /clients\.claim\(\)/.test(src), '新版 SW 會接手(skipWaiting + clients.claim)');
}

console.log('── ④ manifest:start_url 不會被 308、id 保留舊值 ──');
{
  ok(manifest.start_url === './', `★★ start_url 是 ./(現在 ${manifest.start_url});./index.html 會被 Pages 308,App 一開就撞`);
  ok(manifest.id === './index.html', `id 明寫成舊的 start_url(${manifest.id})—— 已裝的 App 才會認得是同一支、吃到新設定`);
}

console.log('── ⑤ app.js 不再每次載入砍光快取 ──');
ok(!/caches\.keys\(\)\.then\(names\s*=>\s*\{?\s*names\.forEach\(name\s*=>\s*caches\.delete/.test(app),
  '★ app.js 沒有「載入就 caches.delete 全部」那段(它連現役快取一起砍,離線永遠是空的)');

console.log((fail ? '🔴' : '🟢') + ` sw:${pass} 過 / ${fail} 失敗`);
if (fail) process.exit(1);
