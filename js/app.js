// 主應用程式與 UI 事件邏輯

/* 📱 內建瀏覽器偵測(守門 #30):教會連結走 LINE 發,LINE 的 WebView 裝不了 APP
   (beforeinstallprompt 永遠不觸發)——開場就講「換瀏覽器」,別讓人按一顆沒反應的鈕。
   只提醒不擋:棋照樣能下。 */
const IN_APP_BROWSER = (() => {
    const ua = navigator.userAgent || '';
    if (/\bLine\//i.test(ua) || /\bLIFF\b/i.test(ua)) return { n: 'LINE', m: '右上角「⋯」→「用其他瀏覽器開啟」' };
    if (/FBAN|FBAV|FB_IAB|FB4A/i.test(ua)) return { n: 'Facebook', m: '右上角「⋯」→「在外部瀏覽器中開啟」' };
    if (/Instagram/i.test(ua)) return { n: 'Instagram', m: '右上角「⋯」→「在瀏覽器中開啟」' };
    if (/MicroMessenger/i.test(ua)) return { n: '微信', m: '右上角「⋯」→「在瀏覽器中開啟」' };
    return null;
})();

// PWA 安裝邏輯
let deferredPrompt;
const installBtn = document.getElementById('btn-install');
if (IN_APP_BROWSER && installBtn) {
    installBtn.classList.add('hidden');
    const hint = document.getElementById('in-app-hint');
    if (hint) {
        hint.textContent = `你正用 ${IN_APP_BROWSER.n} 內建瀏覽器開啟——要安裝 APP 請先點${IN_APP_BROWSER.m}。棋照樣可以下!`;
        hint.classList.remove('hidden');
    }
}

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

    /* 📅 每日殘局(一組多題):開題 + 說明。n 不給=接今天還沒解的第一題。
       ★ announce=false 用在結算框的「下一題」(剛解完不想再彈一次長說明,
         題名與目標在常駐狀態行上看得到)。 */
    const openDaily = (n, announce = true) => {
        modalSettings.classList.add('hidden');
        modalGameOver.classList.add('hidden');
        if (!window.chessGame) return;
        window.chessGame.startDaily(n);
        const g = window.chessGame;
        if (g.dailyPuzzle && announce) {
            const prog = g.dailyProgress();
            const best = prog && prog.solved[g.dailyPuzzle.id];
            alert(`📅 ${g.dailyKey} 今天一共 ${prog ? prog.total : 1} 題,已解 ${prog ? prog.done : 0} 題\n\n`
                + `第 ${g.dailyIndex + 1} 題「${g.dailyPuzzle.name}」\n目標:${g.dailyPuzzle.mateIn} 步將死\n提示:${g.dailyPuzzle.hint}`
                + (best ? `\n\n這題你的最佳:${best} 步` : '')
                + '\n\n今天全世界都是同一組題!');
        }
    };
    const btnDaily = document.getElementById('btn-daily');
    if (btnDaily) btnDaily.addEventListener('click', () => openDaily(undefined, true));

    /* 結算框裡的兩顆(每日模式才顯示)——★ 由來:冒煙測試抓到「結算框蓋住每日鈕」,
       孩子解完一題接不到下一題,而框裡唯一的鈕會把他丟回一般對局。 */
    const btnDailyNext = document.getElementById('btn-daily-next');
    const btnDailyRetry = document.getElementById('btn-daily-retry');
    if (btnDailyNext) btnDailyNext.addEventListener('click', () => {
        const g = window.chessGame;
        const next = g ? g.nextUnsolvedIndex() : -1;
        openDaily(next >= 0 ? next : undefined, false);
    });
    if (btnDailyRetry) btnDailyRetry.addEventListener('click', () => {
        const g = window.chessGame;
        openDaily(g ? g.dailyIndex : undefined, false);
    });

    // 悔棋按鈕
    const btnUndo = document.getElementById('btn-undo');
    btnUndo.addEventListener('click', () => {
        if (window.chessGame && window.chessGame.undoManager) {
            window.chessGame.undoManager.undo();
        }
    });
});

// 測試掛勾(驗收腳本用;艦隊慣例)——真人操作不經過它
window.__phantom = { get game() { return window.chessGame; } };
