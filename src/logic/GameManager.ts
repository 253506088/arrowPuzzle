import { LogicalGrid, Direction, Worm, type Point } from './Grid';

// 柔和糖果色系（深色背景友好）
const PALETTE = [
    0xF87171, 0xFB923C, 0xFBBF24, 0xA3E635,
    0x34D399, 0x22D3EE, 0x60A5FA, 0xA78BFA,
    0xE879F9, 0xFB7185, 0x38BDF8, 0x4ADE80,
    0xFACC15, 0xF472B6, 0x67E8F9, 0xC084FC
];

export class GameManager {
    gridWidth: number;
    gridHeight: number;
    logicGrid: LogicalGrid;
    private initialLevelJson: string = ''; // 初始关卡快照（用于导出）

    constructor(width: number, height: number) {
        this.gridWidth = width;
        this.gridHeight = height;
        this.logicGrid = new LogicalGrid(width, height);
        // Do not auto-generate in constructor to allow reset control
    }

    reset() {
        this.logicGrid = new LogicalGrid(this.gridWidth, this.gridHeight);
    }

    // 策略："先铺形状，再拓扑分配方向"
    // 分配顺序 = 通关顺序的逆序 → 数学上保证可解
    generateLevel(targetDensity: number = 0.95, minWormCount: number = 0): boolean {
        const maxRetries = 10000;

        for (let retry = 0; retry < maxRetries; retry++) {
            this.reset();
            let nextId = 0;
            const totalCells = this.gridWidth * this.gridHeight;

            // === Phase 1: 填满格子（只管形状，不管方向）===
            let fillAttempts = 0;
            while (fillAttempts < 5000) {
                fillAttempts++;

                const emptyCells: Point[] = [];
                for (let y = 0; y < this.gridHeight; y++) {
                    for (let x = 0; x < this.gridWidth; x++) {
                        if (this.logicGrid.isEmpty(x, y)) emptyCells.push({ x, y });
                    }
                }

                const occupied = totalCells - emptyCells.length;
                if (occupied / totalCells >= targetDensity) break;
                if (emptyCells.length === 0) break;

                const start = emptyCells[Math.floor(Math.random() * emptyCells.length)];
                const worm = new Worm(nextId++, PALETTE[Math.floor(Math.random() * PALETTE.length)]);

                const length = Math.floor(Math.random() * 4) + 5; // 5~8
                const cells: Point[] = [{ x: start.x, y: start.y }];
                let cx = start.x, cy = start.y;

                for (let i = 1; i < length; i++) {
                    const dirs = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
                    let found = false;
                    for (const d of dirs) {
                        let nx = cx, ny = cy;
                        switch (d) {
                            case Direction.UP: ny--; break;
                            case Direction.DOWN: ny++; break;
                            case Direction.LEFT: nx--; break;
                            case Direction.RIGHT: nx++; break;
                        }
                        if (this.logicGrid.isValid(nx, ny) && this.logicGrid.isEmpty(nx, ny) && !cells.some(c => c.x === nx && c.y === ny)) {
                            cells.push({ x: nx, y: ny });
                            cx = nx; cy = ny;
                            found = true;
                            break;
                        }
                    }
                    if (!found) break;
                }

                if (cells.length < 5) continue;
                worm.cells = cells;
                worm.direction = Direction.UP; // 占位，Phase 2 会覆盖
                this.logicGrid.addWorm(worm);
            }

            const wormCount = this.logicGrid.worms.size;
            const density = (totalCells - this.countEmpty()) / totalCells;
            console.log(`[生成] 第 ${retry + 1} 次填充。虫子: ${wormCount}, 密度: ${(density * 100).toFixed(1)}%`);

            // === Phase 2: 拓扑分配方向（剥洋葱）===
            if (this.assignDirectionsTopologically()) {
                if (minWormCount > 0 && this.logicGrid.worms.size < minWormCount) {
                    console.log(`[生成] 虫子数 ${this.logicGrid.worms.size} < 最少要求 ${minWormCount}，重试...`);
                    continue;
                }
                console.log(`[生成] 成功！虫子: ${this.logicGrid.worms.size}`);
                this.initialLevelJson = this.serializeLevel();
                return true;
            }

            console.log(`[生成] 第 ${retry + 1} 次方向分配失败，重新生成...`);
        }

        console.error(`[生成] 失败：${maxRetries} 次重试后仍未成功。`);
        return false;
    }

    // 拓扑方向分配：从外向内"剥洋葱"
    // 每次找一条能直达墙壁的虫子，给它分配那个方向，然后"移走"它
    // 优化：每条虫子尝试两个端点当头（翻转），选择空间从4扩大到8
    private assignDirectionsTopologically(): boolean {
        const remaining = new Set(this.logicGrid.worms.keys());
        const assignments: { id: number; dir: Direction; reverse: boolean }[] = [];

        while (remaining.size > 0) {
            let foundFree = false;

            for (const id of remaining) {
                const worm = this.logicGrid.worms.get(id)!;
                const originalCells = worm.cells;

                // 尝试两个端点当头：原始 + 翻转
                const orientations: { cells: Point[]; reverse: boolean }[] = [
                    { cells: originalCells, reverse: false },
                    { cells: [...originalCells].reverse(), reverse: true }
                ];

                for (const orient of orientations) {
                    worm.cells = orient.cells;

                    const dirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
                    dirs.sort(() => Math.random() - 0.5);

                    for (const dir of dirs) {
                        if (this.checkSelfBlock(worm.cells, dir)) continue;

                        worm.direction = dir;
                        if (!this.isBlockedBySet(worm, remaining)) {
                            assignments.push({ id, dir, reverse: orient.reverse });
                            remaining.delete(id);
                            foundFree = true;
                            break;
                        }
                    }

                    if (foundFree) break;
                }

                // 测试后必须还原 cells，应用阶段统一翻转
                worm.cells = originalCells;
                if (foundFree) break;
            }

            if (!foundFree) {
                console.warn(`[方向分配] 失败：剩余 ${remaining.size} 只虫子无出路`);
                return false;
            }
        }

        // 全部分配成功，应用方向和翻转
        for (const { id, dir, reverse } of assignments) {
            const worm = this.logicGrid.worms.get(id)!;
            if (reverse) worm.cells = [...worm.cells].reverse();
            worm.direction = dir;
        }
        console.log(`[方向分配] 成功！${assignments.length} 只虫子全部分配方向`);
        return true;
    }

    private countEmpty(): number {
        let count = 0;
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.logicGrid.isEmpty(x, y)) count++;
            }
        }
        return count;
    }

    // 检查虫子是否被 potentialBlockers 集合中的某条虫子挡住
    private isBlockedBySet(subject: Worm, potentialBlockers: Set<number>): boolean {
        let cx = subject.head.x;
        let cy = subject.head.y;
        const dir = subject.direction;

        while (true) {
            switch (dir) {
                case Direction.UP: cy--; break;
                case Direction.DOWN: cy++; break;
                case Direction.LEFT: cx--; break;
                case Direction.RIGHT: cx++; break;
            }
            if (!this.logicGrid.isValid(cx, cy)) return false; // 到墙了，自由

            const id = this.logicGrid.getWormIdAt(cx, cy);
            if (id !== -1 && id !== subject.id) {
                if (potentialBlockers.has(id)) return true; // 被挡住了
                // 不在集合里 = 已经被"移走"了，继续穿过
            }
        }
    }

    // Check if a worm at `cells` pointing in `dir` hits itself.
    private checkSelfBlock(cells: Point[], dir: Direction): boolean {
        const head = cells[0];
        let cx = head.x;
        let cy = head.y;

        while (true) {
            switch (dir) {
                case Direction.UP: cy--; break;
                case Direction.DOWN: cy++; break;
                case Direction.LEFT: cx--; break;
                case Direction.RIGHT: cx++; break;
            }

            if (!this.logicGrid.isValid(cx, cy)) break; // Wall

            // Check if (cx, cy) is in cells
            // Skip head (cells[0])? No, we moved away from head.
            if (cells.some(p => p.x === cx && p.y === cy)) return true;
        }
        return false;
    }

    // 射线检测：从 (startX,startY) 沿 dir 方向，返回挡住去路的虫子ID列表
    // skipId: 跳过指定ID（用于排除自身）
    getRaycastBlockers(startX: number, startY: number, dir: Direction, skipId: number = -1): number[] {
        let cx = startX, cy = startY;
        while (true) {
            switch (dir) {
                case Direction.UP: cy--; break;
                case Direction.DOWN: cy++; break;
                case Direction.LEFT: cx--; break;
                case Direction.RIGHT: cx++; break;
            }
            if (!this.logicGrid.isValid(cx, cy)) break;
            const id = this.logicGrid.getWormIdAt(cx, cy);
            if (id !== -1 && id !== skipId) return [id];
        }
        return [];
    }

    tryRemoveWorm(wormId: number): boolean {
        const worm = this.logicGrid.worms.get(wormId);
        if (!worm) return false;

        // 检查去路是否畅通（跳过自身body）
        const blockers = this.getRaycastBlockers(worm.head.x, worm.head.y, worm.direction, wormId);
        if (blockers.length === 0) {
            this.logicGrid.removeWorm(wormId);
            return true;
        }
        return false;
    }

    // 导出初始关卡数据（开局时的完整状态）
    exportLevel(): string {
        return this.initialLevelJson;
    }

    // 序列化当前关卡状态
    private serializeLevel(): string {
        const worms: { id: number; cells: Point[]; dir: Direction; color: number }[] = [];
        for (const w of this.logicGrid.worms.values()) {
            worms.push({ id: w.id, cells: w.cells, dir: w.direction, color: w.color });
        }
        return JSON.stringify({
            v: 1,
            w: this.gridWidth,
            h: this.gridHeight,
            worms
        });
    }

    // 从 JSON 字符串导入关卡
    importLevel(json: string): boolean {
        try {
            const data = JSON.parse(json);
            if (!data.worms || !data.w || !data.h) return false;

            this.gridWidth = data.w;
            this.gridHeight = data.h;
            this.reset();

            for (const wd of data.worms) {
                const worm = new Worm(wd.id, wd.color);
                worm.cells = wd.cells;
                worm.direction = wd.dir;
                this.logicGrid.addWorm(worm);
            }

            console.log(`[导入] 成功！网格: ${data.w}x${data.h}, 虫子: ${this.logicGrid.worms.size}`);
            this.initialLevelJson = json; // 保存导入的原始数据作为快照
            return true;
        } catch (e) {
            console.error('[导入] JSON 解析失败:', e);
            return false;
        }
    }
}
