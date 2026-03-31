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
