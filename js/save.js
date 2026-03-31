class SaveManager {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.slots = 5;
        this.prefix = 'chess3d_save_';
        this.autoSaveKey = 'chess3d_autosave';
        this.uiSaveSlots = document.getElementById('save-slots');
    }

    saveAuto() {
        const state = {
            pgn: this.game.chess.pgn(),
            playerColor: this.game.playerColor,
            difficulty: this.game.aiDifficulty,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(this.autoSaveKey, JSON.stringify(state));
    }

    loadAuto() {
        const data = localStorage.getItem(this.autoSaveKey);
        if (data) {
            try {
                this.restoreState(JSON.parse(data));
                return true;
            } catch (e) {
                console.warn('自動存檔載入失敗，開始新遊戲', e);
                localStorage.removeItem(this.autoSaveKey);
                return false;
            }
        }
        return false;
    }

    saveToSlot(slotIndex) {
        const state = {
            pgn: this.game.chess.pgn(),
            playerColor: this.game.playerColor,
            difficulty: this.game.aiDifficulty,
            timestamp: new Date().toISOString(),
            moveCount: this.game.chess.history().length
        };
        localStorage.setItem(this.prefix + slotIndex, JSON.stringify(state));
        this.renderSlots();
    }

    loadFromSlot(slotIndex) {
        const data = localStorage.getItem(this.prefix + slotIndex);
        if (data) {
            this.restoreState(JSON.parse(data));
            document.getElementById('modal-saves').classList.add('hidden');
        }
    }

    restoreState(state) {
        // 使用 PGN 載入以保留完整走步歷史（支援悔棋）
        this.game.chess.reset();
        if (state.pgn) {
            this.game.chess.load_pgn(state.pgn);
        } else if (state.fen) {
            // 向下相容舊存檔格式（FEN）
            this.game.chess.load(state.fen);
        }

        this.game.playerColor = state.playerColor || 'w';
        this.game.aiDifficulty = state.difficulty || 'medium';

        document.getElementById('ai-difficulty').value = this.game.aiDifficulty;
        document.getElementById('player-color').value = this.game.playerColor;

        this.game.board3d.setCameraSide(this.game.playerColor);
        this.game.clearSelection();
        this.game.updateView();

        // 判斷是否需要讓 AI 下子
        if (!this.game.isGameOver() && this.game.chess.turn() !== this.game.playerColor) {
            this.game.makeAiMove();
        }
    }

    deleteSlot(slotIndex) {
        localStorage.removeItem(this.prefix + slotIndex);
        this.renderSlots();
    }

    formatDate(isoString) {
        const d = new Date(isoString);
        return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    renderSlots() {
        if (!this.uiSaveSlots) return;
        this.uiSaveSlots.innerHTML = '';

        for (let i = 1; i <= this.slots; i++) {
            const data = localStorage.getItem(this.prefix + i);
            const slotDiv = document.createElement('div');
            slotDiv.className = 'save-slot';

            if (data) {
                const state = JSON.parse(data);
                const info = document.createElement('div');
                info.className = 'slot-info';
                info.innerHTML = `<strong>欄位 ${i}</strong><br>
                                  ${this.formatDate(state.timestamp)}<br>
                                  ${state.moveCount || '?'} 步 - ${state.playerColor === 'w' ? '白方' : '黑方'}`;

                const actions = document.createElement('div');
                actions.className = 'slot-actions';

                const btnLoad = document.createElement('button');
                btnLoad.className = 'btn primary';
                btnLoad.textContent = '讀取';
                btnLoad.onclick = () => this.loadFromSlot(i);

                const btnOverwrite = document.createElement('button');
                btnOverwrite.className = 'btn';
                btnOverwrite.textContent = '覆蓋';
                btnOverwrite.onclick = () => this.saveToSlot(i);

                actions.appendChild(btnLoad);
                actions.appendChild(btnOverwrite);

                slotDiv.appendChild(info);
                slotDiv.appendChild(actions);
            } else {
                const info = document.createElement('div');
                info.className = 'slot-info';
                info.textContent = `欄位 ${i} (空)`;

                const btnSave = document.createElement('button');
                btnSave.className = 'btn primary';
                btnSave.textContent = '存檔';
                btnSave.onclick = () => this.saveToSlot(i);

                slotDiv.appendChild(info);
                slotDiv.appendChild(btnSave);
            }
            this.uiSaveSlots.appendChild(slotDiv);
        }
    }
}
