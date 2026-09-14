// ★ 任何殼層檔有改就 bump CACHE_NAME(cache-first,不 bump 舊使用者永遠拿舊版)
//
// ★★ 2026-09-14 修「裝成 App 打開就 ERR_FAILED」(使用者實機截圖:https://3dchess-an.pages.dev/index.html 無法連上 / ERR_FAILED)。
//    真因三個疊在一起,一個一個記下來免得再犯(3D-Xiangqi 0908 同一族病,那站早就修過,這站漏了):
//    ① Cloudflare Pages 把 `/index.html` **308 永久轉址**到 `/`。舊快取名單裡有 `./index.html`,install 時 fetch 它會跟著轉址
//       拿到 `redirected: true` 的回應存進快取;App 的 start_url 又是 `./index.html` ⇒ 開 App 那一次**導覽**拿到快取裡這份
//       「轉址過的回應」—— 瀏覽器規定導覽請求(redirect mode = manual)不准用轉址過的回應 ⇒ 直接 ERR_FAILED,零錯誤訊息、零測試紅。
//       ⇒ 名單不放 `./index.html`;導覽一律回 SHELL(`./`);任何要回給導覽的快取回應先「洗掉」redirected 旗標。
//    ② install 用 cache.addAll(全部或全無):清單裡三個外部 CDN,任一個抓不到整批 reject,快取裡一個檔都沒有,SW 照樣註冊成功。
//       ⇒ 逐一 add + catch,抓不到的略過。
//    ③ app.js 每次載入 `caches.keys().forEach(delete)` 把**現役**快取也砍光(舊腳手架留下的)⇒ 離線永遠是空的。⇒ 已移除,舊版清理交給 activate。
//    另外:js 用 `?v=N` 破快取,而 install 存的是不帶 query 的鍵 ⇒ 比對要 ignoreSearch,不然離線一個 js 都對不上。
const CACHE_NAME = 'chess3d-v19';

// 導覽退路:離線 / 出事時回這份殼層(⚠ 只存 `./`,不存 `./index.html` —— 見上面 ①)
const SHELL = './';

const ASSETS_TO_CACHE = [
  './',
  './styles.css',
  './manifest.json',
  './js/fit.js',
  './js/app.js',
  './js/puzzles.js',
  './js/board.js',
  './js/game.js',
  './js/ai.js',
  './js/undo.js',
  './js/save.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js'
];

/** 轉址過的回應不能回給導覽請求 ⇒ 重新包一份乾淨的(同 body、同 headers、status 200) */
function sanitize(res) {
  if (!res || !res.redirected) return res;
  return new Response(res.body, { status: 200, statusText: 'OK', headers: res.headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of ASSETS_TO_CACHE) {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res && (res.ok || res.type === 'opaque')) await cache.put(url, sanitize(res));
        } catch (e) { /* 抓不到就略過(CDN 抖一下 / 手機切網);其他照樣進快取,不再全部或全無 */ }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  /* 導覽請求:網路優先(首頁永遠拿最新)、抓不到就回殼層。⚠ 回殼層前一定 sanitize。 */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const net = await fetch(req);
        // 導覽的 redirect mode 是 manual:308 會拿到 opaqueredirect(status 0),照原樣交給瀏覽器去跟轉址即可
        if (net && net.ok) { cache.put(SHELL, sanitize(net.clone())).catch(() => {}); return net; }
        if (net && net.type === 'opaqueredirect') return net;
      } catch (e) { /* 離線 ⇒ 退回殼層 */ }
      const shell = (await cache.match(SHELL, { ignoreSearch: true })) || (await cache.match('./index.html', { ignoreSearch: true }));
      return shell ? sanitize(shell) : Response.error();
    })());
    return;
  }

  /* 其他資產:快取優先(ignoreSearch 讓 `?v=N` 也對得上 install 存的鍵),沒有就抓網路、抓到順手存一份 */
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const net = await fetch(req);
    if (net && net.status === 200 && (net.type === 'basic' || net.type === 'cors')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, net.clone()).catch(() => {});
    }
    return net;
  })());
});
