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
        const g = this.graphics;
        g.clear();

        const cs = this.cellSize;
        const thickness = cs * 0.6; // Fat worm

        // Convert grid coords to local coords
        // We will position the Container at (0,0) of the GameContainer and draw in absolute-like coords?
        // OR: Position Container at Head? No, multiple cells.
        // Best: Container is at (0,0). We draw shapes at correct offsets.
        // BUT: If the worm spans (0,0) and (1,0), we need to draw between them.

        // Let's assume the Parent Container handles the Grid centering. 
        // We just draw relative to Grid (0,0).

        // Draw Body Path
        const points = this.worm.cells.map(p => ({
            x: p.x * cs,
            y: p.y * cs
        }));

        // Draw tube
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            g.lineTo(points[i].x, points[i].y);
        }

        // Style: Neon Tube
        g.stroke({ width: thickness, color: this.worm.color, cap: 'round', join: 'round' });

        // Highlight (inner core)
        g.stroke({ width: thickness * 0.4, color: 0xFFFFFF, alpha: 0.4, cap: 'round', join: 'round' });

        // Draw Arrow Head at Head (points[0]) using Direction
        const headX = points[0].x;
        const headY = points[0].y;

        this.drawHead(g, headX, headY, this.worm.direction, thickness);
    }

    drawHead(g: Graphics, x: number, y: number, dir: Direction, size: number) {
        // Assume Up is Y-1 (Screen Up)
        let angle = 0;
        switch (dir) {
            case Direction.UP: angle = 0; break;
            case Direction.DOWN: angle = Math.PI; break;
            case Direction.LEFT: angle = -Math.PI / 2; break;
            case Direction.RIGHT: angle = Math.PI / 2; break;
        }

        const headSize = size * 1.2;

        // Draw separate head shape
        // Tip at (0, -offset) relative to center x,y rotated

        // Transform context manually? Or just coord math.
        // Simple coord math:
        // Tip offset: (0, -cs/2) logic wise?
        // Actually, head should stick OUT of the cell a bit? 
        // Or just replace the start of the tube.

        // Check local rotation
        const ctxX = (dx: number, dy: number) => x + dx * Math.cos(angle) - dy * Math.sin(angle);
        const ctxY = (dx: number, dy: number) => y + dx * Math.sin(angle) + dy * Math.cos(angle);

        // Arrow Triangle（等腰三角形：尖头更长，底边更窄，方向更明显）
        g.beginPath();
        g.moveTo(ctxX(0, -headSize * 1.5), ctxY(0, -headSize * 1.5)); // 尖端（更远）
        g.lineTo(ctxX(-headSize * 0.4, 0), ctxY(-headSize * 0.4, 0)); // 左底（更窄）
        g.lineTo(ctxX(headSize * 0.4, 0), ctxY(headSize * 0.4, 0));   // 右底（更窄）
        g.closePath();
        g.fill({ color: this.worm.color });
        g.stroke({ width: 2, color: 0x000000, alpha: 0.5 });
    }

    playShake() {
        if (this.isMoving) return;
        this.isMoving = true;

        // Shake path nodes slightly? Or just whole container?
        // Whole container is easiest.
        const tl = gsap.timeline({ onComplete: () => { this.isMoving = false; } });
        tl.to(this.graphics, { x: 5, duration: 0.05 })
            .to(this.graphics, { x: -5, duration: 0.05 })
            .to(this.graphics, { x: 5, duration: 0.05 })
            .to(this.graphics, { x: 0, duration: 0.05 });
    }

    playFlyOut(onComplete: () => void) {
        if (this.isMoving) return;
        this.isMoving = true;

        const flyDist = 1000;
        let dx = 0, dy = 0;
        switch (this.worm.direction) {
            case Direction.UP: dy = -flyDist; break;
            case Direction.DOWN: dy = flyDist; break;
            case Direction.LEFT: dx = -flyDist; break;
            case Direction.RIGHT: dx = flyDist; break;
        }

        gsap.to(this, {
            x: this.x + dx,
            y: this.y + dy,
            alpha: 0,
            duration: 0.6,
            ease: 'back.in(1.2)',
            onComplete: () => {
                this.visible = false;
                onComplete();
            }
        });
    }
}
