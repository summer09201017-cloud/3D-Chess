/* 🎥 視角面板接線(2026-09-20,六款 3D 棋類統一:預設三段 + 滑桿微調 + 換邊 + 重置)
 *
 * js/view-kit.js 是艦隊共用的 UI(來源:hfpc-claude-skills/board3d-kit/assets/view-kit.js,**不要在這裡改它**,
 * 有問題回 skills repo 改再複製過來)。這支只做本站的接線:
 *   ① 等 ChessGame / board3d 建好且第一次 fitCamera 跑過(_lastFit)
 *   ② orbitAdapter:board.js 是 OrbitControls(up = +Y、maxPolarAngle = π/2 − 0.1),重置借 board3d.resetCamera()
 *   ③ 面板不塞進 #bottom-bar —— fitCamera 讀工具列的高度算可用帶,塞進去棋盤會縮水;
 *      改成浮在畫布左上角的 #view-panel,由工具列那顆「🎥 視角」鈕開關
 *   ④ 玩黑棋(setCameraSide('b'))開場方向會變 ⇒ 換方後重抓 0°
 *
 * 這是 ES module(index.html 用 <script type="module">),其餘腳本是傳統 defer script,所以用 rAF 輪詢等它們就緒。
 */
import { mountViewKit, orbitAdapter } from './view-kit.js';

function whenReady(cb) {
    let tries = 0;
    const tick = () => {
        const g = window.chessGame;
        const b = g && g.board3d;
        if (b && b.controls && b.camera && b._lastFit && window.THREE) { cb(b); return; }
        if (++tries < 3000) requestAnimationFrame(tick);   // 約 50 秒放棄(WebGL 起不來的機器)
    };
    tick();
}

whenReady((board3d) => {
    const btn = document.getElementById('btn-camera');
    if (!btn || document.getElementById('view-panel')) return;

    /* 面板掛在 body(不是 #ui-layer):#ui-layer pointer-events:none,而且 .glass-panel 的 backdrop-filter
       會讓 position:fixed 的子元素改成相對它定位 */
    const panel = document.createElement('div');
    panel.id = 'view-panel';
    panel.className = 'glass-panel hidden';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '視角');
    panel.innerHTML =
        '<div class="vp-head"><span>🎥 視角</span>' +
        '<button type="button" class="btn" id="btn-view-close" title="關閉視角面板">✕ 關閉</button></div>' +
        '<div id="view-kit-mount"></div>';
    document.body.appendChild(panel);

    const adapter = orbitAdapter({
        THREE: window.THREE,
        camera: board3d.camera,
        controls: board3d.controls,
        reset: () => board3d.resetCamera(),
    });
    const kit = mountViewKit(panel.querySelector('#view-kit-mount'), adapter, { title: '' });
    window.__viewKit = kit;   // 冒煙腳本用

    /* 換方(玩黑棋 / 新局)之後開場方向不同 ⇒ 讓 0° 重新對到新的開場方向 */
    const origSetSide = board3d.setCameraSide.bind(board3d);
    board3d.setCameraSide = (color) => { origSetSide(color); kit.reset(); };

    const setOpen = (open) => {
        panel.classList.toggle('hidden', !open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.classList.toggle('primary', open);
        if (open) kit.sync();
    };
    btn.addEventListener('click', () => setOpen(panel.classList.contains('hidden')));
    panel.querySelector('#btn-view-close').addEventListener('click', () => setOpen(false));
});
