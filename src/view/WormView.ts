import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';
import { Worm, Direction } from '../logic/Grid';

export class WormView extends Container {
    worm: Worm;
    graphics: Graphics;
    cellSize: number;
    private isMoving: boolean = false;

    constructor(worm: Worm, cellSize: number) {
        super();
        this.worm = worm;
        this.cellSize = cellSize;

        this.graphics = new Graphics();
        this.addChild(this.graphics);

        this.draw();

        this.eventMode = 'static';
        this.cursor = 'pointer';
    }

    draw() {
        const cs = this.cellSize;
        const points = this.worm.cells.map(p => ({
            x: p.x * cs,
            y: p.y * cs
        }));
        this.drawWithPoints(points);
    }

    /** 根据任意坐标点数组绘制虫子（动画和静态共用） */
    private drawWithPoints(points: { x: number; y: number }[]) {
        const g = this.graphics;
        g.clear();

        const cs = this.cellSize;
        const thickness = cs * 0.6;

        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            g.lineTo(points[i].x, points[i].y);
        }

        g.stroke({ width: thickness, color: this.worm.color, cap: 'round', join: 'round' });
        g.stroke({ width: thickness * 0.4, color: 0xFFFFFF, alpha: 0.4, cap: 'round', join: 'round' });

        this.drawHead(g, points[0].x, points[0].y, this.worm.direction, thickness);
    }

    drawHead(g: Graphics, x: number, y: number, dir: Direction, size: number) {
        let angle = 0;
        switch (dir) {
            case Direction.UP: angle = 0; break;
            case Direction.DOWN: angle = Math.PI; break;
            case Direction.LEFT: angle = -Math.PI / 2; break;
            case Direction.RIGHT: angle = Math.PI / 2; break;
        }

        const headSize = size * 1.2;

        const ctxX = (dx: number, dy: number) => x + dx * Math.cos(angle) - dy * Math.sin(angle);
        const ctxY = (dx: number, dy: number) => y + dx * Math.sin(angle) + dy * Math.cos(angle);

        // 箭头三角形
        g.beginPath();
        g.moveTo(ctxX(0, -headSize * 1.5), ctxY(0, -headSize * 1.5));
        g.lineTo(ctxX(-headSize * 0.4, 0), ctxY(-headSize * 0.4, 0));
        g.lineTo(ctxX(headSize * 0.4, 0), ctxY(headSize * 0.4, 0));
        g.closePath();
        g.fill({ color: this.worm.color });
        g.stroke({ width: 2, color: 0x000000, alpha: 0.5 });
    }

    playShake() {
        if (this.isMoving) return;
        this.isMoving = true;

        const tl = gsap.timeline({ onComplete: () => { this.isMoving = false; } });
        tl.to(this.graphics, { x: 5, duration: 0.05 })
            .to(this.graphics, { x: -5, duration: 0.05 })
            .to(this.graphics, { x: 5, duration: 0.05 })
            .to(this.graphics, { x: 0, duration: 0.05 });
    }

    /** 蛇形爬出动效：虫子沿自身身体路径滑出，尾巴经过每一个弯道 */
    playFlyOut(onComplete: () => void) {
        if (this.isMoving) return;
        this.isMoving = true;

        const cs = this.cellSize;
        const cells = this.worm.cells; // cells[0] = 头
        const n = cells.length;

        // 方向向量
        let dirX = 0, dirY = 0;
        switch (this.worm.direction) {
            case Direction.UP: dirY = -1; break;
            case Direction.DOWN: dirY = 1; break;
            case Direction.LEFT: dirX = -1; break;
            case Direction.RIGHT: dirX = 1; break;
        }

        // 构建轨道：尾→头→延伸到画面外
        // rail[0] = 尾巴位置，rail[n-1] = 头部位置，rail[n..] = 延伸
        const rail: { x: number; y: number }[] = [];
        for (let i = n - 1; i >= 0; i--) {
            rail.push({ x: cells[i].x * cs, y: cells[i].y * cs });
        }
        const exitSteps = 40; // 延伸足够远
        const headPos = rail[n - 1];
        for (let k = 1; k <= exitSteps; k++) {
            rail.push({
                x: headPos.x + dirX * cs * k,
                y: headPos.y + dirY * cs * k
            });
        }

        // 每个 cell[i] 在 rail 上的初始位置 = n - 1 - i
        // 所有 cell 需要前进的总距离 = n - 1 + exitSteps（让尾巴也完全滑出）
        const totalAdvance = n - 1 + exitSteps;
        const progress = { value: 0 };
        const duration = Math.min(1.5, 0.4 + n * 0.06);

        const tl = gsap.timeline({
            onUpdate: () => {
                const advance = progress.value * totalAdvance;
                const points: { x: number; y: number }[] = [];

                for (let i = 0; i < n; i++) {
                    const railPos = (n - 1 - i) + advance;
                    // 在 rail 上插值
                    const idx = Math.min(railPos, rail.length - 1);
                    const floor = Math.floor(idx);
                    const frac = idx - floor;

                    if (floor >= rail.length - 1) {
                        points.push({ ...rail[rail.length - 1] });
                    } else {
                        points.push({
                            x: rail[floor].x + (rail[floor + 1].x - rail[floor].x) * frac,
                            y: rail[floor].y + (rail[floor + 1].y - rail[floor].y) * frac
                        });
                    }
                }

                this.drawWithPoints(points);
            },
            onComplete: () => {
                this.visible = false;
                onComplete();
            }
        });

        tl.to(progress, {
            value: 1,
            duration: duration,
            ease: 'power1.in'
        }, 0);

        // 后半段淡出
        tl.to(this, {
            alpha: 0,
            duration: duration * 0.4
        }, duration * 0.6);
    }
}
