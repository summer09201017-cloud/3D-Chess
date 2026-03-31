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
            let bestMove = null;
            let bestValue = chess.turn() === 'w' ? -Infinity : Infinity;

            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                chess.move(move);
                // 使用深度 2 (其實總深度為 3 因為第一層我們自己跑了)
                const boardValue = this.minimax(chess, 2, -Infinity, Infinity, chess.turn() === 'w');
                chess.undo();

                if (chess.turn() === 'w') {
                    if (boardValue > bestValue) {
                        bestValue = boardValue;
                        bestMove = move;
                    }
                } else {
                    if (boardValue < bestValue) {
                        bestValue = boardValue;
                        bestMove = move;
                    }
                }
            }
            return bestMove || moves[0];
        }
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
        if (depth === 0 || chess.game_over()) {
            return this.evaluateBoard(chess);
        }

        const moves = chess.moves({ verbose: true });

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

    evaluateBoard(chess) {
        if (chess.in_checkmate()) {
            return chess.turn() === 'w' ? -9999 : 9999;
        }
        if (chess.in_draw()) {
            return 0;
        }

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
