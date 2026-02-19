export const Direction = {
    UP: 0,
    DOWN: 1,
    LEFT: 2,
    RIGHT: 3
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export interface Point {
    x: number;
    y: number;
}

export class Worm {
    id: number;
    // cells[0] is the HEAD.
    cells: Point[] = [];
    direction: Direction;
    color: number;

    constructor(id: number, color: number) {
        this.id = id;
        this.color = color;
        this.direction = Direction.UP;
    }

    get head(): Point {
        return this.cells[0];
    }
}

export class LogicalGrid {
    width: number;
    height: number;
    worms: Map<number, Worm> = new Map();
    // grid[y][x] = wormId
    private grid: number[][];

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.grid = Array(height).fill(null).map(() => Array(width).fill(-1));
    }

    // Add a worm to the grid
    addWorm(worm: Worm) {
        this.worms.set(worm.id, worm);
        for (const p of worm.cells) {
            this.grid[p.y][p.x] = worm.id;
        }
    }

    removeWorm(id: number) {
        const worm = this.worms.get(id);
        if (worm) {
            for (const p of worm.cells) {
                this.grid[p.y][p.x] = -1;
            }
            this.worms.delete(id);
        }
    }

    getWormIdAt(x: number, y: number): number {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return -1;
        return this.grid[y][x];
    }

    getWormAt(x: number, y: number): Worm | undefined {
        const id = this.getWormIdAt(x, y);
        if (id !== -1) return this.worms.get(id);
        return undefined;
    }

    isValid(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    isEmpty(x: number, y: number): boolean {
        return this.isValid(x, y) && this.grid[y][x] === -1;
    }
}
