// 主應用程式與 UI 事件邏輯

// PWA 安裝邏輯
let deferredPrompt;
const installBtn = document.getElementById('btn-install');

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // 清除舊的 SW cache 後重新註冊
        if (caches) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
        }
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.error('SW failed', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    // 防止 Chrome 67 以前預設出現安裝提示
    e.preventDefault();
    // 保存事件以便稍後觸發
    deferredPrompt = e;
    // 更新 UI 顯示安裝按鈕
    installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
        installBtn.classList.add('hidden');
    }
});

window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    installBtn.classList.add('hidden');
});

// UI 模態框操作邏輯
document.addEventListener('DOMContentLoaded', () => {
    // 初始化遊戲與各項模組
    window.chessGame = new ChessGame();
    window.chessGame.ai = new ChessAI();
    window.chessGame.undoManager = new UndoManager(window.chessGame);
    window.chessGame.saveManager = new SaveManager(window.chessGame);

    // 提供全域存檔介面更新
    window.refreshSaveSlots = () => window.chessGame.saveManager.renderSlots();

    // 嘗試讀取自動存檔，若無則開啟新局
    if (!window.chessGame.saveManager.loadAuto()) {
        window.chessGame.startNew('w', 'medium');
    }

    const btnSettings = document.getElementById('btn-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const modalSettings = document.getElementById('modal-settings');

    const btnSaveMenu = document.getElementById('btn-save-menu');
    const btnCloseSaves = document.getElementById('btn-close-saves');
    const modalSaves = document.getElementById('modal-saves');

    const btnRestart = document.getElementById('btn-restart');
    const btnNewGame = document.getElementById('btn-new-game');

    const modalGameOver = document.getElementById('modal-game-over');

    // 設定選單
    btnSettings.addEventListener('click', () => modalSettings.classList.remove('hidden'));
    btnCloseSettings.addEventListener('click', () => modalSettings.classList.add('hidden'));

    // 存檔選單
    btnSaveMenu.addEventListener('click', () => {
        if (window.refreshSaveSlots) window.refreshSaveSlots();
        modalSaves.classList.remove('hidden');
    });
    btnCloseSaves.addEventListener('click', () => modalSaves.classList.add('hidden'));

    // 新開局（包含重置狀態）
    const startNewGame = () => {
        modalSettings.classList.add('hidden');
        modalGameOver.classList.add('hidden');

        // 取得玩家設定
        const difficulty = document.getElementById('ai-difficulty').value;
        const playerColor = document.getElementById('player-color').value;

        if (window.chessGame) {
            window.chessGame.startNew(playerColor, difficulty);
        }
    };

    btnRestart.addEventListener('click', startNewGame);
    btnNewGame.addEventListener('click', startNewGame);

    // 悔棋按鈕
    const btnUndo = document.getElementById('btn-undo');
    btnUndo.addEventListener('click', () => {
        if (window.chessGame && window.chessGame.undoManager) {
            window.chessGame.undoManager.undo();
        }
    });
});
