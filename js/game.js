class ChessGame {
    constructor() {
        // 使用 window.Chess 或 Chess() 取決於引用庫的導出方式
        this.chess = typeof Chess === 'function' ? new Chess() : new window.Chess();
        this.board3d = new ChessBoard3D('canvas-container');

        this.playerColor = 'w';
        this.aiDifficulty = 'medium';
        this.isAiThinking = false;

        this.selectedSquare = null;

        // UI 元素
        this.uiStatus = document.getElementById('game-status');
        this.uiAiThinking = document.getElementById('ai-thinking');
        this.uiMoveHistory = document.getElementById('move-history');
        this.uiBtnUndo = document.getElementById('btn-undo');

        // 綁定回調
        this.board3d.onSquareClick = this.handleSquareClick.bind(this);

        // 依賴注入 (先設為 null，稍後設定)
        this.ai = null;
        this.undoManager = null;
        this.saveManager = null;

        this.updateView();
    }

    startNew(playerColor, difficulty) {
        this.chess.reset();
        this.dailyKey = null;        // 📅 一般開局=離開每日殘局模式
        this.dailyPuzzle = null;
        this.dailyScored = false;
        this.playerColor = playerColor;
        this.aiDifficulty = difficulty;
        this.isAiThinking = false;
        this.selectedSquare = null;

        this.board3d.setCameraSide(this.playerColor);

        if (this.undoManager) this.undoManager.clear();

        this.updateView();

        // 如果是黑方，且輪到白方(AI)下子
        if (this.playerColor === 'b' && this.chess.turn() === 'w') {
            this.makeAiMove();
        }

        if (this.saveManager) this.saveManager.saveAuto();
    }

    /* ══════════ 📅 每日殘局(N 步殺;垂直搬運自 3d-chess-co)══════════
       每天一題、全世界同一題;題庫與「mateIn 是窮舉證明」的紀律都在 js/puzzles.js,
       這個引擎(chess.js 0.10.3)上的證明由 test/daily.mjs 重跑一次(不信任另一站的證明)。
       ★ 玩家固定執白(題目都是白先必殺);黑方=站上原本的 AI 高手檔。 */
    /** 開始今天那一組的第 n 題(n 從 0 起;不給就從「今天還沒解的第一題」開始) */
    startDaily(n) {
        const D = window.ChessDaily;
        if (!D) return;                       // puzzles.js 載不到:安靜退回,不弄壞遊戲
        const key = D.dailyPuzzleKey();
        const set = D.puzzlesForDate(key);
        const book = this.loadDailyBook();
        const solved = (book[key] && book[key].solved) || {};
        const index = Number.isInteger(n)
            ? Math.max(0, Math.min(n, set.puzzles.length - 1))
            : Math.max(0, set.puzzles.findIndex((p) => !solved[p.id]));   // -1(全解完)→ 0,可重玩
        const puzzle = set.puzzles[index];

        this.chess.reset();
        if (!this.chess.load(puzzle.fen)) {    // 0.10.3 的 load 回 boolean
            console.error('每日殘局 FEN 載入失敗', puzzle.id);
            return;
        }
        this.dailyKey = key;
        this.dailySet = set;
        this.dailyIndex = index;
        this.dailyPuzzle = puzzle;
        this.dailyScored = false;
        this.playerColor = 'w';               // 題目都是白先
        this.aiDifficulty = 'hard';
        this.isAiThinking = false;
        this.selectedSquare = null;

        this.board3d.setCameraSide('w');
        if (this.undoManager) this.undoManager.clear();
        this.updateView();
    }

    /** 今天這一組解掉幾題了(給 UI 顯示進度用) */
    dailyProgress() {
        const D = window.ChessDaily;
        if (!D || !this.dailyKey) return null;
        const set = this.dailySet || D.puzzlesForDate(this.dailyKey);
        const book = this.loadDailyBook();
        const solved = (book[this.dailyKey] && book[this.dailyKey].solved) || {};
        const done = set.puzzles.filter((p) => solved[p.id]).length;
        return { done, total: set.puzzles.length, solved, set };
    }

    /** 還有沒有下一題沒解(結算畫面要不要出「下一題」) */
    nextUnsolvedIndex() {
        const p = this.dailyProgress();
        if (!p) return -1;
        for (let i = 0; i < p.set.puzzles.length; i += 1) {
            if (!p.solved[p.set.puzzles[i].id] && i !== this.dailyIndex) return i;
        }
        return -1;
    }

    /** 白方走了幾步(從棋譜推,悔棋自動算對) */
    whiteMoveCount() {
        return Math.ceil(this.chess.history().length / 2);
    }

    /* ══ 📅 戰績:{ "YYYY-MM-DD": { solved: { 題目id: 那題最少步數 } } } ══
       一天一組多題 ⇒ **每題分開記**(才知道今天解了幾題、哪題還沒解)。
       零上傳、包 try/catch(私密模式照玩)、留 60 天。
       ⚠ 舊格式(v1 單題版是 `key: 步數`)讀進來會被當成沒有 solved ⇒ 視為未解、可重解;
         不炸、不誤報,這是刻意的寬鬆遷移(這站的每日模式沒上線過,實務上不會遇到)。 */
    loadDailyBook() {
        try {
            const s = JSON.parse(localStorage.getItem('chess3d:daily:v1') || '{}');
            return s && typeof s === 'object' ? s : {};
        } catch (e) { return {}; }
    }
    saveDailyResult(key, puzzleId, moves) {
        const all = this.loadDailyBook();
        const day = (all[key] && typeof all[key] === 'object' && all[key].solved) ? all[key] : { solved: {} };
        const prev = day.solved[puzzleId] | 0;
        const isNewBest = !prev || moves < prev;
        if (isNewBest) day.solved[puzzleId] = moves;
        all[key] = day;
        const days = Object.keys(all).sort();
        while (days.length > 60) delete all[days.shift()];
        try { localStorage.setItem('chess3d:daily:v1', JSON.stringify(all)); } catch (e) { /* 私密模式照玩 */ }
        return { best: day.solved[puzzleId], isNewBest, solvedCount: Object.keys(day.solved).length };
    }

    handleSquareClick(square) {
        if (this.isGameOver() || this.isAiThinking) return;
        if (this.chess.turn() !== this.playerColor) return; // 不是玩家回合

        const piece = this.chess.get(square);

        // 第一擊：選擇自己的棋子
        if (this.selectedSquare === null) {
            if (piece && piece.color === this.playerColor) {
                this.selectSquare(square);
            }
        }
        // 第二擊：選擇同一棋子 -> 取消選擇
        else if (this.selectedSquare === square) {
            this.clearSelection();
        }
        // 第二擊：選擇其他自己的棋子 -> 重新選擇
        else if (piece && piece.color === this.playerColor) {
            this.selectSquare(square);
        }
        // 第二擊：嘗試移動
        else {
            this.attemptMove(this.selectedSquare, square);
        }
    }

    selectSquare(square) {
        this.clearSelection();
        this.selectedSquare = square;
        this.board3d.highlightSquare(square, 0x00ff00); // 綠色高亮選中

        // 找出所有合法走步
        const moves = this.chess.moves({ square: square, verbose: true });
        moves.forEach(move => {
            // 合法目標顯示藍色
            const color = move.flags.includes('c') ? 0xff0000 : 0x0088ff; // 如果是吃子則顯示紅色
            this.board3d.highlightSquare(move.to, color);
        });
    }

    clearSelection() {
        this.selectedSquare = null;
        this.board3d.clearHighlights();
    }

    attemptMove(from, to) {
        // 為了簡單起見，如果是士兵走到最後一排，預設升變為皇后
        const move = this.chess.move({
            from: from,
            to: to,
            promotion: 'q' // 簡化處理
        });

        if (move) {
            this.clearSelection();
            this.processMoveMade();

            // 輪到 AI
            if (!this.isGameOver() && this.chess.turn() !== this.playerColor) {
                this.makeAiMove();
            }
        } else {
            // 非法走步，取消選擇
            this.clearSelection();
        }
    }

    processMoveMade() {
        this.board3d.updateBoard(this.chess);
        this.updateStatus();
        this.updateHistoryUI();

        if (this.undoManager) this.undoManager.updateUI();
        if (this.saveManager) this.saveManager.saveAuto();
    }

    makeAiMove() {
        if (!this.ai) return; // AI 未初始化

        this.isAiThinking = true;
        this.uiAiThinking.classList.remove('hidden');

        // 使用 setTimeout 讓 UI 更新，並模擬思考時間
        setTimeout(() => {
            const bestMove = this.ai.getBestMove(this.chess, this.aiDifficulty);
            if (bestMove) {
                this.chess.move(bestMove);
                this.processMoveMade();
            }
            this.isAiThinking = false;
            this.uiAiThinking.classList.add('hidden');
            // AI 完成後重新啟用悔棋按鈕
            if (this.undoManager) this.undoManager.updateUI();
        }, 500); // 至少延遲 0.5 秒
    }

    isGameOver() {
        return this.chess.game_over();
    }

    updateStatus() {
        let statusText = '';
        let moveColor = this.chess.turn() === 'w' ? '白方' : '黑方';

        // 📅 每日殘局的常駐狀態行(今天第幾題/進度/題名/目標/已走)
        const dailyLine = document.getElementById('daily-line');
        if (dailyLine) {
            dailyLine.classList.toggle('hidden', !this.dailyKey);
            if (this.dailyKey && this.dailyPuzzle) {
                const prog = this.dailyProgress();
                dailyLine.textContent = `📅 ${this.dailyKey} 第 ${this.dailyIndex + 1}/${prog ? prog.total : 1} 題`
                    + `(今天已解 ${prog ? prog.done : 0} 題)「${this.dailyPuzzle.name}」`
                    + `・目標 ${this.dailyPuzzle.mateIn} 步・已走 ${this.whiteMoveCount()} 步`;
            }
        }

        if (this.chess.in_checkmate()) {
            statusText = `將殺！ ${moveColor} 敗北`;
            /* 📅 每日殘局:白方將死黑王=完成,記今天最少步(一局只記一次)。
               ★ in_checkmate() 時 turn() 是**被將死的那一方** ⇒ turn()==='b' 才是白方獲勝。 */
            if (this.dailyKey && !this.dailyScored && this.chess.turn() === 'b') {
                this.dailyScored = true;
                const moves = this.whiteMoveCount();
                const r = this.saveDailyResult(this.dailyKey, this.dailyPuzzle.id, moves);
                const total = this.dailySet ? this.dailySet.puzzles.length : 1;
                statusText = `📅 第 ${this.dailyIndex + 1} 題將死！${moves} 步`
                    + (moves <= this.dailyPuzzle.mateIn ? '(滿分!)' : `(目標 ${this.dailyPuzzle.mateIn} 步)`)
                    + (r.isNewBest ? ' 新紀錄!' : '')
                    + `・今天已解 ${r.solvedCount}/${total} 題`
                    + (r.solvedCount >= total ? ' —— 今天全解完了,明天有新的一組!' : '(按「📅 每日殘局」接下一題)');
            }
            this.showGameOver(statusText);
        } else if (this.chess.in_draw()) {
            statusText = '和棋！';
            this.showGameOver(statusText);
        } else {
            statusText = `輪到 ${moveColor} (${this.chess.turn() === this.playerColor ? '你' : 'AI'})`;
            if (this.chess.in_check()) {
                statusText += ' - 將軍！';
            }
        }

        this.uiStatus.textContent = statusText;
    }

    updateHistoryUI() {
        const history = this.chess.history();
        this.uiMoveHistory.innerHTML = '';

        for (let i = 0; i < history.length; i += 2) {
            const moveNum = Math.floor(i / 2) + 1;
            const whiteMove = history[i];
            const blackMove = history[i + 1] ? history[i + 1] : '';

            const li = document.createElement('li');
            li.textContent = `${moveNum}. ${whiteMove} ${blackMove}`;
            this.uiMoveHistory.appendChild(li);
        }

        // 自動捲動到最底部
        this.uiMoveHistory.parentElement.scrollTop = this.uiMoveHistory.parentElement.scrollHeight;
    }

    showGameOver(message) {
        document.getElementById('game-over-message').textContent = message;
        /* 📅 每日模式:結算框給「下一題 / 這題再來一次」,並把「再玩一局」藏起來
           (它會回一般對局 —— 解題途中最不該出現的出口)。
           ★ 由來:冒煙測試抓到「結算框蓋住每日鈕」,孩子接不到下一題。 */
        const isDaily = !!this.dailyKey;
        const next = isDaily ? this.nextUnsolvedIndex() : -1;
        const btnNext = document.getElementById('btn-daily-next');
        const btnRetry = document.getElementById('btn-daily-retry');
        const btnRestart = document.getElementById('btn-restart');
        if (btnNext) btnNext.classList.toggle('hidden', !(isDaily && next >= 0));
        if (btnRetry) btnRetry.classList.toggle('hidden', !isDaily);
        if (btnRestart) btnRestart.classList.toggle('hidden', isDaily);
        document.getElementById('modal-game-over').classList.remove('hidden');
    }

    updateView() {
        this.board3d.updateBoard(this.chess);
        this.updateStatus();
        this.updateHistoryUI();
        if (this.undoManager) {
            this.undoManager.updateUI();
        } else if (this.uiBtnUndo) {
            this.uiBtnUndo.disabled = this.chess.history().length === 0;
        }
    }
}
