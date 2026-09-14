/* 📐 相機 fit 的純數學(2026-09-14 立)—— 刻意**不碰 three.js**,Node 直接跑 test/fit.mjs。
 *
 * 由來:使用者實機截圖兩張退件:「手機版直式的棋盤被裁掉」「手機版橫式的棋盤太小」。
 *   病根同一個:board.js 把相機釘死在 (0,8,10),距離永遠不動 ——
 *     · 直向 390×844(aspect 0.46)水平視角只剩約 12°,在那個距離看得到的寬度比棋盤窄 ⇒ a/h 兩路被切;
 *     · 橫向 844×390 垂直視角是限制項,但上面有標題/狀態列、下面有工具列蓋著,棋盤縮在中間一小塊。
 *   ⇒ 相機距離要照「畫布長寬比 + 上下被 UI 蓋掉多少」算,而且注視點要對準**看得到的那條帶**的中心,
 *     不是畫布中心(否則棋盤中心對到畫布中心,上緣躲在標題底下、下緣躲在工具列底下)。
 *
 * 作法(和姊妹站 3d-chinese-chess 的 fitLandscape 同一套心法):
 *   給相機方向 dir(注視點→相機的單位向量)、fov、畫布 W×H、可用帶 [bandTop, bandBottom](px,相對畫布頂)、
 *   棋盤外接盒 8 角 ⇒ 二分搜「8 角都落在 可用帶 × 全寬 之內(留 margin)」的最小距離。
 *   注視點沿相機的 up 軸偏移,讓棋盤中心投影到**帶的中心**;距離越近棋盤越大,所以取最小合法距離就是「剛好裝滿」。
 */
(function (root) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = (a) => Math.hypot(a[0], a[1], a[2]);
    const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

    /** 棋盤外接盒(格心 ±3.5、底座 9×9 ⇒ 半寬 4.5;底座底面 -0.55;名牌頂約 1.6 + 半張牌 0.2 ⇒ 1.85) */
    const BOARD = { halfX: 4.5, halfZ: 4.5, top: 1.85, bottom: -0.55 };

    function corners(b) {
        const out = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [b.bottom, b.top]) {
            out.push([sx * b.halfX, y, sz * b.halfZ]);
        }
        return out;
    }

    /** 相機三軸:d = 注視點→相機、right、up(正上方視角時換參考軸避免 NaN) */
    function axes(dir) {
        const d = norm(dir);
        let right = cross([0, 1, 0], d);
        if (len(right) < 1e-6) right = [1, 0, 0];
        right = norm(right);
        const up = norm(cross(d, right));
        return { d, right, up };
    }

    /**
     * @param {object} o
     * @param {number} o.fovDeg     垂直視角(度)
     * @param {number} o.W          畫布寬(px)
     * @param {number} o.H          畫布高(px)
     * @param {number} [o.bandTop]  可用帶上緣(px,相對畫布頂;預設 0)
     * @param {number} [o.bandBottom] 可用帶下緣(px;預設 H)
     * @param {number[]} o.dir      注視點→相機 的方向(不必單位化)
     * @param {object} [o.board]    外接盒 {halfX,halfZ,top,bottom}
     * @param {number} [o.margin]   餘裕(1.04 = 留 4%)
     * @returns {{dist:number, target:number[], camera:number[], ndcCenterY:number, worst:number}}
     */
    function computeFit(o) {
        const fovDeg = o.fovDeg, W = o.W, H = o.H;
        const bandTop = Math.max(0, o.bandTop || 0);
        const bandBottom = Math.min(H, o.bandBottom == null ? H : o.bandBottom);
        const margin = o.margin || 1.04;
        const b = o.board || BOARD;
        const tanV = Math.tan((fovDeg * Math.PI) / 180 / 2);
        const tanH = tanV * (W / H);
        /* 帶太矮(UI 幾乎蓋滿)就退回整個畫布,別算出一個貼著鏡頭的荒謬距離 */
        const usable = bandBottom - bandTop >= H * 0.3 ? [bandTop, bandBottom] : [0, H];
        const yTop = 1 - (2 * usable[0]) / H;        // NDC:上 = +1
        const yBot = 1 - (2 * usable[1]) / H;
        const yC = (yTop + yBot) / 2;
        const yHalf = (yTop - yBot) / 2;
        const { d, right, up } = axes(o.dir);
        const cs = corners(b);

        const place = (dist) => {
            const target = [up[0] * (-yC * dist * tanV), up[1] * (-yC * dist * tanV), up[2] * (-yC * dist * tanV)];
            const cam = [target[0] + d[0] * dist, target[1] + d[1] * dist, target[2] + d[2] * dist];
            return { target, cam };
        };
        const worstAt = (dist) => {
            const { cam } = place(dist);
            let worst = 0;
            for (const c of cs) {
                const v = sub(c, cam);
                const depth = -dot(v, d);
                if (depth <= 1e-6) return Infinity;
                const x = dot(v, right) / (depth * tanH);
                const y = dot(v, up) / (depth * tanV);
                worst = Math.max(worst, Math.abs(x), Math.abs(y - yC) / yHalf);
            }
            return worst;
        };

        let lo = 1, hi = 400;
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (worstAt(mid) <= 1 / margin) hi = mid; else lo = mid;
        }
        const dist = hi;
        const { target, cam } = place(dist);
        return { dist, target, camera: cam, ndcCenterY: yC, worst: worstAt(dist) };
    }

    const api = { computeFit, corners, BOARD, axes };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.ChessFit = api;
})(typeof window !== 'undefined' ? window : globalThis);
