class UndoManager {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.uiBtnUndo = document.getElementById('btn-undo');
    }

    // 使用 chess.js 內建的 undo() 直接撤銷走步
    undo() {
        if (this.game.isAiThinking) return;

        const chess = this.game.chess;

        // 至少要有走步可撤銷
        if (chess.history().length === 0) return;

        // 如果輪到玩家，需要退兩步（自己的 + AI 的）
        if (chess.turn() === this.game.playerColor) {
            chess.undo(); // 撤銷 AI 的上一步
            chess.undo(); // 撤銷玩家的上一步
        } else {
            // 輪到 AI（可能遊戲結束後），只退一步
            chess.undo();
        }

        this.game.clearSelection();
        this.game.updateView();
        if (this.game.saveManager) this.game.saveManager.saveAuto();
    }

    clear() {
        // chess.reset() 已經清了歷史，這裡只更新 UI
        this.updateUI();
    }

    updateUI() {
        if (this.uiBtnUndo) {
            this.uiBtnUndo.disabled =
                this.game.chess.history().length === 0 ||
                this.game.isAiThinking;
        }
    }
}
