/* ══════════ 🏷️ 棋名標籤(2026-09-07)══════════
   使用者回報:「我不知道哪個棋是哪個長相」。3D 棋子只靠形狀分辨,對新手與長輩太吃力。
   作法:CanvasTexture → THREE.Sprite(永遠正對鏡頭 ⇒ 轉到任何角度都讀得到),
   掛在每顆棋子頭頂、下緣帶一個指向棋子的小尖角,一眼看得出是「這一顆」的名字。
   ★ 標籤 raycast 關掉 —— 浮在半空的牌子在視覺上會蓋到別格,不關會點錯棋。
   ★ 貼圖/材質依「type+color」快取:updateBoard() 每走一手就重建 32 顆棋子,
     不快取的話每手漏 32 張 canvas 貼圖(下完一局就是幾千張)。
   ★ 為什麼不真的「刻在棋身上」:棋身在正常視距只有 40~60px 高,刻上去的字約十幾像素,
     反而看不清 —— 這裡以「讀得到」為優先。 */
const PIECE_LABEL_TEXT = { p: '兵', r: '城堡', n: '騎士', b: '主教', q: '皇后', k: '國王' };
// 每種棋子頭頂的高度(棋子本體最高點再往上留一點空隙;數值對應 createPieceMesh 裡各型的實際高度)
const PIECE_LABEL_Y = { p: 1.02, r: 1.28, n: 1.33, b: 1.47, q: 1.54, k: 1.60 };
const PIECE_LABEL_KEY = 'chess3d.pieceLabels';

class ChessBoard3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f0f1b);

        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
        this.camera.position.set(0, 8, 10);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 20;
        this.controls.target.set(0, 0, 0);

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.pieces = {};
        this.tiles = {};

        // 🏷️ 棋名標籤:預設「開」(看不懂棋子長相是這站的主要卡點);使用者關過就記住
        let savedLabels = null;
        try { savedLabels = localStorage.getItem(PIECE_LABEL_KEY); } catch (e) { /* 私密模式照玩 */ }
        this.showLabels = savedLabels !== '0';
        this._labelMats = {};   // key = type+color → THREE.SpriteMaterial(共用,省貼圖)

        this.selectedTile = null;
        this.highlightedTiles = [];
        this.onSquareClick = null;

        // 所有 64 格的列表，用於遍歷棋盤
        this.ALL_SQUARES = [];
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        for (let r = 1; r <= 8; r++) {
            for (let f = 0; f < 8; f++) {
                this.ALL_SQUARES.push(files[f] + r);
            }
        }

        this.initLighting();
        this.createBoard();

        // 拖曳偵測
        this._clickStartPos = null;
        this._clickStartTime = 0;

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        // 在 window capture phase 偵聽 pointer 事件
        // 這會在 OrbitControls 處理之前就記錄座標
        const canvas = this.renderer.domElement;

        window.addEventListener('pointerdown', (e) => {
            // 檢查點擊是否在 canvas 範圍內
            const rect = canvas.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                this._clickStartPos = { x: e.clientX, y: e.clientY };
                this._clickStartTime = Date.now();
            }
        }, true); // true = capture phase，在 OrbitControls 之前執行

        window.addEventListener('pointerup', (e) => {
            if (this._clickStartPos) {
                const dx = e.clientX - this._clickStartPos.x;
                const dy = e.clientY - this._clickStartPos.y;
                const dt = Date.now() - this._clickStartTime;
                // 短按（< 300ms）且幾乎沒移動（< 8px）= 點擊選棋
                if (Math.sqrt(dx * dx + dy * dy) < 8 && dt < 300) {
                    this.onPointerClick(e);
                }
            }
            this._clickStartPos = null;
        }, true); // true = capture phase

        this.animate();
    }

    initLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(5, 12, 5);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0x4ecca3, 0.4);
        fillLight.position.set(-5, 8, -5);
        this.scene.add(fillLight);

        const backLight = new THREE.DirectionalLight(0x6666ff, 0.3);
        backLight.position.set(0, 5, -10);
        this.scene.add(backLight);
    }

    createBoard() {
        const tileSize = 1;
        const boardOffset = 3.5;

        // 底座
        const baseGeo = new THREE.BoxGeometry(9, 0.5, 9);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.4, metalness: 0.3 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = -0.3;
        base.receiveShadow = true;
        this.scene.add(base);

        // 邊框裝飾
        const rimGeo = new THREE.BoxGeometry(8.6, 0.12, 8.6);
        const rimMat = new THREE.MeshStandardMaterial({ color: 0x4ecca3, emissive: 0x4ecca3, emissiveIntensity: 0.15 });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.y = -0.01;
        this.scene.add(rim);

        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const tileGeo = new THREE.BoxGeometry(tileSize, 0.1, tileSize);

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const isLight = (row + col) % 2 !== 0;
                const color = isLight ? 0x98c1d9 : 0x3d5a80;
                const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
                const tile = new THREE.Mesh(tileGeo, mat);

                const x = col * tileSize - boardOffset;
                const z = row * tileSize - boardOffset;
                tile.position.set(x, 0.05, z);
                tile.receiveShadow = true;

                const rank = 8 - row;
                const file = files[col];
                const square = file + rank;

                tile.userData = { square: square, originalColor: color };
                this.tiles[square] = tile;
                this.scene.add(tile);
            }
        }
    }

    /** 🏷️ 產生一顆棋子的名字牌(Sprite,永遠正對鏡頭)。材質依 type+color 快取。 */
    makePieceLabel(type, color) {
        const key = type + color;
        if (!this._labelMats[key]) {
            const isWhite = color === 'w';
            const plate = isWhite ? '#f6efe1' : '#23252f';   // 牌面=棋子的色系,順便看得出黑白方
            const ink = isWhite ? '#1a1a2e' : '#f4f1e8';
            const edge = '#4ecca3';                          // 邊框=棋盤邊框的青綠,整站同一套視覺

            const c = document.createElement('canvas');
            c.width = 256; c.height = 128;                   // 2 的次方:避免 NPOT 貼圖在舊行動 GPU 上出事
            const g = c.getContext('2d');

            // 圓角牌面
            const x0 = 6, y0 = 6, x1 = 250, y1 = 92, r = 20;
            g.beginPath();
            g.moveTo(x0 + r, y0);
            g.lineTo(x1 - r, y0); g.quadraticCurveTo(x1, y0, x1, y0 + r);
            g.lineTo(x1, y1 - r); g.quadraticCurveTo(x1, y1, x1 - r, y1);
            g.lineTo(x0 + r, y1); g.quadraticCurveTo(x0, y1, x0, y1 - r);
            g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0);
            g.closePath();
            g.fillStyle = plate; g.fill();
            g.lineWidth = 7; g.strokeStyle = edge; g.stroke();

            // 下緣小尖角:指著它自己那顆棋子(不然一堆牌子浮在半空,分不出是誰的)
            g.beginPath();
            g.moveTo(110, y1 - 4); g.lineTo(146, y1 - 4); g.lineTo(128, 122);
            g.closePath();
            g.fillStyle = plate; g.fill();
            g.lineWidth = 7; g.strokeStyle = edge; g.stroke();
            g.beginPath();                                   // 補一刀蓋掉尖角與牌面之間的那條邊
            g.moveTo(112, y1 - 5); g.lineTo(144, y1 - 5);
            g.lineWidth = 9; g.strokeStyle = plate; g.stroke();

            // 名字
            g.font = 'bold 58px "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = ink;
            g.fillText(PIECE_LABEL_TEXT[type] || '', 128, 51);

            const tex = new THREE.CanvasTexture(c);
            tex.minFilter = THREE.LinearFilter;              // 不做 mipmap:字才不會在遠處糊成一團
            tex.generateMipmaps = false;
            this._labelMats[key] = new THREE.SpriteMaterial({
                map: tex,
                transparent: true,
                depthWrite: false                            // 牌子彼此不互相寫深度,重疊時不會挖出黑洞
            });
        }

        const sprite = new THREE.Sprite(this._labelMats[key]);
        sprite.name = 'pieceLabel';
        sprite.scale.set(0.78, 0.39, 1);                     // 一格=1,牌子略窄於一格
        sprite.position.y = PIECE_LABEL_Y[type] || 1.3;
        sprite.visible = this.showLabels === true;           // ★ 只認嚴格 true
        sprite.raycast = function () { };                    // ★ 不吃點擊:否則會擋住它視覺上蓋到的別格
        return sprite;
    }

    /** 🏷️ 開關棋名標籤(記在 localStorage,下次進來照舊) */
    setLabelsVisible(on) {
        this.showLabels = on === true;
        Object.values(this.pieces).forEach((group) => {
            group.traverse((o) => { if (o.name === 'pieceLabel') o.visible = this.showLabels; });
        });
        try { localStorage.setItem(PIECE_LABEL_KEY, this.showLabels ? '1' : '0'); } catch (e) { /* 私密模式照玩 */ }
    }

    // 為每個棋子類型創建 Group（不用已移除的 Geometry 合併法）
    createPieceMesh(type, color) {
        const group = new THREE.Group();

        const isWhite = color === 'w';
        const mainColor = isWhite ? 0xf0e6d3 : 0x2a2a2a;
        const accentColor = isWhite ? 0xd4c4a8 : 0x444444;

        const mainMat = new THREE.MeshStandardMaterial({
            color: mainColor,
            roughness: 0.35,
            metalness: 0.15
        });
        const accentMat = new THREE.MeshStandardMaterial({
            color: accentColor,
            roughness: 0.4,
            metalness: 0.2
        });

        // 所有棋子共用底座
        const baseGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.12, 24);
        const baseMesh = new THREE.Mesh(baseGeo, accentMat);
        baseMesh.position.y = 0.06;
        group.add(baseMesh);

        switch (type) {
            case 'p': { // 兵
                const stem = new THREE.CylinderGeometry(0.12, 0.2, 0.35, 16);
                const stemMesh = new THREE.Mesh(stem, mainMat);
                stemMesh.position.y = 0.3;
                group.add(stemMesh);

                const head = new THREE.SphereGeometry(0.18, 16, 16);
                const headMesh = new THREE.Mesh(head, mainMat);
                headMesh.position.y = 0.58;
                group.add(headMesh);
                break;
            }
            case 'r': { // 城堡
                const body = new THREE.CylinderGeometry(0.25, 0.3, 0.6, 16);
                const bodyMesh = new THREE.Mesh(body, mainMat);
                bodyMesh.position.y = 0.42;
                group.add(bodyMesh);

                const top = new THREE.CylinderGeometry(0.3, 0.25, 0.15, 16);
                const topMesh = new THREE.Mesh(top, accentMat);
                topMesh.position.y = 0.8;
                group.add(topMesh);

                // 城垛
                for (let i = 0; i < 4; i++) {
                    const merlon = new THREE.BoxGeometry(0.12, 0.15, 0.12);
                    const merlonMesh = new THREE.Mesh(merlon, mainMat);
                    const angle = (i / 4) * Math.PI * 2;
                    merlonMesh.position.set(Math.cos(angle) * 0.2, 0.95, Math.sin(angle) * 0.2);
                    group.add(merlonMesh);
                }
                break;
            }
            case 'n': { // 騎士
                const body = new THREE.CylinderGeometry(0.15, 0.25, 0.4, 16);
                const bodyMesh = new THREE.Mesh(body, mainMat);
                bodyMesh.position.y = 0.32;
                group.add(bodyMesh);

                // 馬頭（用傾斜的 Box 近似）
                const headGeo = new THREE.BoxGeometry(0.2, 0.5, 0.3);
                const headMesh = new THREE.Mesh(headGeo, mainMat);
                headMesh.position.set(0.05, 0.7, 0);
                headMesh.rotation.z = 0.3;
                group.add(headMesh);

                // 耳朵
                const ear = new THREE.ConeGeometry(0.06, 0.15, 8);
                const earMesh = new THREE.Mesh(ear, accentMat);
                earMesh.position.set(0.12, 1.0, 0);
                group.add(earMesh);
                break;
            }
            case 'b': { // 主教
                const body = new THREE.CylinderGeometry(0.1, 0.25, 0.65, 16);
                const bodyMesh = new THREE.Mesh(body, mainMat);
                bodyMesh.position.y = 0.44;
                group.add(bodyMesh);

                const topCone = new THREE.ConeGeometry(0.18, 0.35, 16);
                const topMesh = new THREE.Mesh(topCone, mainMat);
                topMesh.position.y = 0.94;
                group.add(topMesh);

                const ball = new THREE.SphereGeometry(0.06, 12, 12);
                const ballMesh = new THREE.Mesh(ball, accentMat);
                ballMesh.position.y = 1.15;
                group.add(ballMesh);
                break;
            }
            case 'q': { // 皇后
                const body = new THREE.CylinderGeometry(0.12, 0.28, 0.8, 16);
                const bodyMesh = new THREE.Mesh(body, mainMat);
                bodyMesh.position.y = 0.52;
                group.add(bodyMesh);

                // 皇冠 (幾個小三角)
                for (let i = 0; i < 5; i++) {
                    const spike = new THREE.ConeGeometry(0.06, 0.2, 8);
                    const spikeMesh = new THREE.Mesh(spike, accentMat);
                    const angle = (i / 5) * Math.PI * 2;
                    spikeMesh.position.set(Math.cos(angle) * 0.15, 1.05, Math.sin(angle) * 0.15);
                    group.add(spikeMesh);
                }

                const ball = new THREE.SphereGeometry(0.1, 12, 12);
                const ballMesh = new THREE.Mesh(ball, mainMat);
                ballMesh.position.y = 1.18;
                group.add(ballMesh);
                break;
            }
            case 'k': { // 國王
                const body = new THREE.CylinderGeometry(0.14, 0.3, 0.85, 16);
                const bodyMesh = new THREE.Mesh(body, mainMat);
                bodyMesh.position.y = 0.55;
                group.add(bodyMesh);

                // 十字架
                const crossH = new THREE.BoxGeometry(0.3, 0.08, 0.08);
                const crossHMesh = new THREE.Mesh(crossH, accentMat);
                crossHMesh.position.y = 1.15;
                group.add(crossHMesh);

                const crossV = new THREE.BoxGeometry(0.08, 0.35, 0.08);
                const crossVMesh = new THREE.Mesh(crossV, accentMat);
                crossVMesh.position.y = 1.15;
                group.add(crossVMesh);
                break;
            }
        }

        // 設定投影
        group.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // 🏷️ 名字牌最後掛(放在投影設定之後:Sprite 不該投影,也不該接影子)
        group.add(this.makePieceLabel(type, color));

        return group;
    }

    updateBoard(chessInstance) {
        // 清除現有棋子
        Object.values(this.pieces).forEach(p => this.scene.remove(p));
        this.pieces = {};

        this.ALL_SQUARES.forEach(square => {
            const piece = chessInstance.get(square);
            if (piece) {
                const group = this.createPieceMesh(piece.type, piece.color);

                const tile = this.tiles[square];
                if (tile) {
                    group.position.set(tile.position.x, 0.1, tile.position.z);
                }

                group.userData = { square: square, color: piece.color, type: piece.type };
                this.pieces[square] = group;
                this.scene.add(group);
            }
        });
    }

    onWindowResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }

    onPointerClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // 檢測所有場景中的物件（遞迴，以便偵測 Group 下的子物件）
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        for (let i = 0; i < intersects.length; i++) {
            let obj = intersects[i].object;

            // 向上查找 parent 直到找到有 square 資訊的物件
            while (obj) {
                if (obj.userData && obj.userData.square) {
                    if (this.onSquareClick) {
                        this.onSquareClick(obj.userData.square);
                    }
                    return;
                }
                obj = obj.parent;
            }
        }
    }

    setCameraSide(color) {
        if (color === 'w') {
            this.camera.position.set(0, 8, 10);
        } else {
            this.camera.position.set(0, 8, -10);
        }
        this.camera.lookAt(0, 0, 0);
        this.controls.update();
    }

    highlightSquare(square, colorHex = 0xffff00) {
        const tile = this.tiles[square];
        if (tile) {
            tile.material.color.setHex(colorHex);
            this.highlightedTiles.push(square);
        }
    }

    clearHighlights() {
        this.highlightedTiles.forEach(sq => {
            const tile = this.tiles[sq];
            if (tile) tile.material.color.setHex(tile.userData.originalColor);
        });
        this.highlightedTiles = [];
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
