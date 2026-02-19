import { LogicalGrid, Direction, Worm, type Point } from './Grid';

// Palette for Worms (Fluorescent colors)
const PALETTE = [
    0xFF3333, 0x33FF33, 0x3333FF, 0xFFFF33, 0xFF33FF, 0x33FFFF, 0xFFFFFF
];

export class GameManager {
    gridWidth: number;
    gridHeight: number;
    logicGrid: LogicalGrid;

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
    generateLevel(targetDensity: number = 0.95): boolean {
        const maxRetries = 100;

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
                console.log(`[生成] 成功！虫子: ${this.logicGrid.worms.size}`);
                return true;
            }

            console.log(`[生成] 第 ${retry + 1} 次方向分配失败，重新生成...`);
        }

        console.error(`[生成] 失败：${maxRetries} 次重试后仍未成功。`);
        return false;
    }

    // 拓扑方向分配：从外向内"剥洋葱"
    // 每次找一条能直达墙壁的虫子，给它分配那个方向，然后"移走"它
    // 这样后面的虫子就有了新的出路
    private assignDirectionsTopologically(): boolean {
        const remaining = new Set(this.logicGrid.worms.keys());
        const assignments: { id: number; dir: Direction }[] = [];

        while (remaining.size > 0) {
            let foundFree = false;

            for (const id of remaining) {
                const worm = this.logicGrid.worms.get(id)!;

                // 尝试4个方向（随机顺序避免偏好）
                const dirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
                dirs.sort(() => Math.random() - 0.5);

                for (const dir of dirs) {
                    // 不能撞自己
                    if (this.checkSelfBlock(worm.cells, dir)) continue;

                    // 检查这个方向是否能直达墙壁（不被remaining里的虫子挡住）
                    worm.direction = dir;
                    if (!this.isBlockedBySet(worm, remaining)) {
                        // 找到了！这条虫子在这个方向是自由的
                        assignments.push({ id, dir });
                        remaining.delete(id);
                        foundFree = true;
                        break;
                    }
                }

                if (foundFree) break; // 状态变了，重新扫描
            }

            if (!foundFree) {
                // 剩余虫子全部被卡住，无法继续
                console.warn(`[方向分配] 失败：剩余 ${remaining.size} 只虫子无出路`);
                return false;
            }
        }

        // 全部分配成功，应用方向
        for (const { id, dir } of assignments) {
            this.logicGrid.worms.get(id)!.direction = dir;
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
    getRaycastBlockers(startX: number, startY: number, dir: Direction): number[] {
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
            if (id !== -1) return [id];
        }
        return [];
    }

    tryRemoveWorm(wormId: number): boolean {
        const worm = this.logicGrid.worms.get(wormId);
        if (!worm) return false;

        // Check clear path
        const blockers = this.getRaycastBlockers(worm.head.x, worm.head.y, worm.direction);
        if (blockers.length === 0) {
            this.logicGrid.removeWorm(wormId);
            return true;
        }
        return false;
    }
}
