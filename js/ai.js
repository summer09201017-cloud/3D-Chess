class ChessAI {
    constructor() {
        // 簡單的棋子價值評估(單位:兵=10)
        this.pieceValues = {
            p: 10,
            n: 30,
            b: 30,
            r: 50,
            q: 90,
            k: 900
        };

        /* ══════════ 位置分(piece-square table,v9 / 2026-09-07)══════════
           只算子力的引擎,中局九成的手都是「0 分平手」;而搜尋把吃子排最前面、同分不換人,
           結果一堆平手裡永遠是「第一個吃子的」勝出 ⇒ 提示動不動叫孩子去做等價交換,
           吃完被吃回、什麼都沒賺(使用者 2026-09-07 退件:「這樣等於交換被吃,不好吧」)。
           加上位置分之後,「出子、佔中央、王早入堡」會拿到零點幾到幾分,平手變少、
           安靜的好手贏得過沒賺頭的交換。表出自 Michniewski 的簡化評估函數(百分兵),除以 10 對齊本引擎單位。
           表以白方視角、第 0 列 = 第 8 橫排(和 chess.board() 同順序);黑方上下鏡射、取負。 */
        const T = (a) => a.map((v) => v / 10);
        this.pst = {
            p: T([
                0, 0, 0, 0, 0, 0, 0, 0,
                50, 50, 50, 50, 50, 50, 50, 50,
                10, 10, 20, 30, 30, 20, 10, 10,
                5, 5, 10, 25, 25, 10, 5, 5,
                0, 0, 0, 20, 20, 0, 0, 0,
                5, -5, -10, 0, 0, -10, -5, 5,
                5, 10, 10, -20, -20, 10, 10, 5,
                0, 0, 0, 0, 0, 0, 0, 0]),
            n: T([
                -50, -40, -30, -30, -30, -30, -40, -50,
                -40, -20, 0, 0, 0, 0, -20, -40,
                -30, 0, 10, 15, 15, 10, 0, -30,
                -30, 5, 15, 20, 20, 15, 5, -30,
                -30, 0, 15, 20, 20, 15, 0, -30,
                -30, 5, 10, 15, 15, 10, 5, -30,
                -40, -20, 0, 5, 5, 0, -20, -40,
                -50, -40, -30, -30, -30, -30, -40, -50]),
            b: T([
                -20, -10, -10, -10, -10, -10, -10, -20,
                -10, 0, 0, 0, 0, 0, 0, -10,
                -10, 0, 5, 10, 10, 5, 0, -10,
                -10, 5, 5, 10, 10, 5, 5, -10,
                -10, 0, 10, 10, 10, 10, 0, -10,
                -10, 10, 10, 10, 10, 10, 10, -10,
                -10, 5, 0, 0, 0, 0, 5, -10,
                -20, -10, -10, -10, -10, -10, -10, -20]),
            r: T([
                0, 0, 0, 0, 0, 0, 0, 0,
                5, 10, 10, 10, 10, 10, 10, 5,
                -5, 0, 0, 0, 0, 0, 0, -5,
                -5, 0, 0, 0, 0, 0, 0, -5,
                -5, 0, 0, 0, 0, 0, 0, -5,
                -5, 0, 0, 0, 0, 0, 0, -5,
                -5, 0, 0, 0, 0, 0, 0, -5,
                0, 0, 0, 5, 5, 0, 0, 0]),
            q: T([
                -20, -10, -10, -5, -5, -10, -10, -20,
                -10, 0, 0, 0, 0, 0, 0, -10,
                -10, 0, 5, 5, 5, 5, 0, -10,
                -5, 0, 5, 5, 5, 5, 0, -5,
                0, 0, 5, 5, 5, 5, 0, -5,
                -10, 5, 5, 5, 5, 5, 0, -10,
                -10, 0, 5, 0, 0, 0, 0, -10,
                -20, -10, -10, -5, -5, -10, -10, -20]),
            // 王:中局躲在角落、入堡;殘局(雙方皇后都沒了)反過來要走到中央
            k: T([
                -30, -40, -40, -50, -50, -40, -40, -30,
                -30, -40, -40, -50, -50, -40, -40, -30,
                -30, -40, -40, -50, -50, -40, -40, -30,
                -30, -40, -40, -50, -50, -40, -40, -30,
                -20, -30, -30, -40, -40, -30, -30, -20,
                -10, -20, -20, -20, -20, -20, -20, -10,
                20, 20, 0, 0, 0, 0, 20, 20,
                20, 30, 10, 0, 0, 10, 30, 20]),
            kEnd: T([
                -50, -40, -30, -20, -20, -30, -40, -50,
                -30, -20, -10, 0, 0, -10, -20, -30,
                -30, -10, 20, 30, 30, 20, -10, -30,
                -30, -10, 30, 40, 40, 30, -10, -30,
                -30, -10, 30, 40, 40, 30, -10, -30,
                -30, -10, 20, 30, 30, 20, -10, -30,
                -30, -30, 0, 0, 0, 0, -30, -30,
                -50, -30, -30, -30, -30, -30, -30, -50]),
        };
        this._endgame = false;   // evaluate() 每次掃完棋盤順手更新;葉子的增量算式讀它
    }

    /* 提示模式的「交換門檻」:吃子那條線要比最好的安靜手多賺半個兵以上,才會被建議;
       否則寧可建議安靜的好手。只給 💡 提示用(forHint),AI 對手不吃這條,照原本的最大化下。 */
    static get HINT_TRADE_MARGIN() { return 5; }

    /**
     * @param {object} chess  chess.js 0.10.3 實例
     * @param {'easy'|'medium'|'hard'} difficulty
     * @param {{forHint?: boolean}} [opts]  forHint=true:💡 提示用 —— 不主動建議沒賺頭的交換
     */
    getBestMove(chess, difficulty, opts) {
        const moves = chess.moves({ verbose: true });
        if (moves.length === 0) return null;

        // 隨機打亂，避免 AI 每次走同一條路
        this.shuffleArray(moves);

        if (difficulty === 'easy') {
            // 難度：簡單（隨機合法走步）
            return moves[Math.floor(Math.random() * moves.length)];
        }
        else if (difficulty === 'medium') {
            // 難度：中等（尋找一次有利交換或吃子）
            return this.getGreedyMove(chess, moves);
        }
        else {
            // 難度：困難（Minimax 深度 3 + 葉子吃子算到底 + 子力與位置評估）
            /* ★ 好手先搜:上面那個 shuffleArray 之後若照隨機順序搜,alpha-beta 幾乎剪不到東西
               (2026-09-07 實測:中局提示要 5.2 秒,整頁同步卡死)。先排序再搜,同深度、
               同結果,快一個數量級。洗牌留著 → 同分的手仍會變化,AI 不會每局都走同一條。 */
            this.orderMoves(moves);
            const forHint = !!(opts && opts.forHint);
            return forHint ? this.searchRootForHint(chess, moves) : this.searchRoot(chess, moves);
        }
    }

    /** AI 對手用的根層搜尋:單純最大化(黑方=最小化),吃子先搜 */
    searchRoot(chess, moves) {
        const rootIsWhite = chess.turn() === 'w';
        let bestMove = moves[0];
        let bestValue = rootIsWhite ? -Infinity : Infinity;
        // ★ 根層也要把視窗收窄:原本每個根子點都傳 ±Infinity,等於整整一層都不剪枝
        let alpha = -Infinity;
        let beta = Infinity;

        for (let i = 0; i < moves.length; i++) {
            chess.move(moves[i]);
            // 使用深度 2 (其實總深度為 3 因為第一層我們自己跑了)
            const boardValue = this.minimax(chess, 2, alpha, beta, !rootIsWhite);
            chess.undo();

            if (rootIsWhite) {
                if (boardValue > bestValue) { bestValue = boardValue; bestMove = moves[i]; }
                if (bestValue > alpha) alpha = bestValue;
            } else {
                if (boardValue < bestValue) { bestValue = boardValue; bestMove = moves[i]; }
                if (bestValue < beta) beta = bestValue;
            }
        }
        return bestMove || moves[0];
    }

    /* 💡 提示用的根層搜尋(v9):兩段式 ——
       ① 先搜所有「不吃子」的手,拿到最好的安靜手(精確值);
       ② 再搜吃子/升變,但視窗直接開在「安靜手 + 半個兵」之上:
          贏不過這個門檻的交換一律不建議(等價交換 = 吃完被吃回、什麼都沒賺,對孩子是壞示範)。
       fail-soft alpha-beta 在視窗內回傳的是精確值,所以比較是公平的。 */
    searchRootForHint(chess, moves) {
        const rootIsWhite = chess.turn() === 'w';
        const sign = rootIsWhite ? 1 : -1;                  // 換成「越大越好」的相對分
        const quiet = moves.filter((m) => !m.captured && !m.promotion);
        const noisy = moves.filter((m) => m.captured || m.promotion);

        let best = null;
        let bestRel = -Infinity;
        const search = (list, floorRel) => {
            // floorRel:相對分低於它的手不感興趣(當 alpha 用);白方 alpha=floor、黑方 beta=-floor
            let alpha = rootIsWhite ? floorRel : -Infinity;
            let beta = rootIsWhite ? Infinity : -floorRel;
            for (let i = 0; i < list.length; i++) {
                chess.move(list[i]);
                const v = this.minimax(chess, 2, alpha, beta, !rootIsWhite);
                chess.undo();
                const rel = v * sign;
                if (rel > bestRel) {
                    bestRel = rel; best = list[i];
                    if (rootIsWhite) alpha = v; else beta = v;
                }
            }
        };

        search(quiet, -Infinity);
        // 沒有安靜手可走(只剩吃子)時門檻無意義;有的話,吃子要比它多賺 HINT_TRADE_MARGIN 才算數
        const floor = best ? bestRel + ChessAI.HINT_TRADE_MARGIN : -Infinity;
        const quietBest = best, quietRel = bestRel;
        bestRel = floor;                                    // 低於門檻的吃子不會被記成 best
        best = null;
        search(noisy, floor);
        if (!best) { best = quietBest; bestRel = quietRel; }
        return best || moves[0];
    }

    /* 走法排序:吃子優先(MVV-LVA —— 吃大子、用小子吃排前面),升變次之。
       alpha-beta 的威力幾乎全靠這個:好手先搜 → beta cutoff 早發生 → 大半棋樹不用展開。
       ★ 它不改變搜尋結果的分數,只改變同分時挑到哪一手(而且挑到的會是「有吃子」那種)—— 提示模式
         因此另外走 searchRootForHint,不讓「排在前面」變成「被建議」。 */
    orderMoves(moves) {
        const V = this.pieceValues;
        for (let i = 0; i < moves.length; i++) {
            const m = moves[i];
            let score = 0;
            if (m.captured) score += 1000 + (V[m.captured] || 0) * 10 - (V[m.piece] || 0);
            if (m.promotion) score += 800;
            m._ord = score;
        }
        moves.sort((a, b) => b._ord - a._ord);
        return moves;
    }

    getGreedyMove(chess, moves) {
        let bestMove = moves[0];
        let bestScore = -Infinity;
        const isWhite = chess.turn() === 'w';

        for (let move of moves) {
            chess.move(move);
            let score = this.evaluateBoard(chess);
            chess.undo();

            // 如果是黑方，想要的分數越低越好（負數大），為了通用我們先轉換
            const relativeScore = isWhite ? score : -score;
            if (relativeScore > bestScore) {
                bestScore = relativeScore;
                bestMove = move;
            }
        }
        return bestMove;
    }

    minimax(chess, depth, alpha, beta, isMaximizingPlayer) {
        /* ★ 別在每個節點呼叫 game_over() / in_checkmate() / in_draw():
           chess.js 0.10.3 這三支各自都會「再產生一次全部合法著法」,in_draw() 還會
           重播整段棋譜查三次重複 —— 原本一個葉子要做 3~4 次全著法生成,這是
           「提示要想 5 秒」的另一個主因(2026-09-07)。
           終局改用「沒棋可走」判:被將=將死,沒被將=困斃。 */
        if (depth === 0) {
            // 葉子:in_check() 只檢查王有沒有被攻擊,不產生著法(便宜)。
            //       只有真的被將時,才花一次著法生成去確認是不是將死。
            if (chess.in_check() && chess.moves().length === 0) {
                return chess.turn() === 'w' ? -9999 : 9999;
            }
            return this.evaluate(chess);
        }

        const moves = chess.moves({ verbose: true });
        if (moves.length === 0) {
            if (chess.in_check()) return chess.turn() === 'w' ? -9999 : 9999;
            return 0;                                   // 困斃(和棋)
        }

        /* ★ 最後一層:安靜手不真的走棋。0.10.3 的 move() 會「再產生一次全部著法」來驗證、再算一次 SAN,
           undo() 也不便宜 —— 而這一層佔了九成以上的節點(中局 2300 節點裡 2100 個)。
           SAN 尾巴是 '#' 就是將死(chess.js 算 SAN 時已經 make/undo 過一次,白送的資訊);
           安靜手用「目前分 − 走前那格的分 + 走後那格的分」增量算,結果與真的走一遍再算完全相同。
           ★ 吃子/升變(v9):以前在這裡把「吃到的子」直接記成賺到,「我吃 → 他回吃 → 我再吃」看起來賺、
             第 4 步他再吃回來看不到(horizon effect),提示因此常叫人去做虧本或等價的交換。
             現在用 SEE(靜態交換評估,see())把同一格的「吃來吃去」算到底 —— 不走棋、只數攻擊者,
             O(1) 一格;曾試過真的走棋算到底(quiescence),中局一手 5~24 秒,不可用。 */
        if (depth === 1) {
            const base = this.evaluate(chess);
            let board = null;                                // 有吃子/升變才取一次盤面給 see()
            let best = isMaximizingPlayer ? -Infinity : Infinity;
            for (let i = 0; i < moves.length; i++) {
                const m = moves[i];
                let v;
                if (m.san.charCodeAt(m.san.length - 1) === 35 /* '#' */) {
                    v = m.color === 'w' ? 9999 : -9999;     // 走這手的人將死對方
                } else if (m.captured || m.promotion) {
                    if (!board) board = chess.board();
                    v = base + this.noisyDelta(board, m);
                } else {
                    v = base + this.quietDelta(m);
                }
                if (isMaximizingPlayer) { if (v > best) best = v; if (best >= beta) break; if (best > alpha) alpha = best; }
                else { if (v < best) best = v; if (best <= alpha) break; if (best < beta) beta = best; }
            }
            return best;
        }

        this.orderMoves(moves);

        if (isMaximizingPlayer) {
            let bestVal = -Infinity;
            for (let i = 0; i < moves.length; i++) {
                chess.move(moves[i]);
                bestVal = Math.max(bestVal, this.minimax(chess, depth - 1, alpha, beta, !isMaximizingPlayer));
                chess.undo();
                alpha = Math.max(alpha, bestVal);
                if (beta <= alpha) break;
            }
            return bestVal;
        } else {
            let bestVal = Infinity;
            for (let i = 0; i < moves.length; i++) {
                chess.move(moves[i]);
                bestVal = Math.min(bestVal, this.minimax(chess, depth - 1, alpha, beta, !isMaximizingPlayer));
                chess.undo();
                beta = Math.min(beta, bestVal);
                if (beta <= alpha) break;
            }
            return bestVal;
        }
    }

    /** 吃子/升變走完後的評估增量(不走棋):位置分增量 + SEE 算到底的子力淨變化 + 升變加值 */
    noisyDelta(board, m) {
        const V = this.pieceValues;
        const eg = this._endgame;
        const sign = m.color === 'w' ? 1 : -1;
        const them = m.color === 'w' ? 'b' : 'w';
        const fr = 8 - m.from.charCodeAt(1) + 48, fc = m.from.charCodeAt(0) - 97;
        const tr = 8 - m.to.charCodeAt(1) + 48, tc = m.to.charCodeAt(0) - 97;
        const after = m.promotion || m.piece;
        // 位置分:自己從 from 走到 to(升變後用新棋種的表);對方那顆被拿掉 = 它的位置分也歸零(對我方是加分)
        let pos = this.pstW(after, m.color, tr, tc, eg) - this.pstW(m.piece, m.color, fr, fc, eg);
        if (m.captured) {
            const cr = m.flags.indexOf('e') >= 0 ? fr : tr;   // 過路兵:被吃的兵在自己這一排、to 那一路
            pos += this.pstW(m.captured, them, cr, tc, eg);
        }
        let mat = this.see(board, m);
        if (m.promotion) mat += V[m.promotion] - V.p;
        return sign * (pos + mat);
    }

    /* SEE(static exchange evaluation):走 m 之後,在 m.to 這一格雙方輪流用「最便宜的攻擊者」吃回去,
       算到沒人想再吃為止,回傳這整串交換對走棋方的淨子力(含最初吃到的子;沒人回吃就等於被吃者的價值)。
       標準的 swap-list 作法(x-ray 有算:用掉一顆滑動子後,同一條線後面的滑動子會補上來)。
       不看牽制與王的絕對安全(業界慣例);王只能在對方沒攻擊者時吃進去。
       ★ 這就是「提示叫人吃、吃完被吃回」的解藥:交換是虧是賺,在葉子就算得出來。 */
    see(board, m) {
        const V = this.pieceValues;
        const tr = 8 - m.to.charCodeAt(1) + 48, tc = m.to.charCodeAt(0) - 97;
        const fr = 8 - m.from.charCodeAt(1) + 48, fc = m.from.charCodeAt(0) - 97;
        const att = { w: [], b: [] };
        const at = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8) ? board[r][c] : null;
        const isMover = (r, c) => r === fr && c === fc;      // 走棋那顆已離開原格:原格當空格看
        const push = (p, r, c, dr, dc) => att[p.color].push({ v: V[p.type], type: p.type, r, c, dr, dc });

        // 騎士、王
        const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (let i = 0; i < 8; i++) {
            const r = tr + KN[i][0], c = tc + KN[i][1], p = at(r, c);
            if (p && p.type === 'n' && !isMover(r, c)) push(p, r, c, 0, 0);
        }
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const r = tr + dr, c = tc + dc, p = at(r, c);
            if (p && p.type === 'k' && !isMover(r, c)) push(p, r, c, 0, 0);
        }
        // 兵:白兵從下一排斜著往上吃(r 較大那排),黑兵相反
        for (const dc of [-1, 1]) {
            let p = at(tr + 1, tc + dc);
            if (p && p.type === 'p' && p.color === 'w' && !isMover(tr + 1, tc + dc)) push(p, tr + 1, tc + dc, 0, 0);
            p = at(tr - 1, tc + dc);
            if (p && p.type === 'p' && p.color === 'b' && !isMover(tr - 1, tc + dc)) push(p, tr - 1, tc + dc, 0, 0);
        }
        // 滑動子:每條射線上第一顆(走棋那顆的原格跳過);後面的等 x-ray 時再補
        const slider = (r, c, dr, dc) => {
            for (r += dr, c += dc; r >= 0 && r < 8 && c >= 0 && c < 8; r += dr, c += dc) {
                if (isMover(r, c)) continue;
                const p = board[r][c];
                if (!p) continue;
                const ok = (p.type === 'q') || (dr && dc ? p.type === 'b' : p.type === 'r');
                if (ok) push(p, r, c, dr, dc);
                return;
            }
        };
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (dr || dc) slider(tr, tc, dr, dc);
        }

        // swap list
        const gain = [m.captured ? V[m.captured] : 0];
        let onSquare = V[m.promotion || m.piece];
        let side = m.color === 'w' ? 'b' : 'w';
        let d = 0;
        for (;;) {
            const list = att[side];
            if (!list.length) break;
            let k = 0;
            for (let i = 1; i < list.length; i++) if (list[i].v < list[k].v) k = i;
            const a = list[k];
            if (a.type === 'k' && att[side === 'w' ? 'b' : 'w'].length) break;   // 王不能吃進有人守的格
            d++;
            gain[d] = onSquare - gain[d - 1];
            onSquare = a.v;
            list.splice(k, 1);
            if (a.dr || a.dc) slider(a.r, a.c, a.dr, a.dc);       // x-ray:同一條線後面的補上
            side = side === 'w' ? 'b' : 'w';
        }
        for (let i = d; i > 0; i--) gain[i - 1] = -Math.max(-gain[i - 1], gain[i]);
        return gain[0];
    }

    /** 含終局判斷的完整評估(只給「中等」難度的一層貪心用,呼叫次數少,慢一點沒關係) */
    evaluateBoard(chess) {
        if (chess.in_checkmate()) {
            return chess.turn() === 'w' ? -9999 : 9999;
        }
        if (chess.in_draw()) {
            return 0;
        }
        return this.evaluate(chess);
    }

    /** 靜態評估 = 子力 + 位置分(白正黑負)。終局判斷由 minimax 自己用「沒棋可走」處理。
     *  順手更新 this._endgame(雙方皇后都不在 = 殘局,王改用「走中央」那張表)。 */
    evaluate(chess) {
        const board = chess.board();
        let material = 0;
        let queens = 0;
        const kings = [];
        for (let r = 0; r < 8; r++) {
            const row = board[r];
            for (let c = 0; c < 8; c++) {
                const p = row[c];
                if (p === null) continue;
                if (p.type === 'k') { kings.push({ color: p.color, r, c }); continue; }
                if (p.type === 'q') queens++;
                material += this.pieceScore(p.type, p.color, r, c, false);
            }
        }
        this._endgame = queens === 0;
        for (let i = 0; i < kings.length; i++) {
            material += this.pieceScore('k', kings[i].color, kings[i].r, kings[i].c, this._endgame);
        }
        return material;
    }

    /** 一顆棋子的帶號分數(子力 + 位置):白方正、黑方負;r = 0 是第 8 橫排(chess.board() 順序) */
    pieceScore(type, color, r, c, endgame) {
        const val = this.pieceValues[type] + this.pstW(type, color, r, c, endgame);
        return color === 'w' ? val : -val;
    }

    /** 位置分本身(該方視角,越大越好;黑方上下鏡射) */
    pstW(type, color, r, c, endgame) {
        const table = (type === 'k' && endgame) ? this.pst.kEnd : this.pst[type];
        return color === 'w' ? table[r * 8 + c] : table[(7 - r) * 8 + c];
    }

    /** 安靜手(不吃子、不升變)走完後,評估分的增量;不必真的走棋。含入堡時城堡跟著動的那一段。 */
    quietDelta(m) {
        const eg = this._endgame;
        const fr = 8 - m.from.charCodeAt(1) + 48, fc = m.from.charCodeAt(0) - 97;
        const tr = 8 - m.to.charCodeAt(1) + 48, tc = m.to.charCodeAt(0) - 97;
        let d = this.pieceScore(m.piece, m.color, tr, tc, eg) - this.pieceScore(m.piece, m.color, fr, fc, eg);
        if (m.flags.indexOf('k') >= 0) {            // 短入堡:h→f
            d += this.pieceScore('r', m.color, tr, 5, eg) - this.pieceScore('r', m.color, tr, 7, eg);
        } else if (m.flags.indexOf('q') >= 0) {     // 長入堡:a→d
            d += this.pieceScore('r', m.color, tr, 3, eg) - this.pieceScore('r', m.color, tr, 0, eg);
        }
        return d;
    }

    /** 純子力(不含位置分)—— 測試與「淨賺幾分」文案用 */
    materialOnly(chess) {
        let total = 0;
        const board = chess.board();
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                total += this.getPieceValue(board[i][j]);
            }
        }
        return total;
    }

    getPieceValue(piece) {
        if (piece === null) return 0;
        const val = this.pieceValues[piece.type];
        return piece.color === 'w' ? val : -val;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}

/* Node 測試用(瀏覽器端是全域 script,這一行沒作用) */
if (typeof module !== 'undefined' && module.exports) module.exports = { ChessAI };
