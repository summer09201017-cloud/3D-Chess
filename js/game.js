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

        if (this.chess.in_checkmate()) {
            statusText = `將殺！ ${moveColor} 敗北`;
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
