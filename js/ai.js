class ChessAI {
    constructor() {
        // 簡單的棋子價值評估
        this.pieceValues = {
            p: 10,
            n: 30,
            b: 30,
            r: 50,
            q: 90,
            k: 900
        };
    }

    getBestMove(chess, difficulty) {
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
            // 難度：困難（Minimax 深度 3 + 簡單兵力評估）
            /* ★ 好手先搜:上面那個 shuffleArray 之後若照隨機順序搜,alpha-beta 幾乎剪不到東西
               (2026-09-07 實測:中局提示要 5.2 秒,整頁同步卡死)。先排序再搜,同深度、
               同結果,快一個數量級。洗牌留著 → 同分的手仍會變化,AI 不會每局都走同一條。 */
            this.orderMoves(moves);

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
    }

    /* 走法排序:吃子優先(MVV-LVA —— 吃大子、用小子吃排前面),升變次之。
       alpha-beta 的威力幾乎全靠這個:好手先搜 → beta cutoff 早發生 → 大半棋樹不用展開。
       ★ 它不改變搜尋結果的分數,只改變同分時挑到哪一手(而且挑到的會是「有吃子」那種)。 */
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
            return this.evaluateMaterial(chess);
        }

        const moves = chess.moves({ verbose: true });
        if (moves.length === 0) {
            if (chess.in_check()) return chess.turn() === 'w' ? -9999 : 9999;
            return 0;                                   // 困斃(和棋)
        }

        /* ★ 最後一層不真的走棋。0.10.3 的 move() 會「再產生一次全部著法」來驗證、再算一次 SAN,
           undo() 也不便宜 —— 而這一層佔了九成以上的節點(中局 2300 節點裡 2100 個)。
           SAN 尾巴是 '#' 就是將死(chess.js 算 SAN 時已經 make/undo 過一次,白送的資訊);
           其他一律「目前子力 ± 吃掉的子(± 升變)」。結果與真的走一遍再算完全相同。 */
        if (depth === 1) {
            const base = this.evaluateMaterial(chess);
            const V = this.pieceValues;
            let best = isMaximizingPlayer ? -Infinity : Infinity;
            for (let i = 0; i < moves.length; i++) {
                const m = moves[i];
                let v;
                if (m.san.charCodeAt(m.san.length - 1) === 35 /* '#' */) {
                    v = m.color === 'w' ? 9999 : -9999;     // 走這手的人將死對方
                } else {
                    let delta = 0;
                    if (m.captured) delta += V[m.captured];
                    if (m.promotion) delta += V[m.promotion] - V.p;
                    v = base + (m.color === 'w' ? delta : -delta);
                }
                if (isMaximizingPlayer) { if (v > best) best = v; if (best >= beta) break; }
                else { if (v < best) best = v; if (best <= alpha) break; }
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

    /** 含終局判斷的完整評估(只給「中等」難度的一層貪心用,呼叫次數少,慢一點沒關係) */
    evaluateBoard(chess) {
        if (chess.in_checkmate()) {
            return chess.turn() === 'w' ? -9999 : 9999;
        }
        if (chess.in_draw()) {
            return 0;
        }
        return this.evaluateMaterial(chess);
    }

    /** 純子力評估(深搜的葉子用這支:終局判斷由 minimax 自己用「沒棋可走」處理) */
    evaluateMaterial(chess) {
        let totalEvaluation = 0;
        const board = chess.board();

        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                totalEvaluation += this.getPieceValue(board[i][j]);
            }
        }
        return totalEvaluation;
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
