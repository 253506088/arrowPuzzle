import { Application, Container } from 'pixi.js';
import { GameManager } from '../logic/GameManager';
import { WormView } from './WormView';

const CELL_SIZE = 25;

export class GameApp {
    app: Application;
    gameContainer: Container;
    gameManager: GameManager;
    wormViews: Map<number, WormView> = new Map();

    // 计时器状态
    private timerSeconds = 0;
    private timerInterval: ReturnType<typeof setInterval> | null = null;
    private isPaused = false;

    constructor() {
        this.app = new Application();
        this.gameContainer = new Container();
        this.gameManager = new GameManager(25, 35);
    }

    async init() {
        await this.app.init({
            background: '#000000',
            resizeTo: window
        });
        document.body.appendChild(this.app.canvas);

        this.app.stage.addChild(this.gameContainer);

        const resize = () => {
            const logicW = this.gameManager.gridWidth * CELL_SIZE;
            const logicH = this.gameManager.gridHeight * CELL_SIZE;
            const uiBarH = 40;
            const padding = 8; // 边距，防止贴边

            const availW = this.app.screen.width - padding * 2;
            const availH = this.app.screen.height - uiBarH - padding * 2;

            // 缩放以适应屏幕，不放大（最大1倍）
            const scale = Math.min(availW / logicW, availH / logicH, 1);
            this.gameContainer.scale.set(scale);

            // 居中（考虑缩放后的实际尺寸）
            this.gameContainer.x = (this.app.screen.width - logicW * scale) / 2 + CELL_SIZE * scale / 2;
            this.gameContainer.y = uiBarH + (availH - logicH * scale) / 2 + padding + CELL_SIZE * scale / 2;
        };
        window.addEventListener('resize', resize);
        resize();

        // 开始按钮
        document.getElementById('startBtn')?.addEventListener('click', () => {
            this.onStartClick();
        });

        // Debug按钮
        document.getElementById('debugBtn')?.addEventListener('click', () => {
            this.autoDebugStep();
        });

        // 暂停按钮
        document.getElementById('pauseBtn')?.addEventListener('click', () => {
            this.togglePause();
        });

        // 不自动开始，等用户点击
    }

    // 点击开始按钮
    private onStartClick() {
        const btn = document.getElementById('startBtn') as HTMLButtonElement;
        const status = document.getElementById('statusText')!;

        btn.disabled = true;
        btn.innerText = '⏳ 生成中...';
        status.innerText = '正在生成关卡，请稍候...';

        // 用 setTimeout 让 UI 先更新，再开始计算
        setTimeout(() => {
            const success = this.startLevel();

            if (success) {
                // 隐藏开始界面
                document.getElementById('startOverlay')!.style.display = 'none';
            } else {
                // 生成失败，恢复按钮
                btn.disabled = false;
                btn.innerText = '▶ 重新生成';
                status.innerText = '⚠️ 生成失败，请点击重试';
            }
        }, 50);
    }

    autoDebugStep() {
        const allViews = Array.from(this.wormViews.values());

        for (const view of allViews) {
            if (this.gameManager.tryRemoveWorm(view.worm.id)) {
                console.log(`AUTO-STEP: 成功移除虫子 ${view.worm.id}`);
                this.removeWormView(view);
                return;
            }
        }

        console.error("AUTO-STEP: 死锁！没有虫子可以移动。");
        for (const view of allViews) {
            const blockers = this.gameManager.getRaycastBlockers(
                view.worm.head.x,
                view.worm.head.y,
                view.worm.direction
            );
            console.log(`虫子 ${view.worm.id} 被挡住: [${blockers.join(', ')}]`);
        }
        alert("死锁！请查看控制台。");
    }

    removeWormView(view: WormView) {
        view.playFlyOut(() => {
            this.gameContainer.removeChild(view);
            this.wormViews.delete(view.worm.id);
            this.updateUI();

            if (this.wormViews.size === 0) {
                this.stopTimer();
                const min = Math.floor(this.timerSeconds / 60).toString().padStart(2, '0');
                const sec = (this.timerSeconds % 60).toString().padStart(2, '0');
                setTimeout(() => {
                    alert(`YOU WIN! 用时: ${min}:${sec}`);
                    // 显示开始界面，等用户点击
                    const overlay = document.getElementById('startOverlay')!;
                    overlay.style.display = 'flex';
                    const btn = document.getElementById('startBtn') as HTMLButtonElement;
                    btn.disabled = false;
                    btn.innerText = '▶ 下一关';
                    document.getElementById('statusText')!.innerText = '';
                }, 500);
            }
        });
    }

    // 返回是否成功
    startLevel(): boolean {
        // 清理
        this.gameContainer.removeChildren();
        this.wormViews.clear();

        // 生成关卡
        const success = this.gameManager.generateLevel(0.95);
        if (!success) return false;

        // 创建视图
        for (const worm of this.gameManager.logicGrid.worms.values()) {
            const view = new WormView(worm, CELL_SIZE);
            view.x = 0;
            view.y = 0;
            view.on('pointerdown', () => this.handleWormClick(view));
            this.gameContainer.addChild(view);
            this.wormViews.set(worm.id, view);
        }

        // 重置并启动计时器
        this.startTimer();
        this.updateUI();
        return true;
    }

    handleWormClick(view: WormView) {
        if (this.gameManager.tryRemoveWorm(view.worm.id)) {
            this.removeWormView(view);
        } else {
            view.playShake();
            const blockers = this.gameManager.getRaycastBlockers(
                view.worm.head.x,
                view.worm.head.y,
                view.worm.direction
            );
            console.warn(`虫子 ${view.worm.id} 被挡住:`, blockers);
        }
    }

    // === 计时器 ===

    private startTimer() {
        this.stopTimer();
        this.timerSeconds = 0;
        this.isPaused = false;
        this.updateTimerLabel();
        this.updatePauseButton();
        this.timerInterval = setInterval(() => {
            if (!this.isPaused) {
                this.timerSeconds++;
                this.updateTimerLabel();
            }
        }, 1000);
    }

    private stopTimer() {
        if (this.timerInterval !== null) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    private togglePause() {
        this.isPaused = !this.isPaused;
        this.updatePauseButton();
    }

    private updateTimerLabel() {
        const min = Math.floor(this.timerSeconds / 60).toString().padStart(2, '0');
        const sec = (this.timerSeconds % 60).toString().padStart(2, '0');
        const el = document.getElementById('timerLabel');
        if (el) el.innerText = `Time: ${min}:${sec}`;
    }

    private updatePauseButton() {
        const btn = document.getElementById('pauseBtn');
        if (btn) btn.innerText = this.isPaused ? '▶ 继续' : '⏸ 暂停';
    }

    updateUI() {
        const countEl = document.getElementById('countLabel');
        if (countEl) countEl.innerText = `Worms: ${this.wormViews.size}`;
    }
}
