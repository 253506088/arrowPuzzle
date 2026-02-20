import { Application, Container } from 'pixi.js';
import { GameManager } from '../logic/GameManager';
import { WormView } from './WormView';
import { ZoomController } from './ZoomController';

const CELL_SIZE = 25;

export class GameApp {
    app: Application;
    gameContainer: Container;
    gameManager: GameManager;
    wormViews: Map<number, WormView> = new Map();
    private zoomController!: ZoomController;

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
            const padding = CELL_SIZE; // 留出箭头溢出空间

            const availW = this.app.screen.width - padding * 2;
            const availH = this.app.screen.height - uiBarH - padding * 2;

            // 缩放以完整适应屏幕
            const scale = Math.min(availW / logicW, availH / logicH);

            // 居中（考虑缩放后的实际尺寸）
            const cx = (this.app.screen.width - logicW * scale) / 2 + CELL_SIZE * scale / 2;
            const cy = uiBarH + (availH - logicH * scale) / 2 + padding + CELL_SIZE * scale / 2;

            // 通知缩放控制器更新基准值（它会设置 container 的 scale 和位置）
            this.zoomController.setFitTransform(scale, cx, cy);
        };
        this.zoomController = new ZoomController(this.gameContainer, this.app.canvas);
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

        // 重置视图按钮
        document.getElementById('resetViewBtn')?.addEventListener('click', () => {
            this.zoomController.resetZoom();
        });

        // 导出按钮
        document.getElementById('exportBtn')?.addEventListener('click', () => {
            this.exportLevel();
        });

        // 导入按钮
        document.getElementById('importBtn')?.addEventListener('click', () => {
            this.importLevel();
        });

        // 不自动开始，等用户点击
    }

    // 点击开始按钮
    private onStartClick() {
        const btn = document.getElementById('startBtn') as HTMLButtonElement;
        const status = document.getElementById('statusText')!;
        const minWorms = parseInt((document.getElementById('minWorms') as HTMLInputElement).value) || 0;

        btn.disabled = true;
        btn.innerText = '⏳ 生成中...';
        status.innerText = `正在生成关卡（最少 ${minWorms} 只虫子），请稍候...`;

        // 用 setTimeout 让 UI 先更新，再开始计算
        setTimeout(() => {
            const success = this.startLevel(minWorms);

            if (success) {
                document.getElementById('startOverlay')!.style.display = 'none';
            } else {
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
                view.worm.direction,
                view.worm.id
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
    startLevel(minWormCount: number = 0): boolean {
        this.gameContainer.removeChildren();
        this.wormViews.clear();

        // 根据虫子数量动态计算网格大小（保持 5:7 宽高比，最小 25×35）
        if (minWormCount > 0) {
            const estimatedCells = minWormCount * 7; // 用长度上限估算
            const gridArea = Math.ceil(estimatedCells / 0.75); // 留余量
            const h = Math.max(35, Math.ceil(Math.sqrt(gridArea * 7 / 5)));
            const w = Math.max(25, Math.ceil(gridArea / h));
            this.gameManager.gridWidth = w;
            this.gameManager.gridHeight = h;
            console.log(`[自适应] 目标 ${minWormCount} 条虫子 → 网格 ${w}×${h} = ${w * h} 格`);
        }

        const success = this.gameManager.generateLevel(0.95, minWormCount);
        if (!success) return false;

        this.buildViews();
        this.startTimer();
        this.updateUI();
        // 触发 resize 适配新网格尺寸
        window.dispatchEvent(new Event('resize'));
        return true;
    }

    // 根据当前 logicGrid 里的虫子创建视图
    private buildViews() {
        this.gameContainer.removeChildren();
        this.wormViews.clear();
        for (const worm of this.gameManager.logicGrid.worms.values()) {
            const view = new WormView(worm, CELL_SIZE);
            view.on('pointerdown', () => this.handleWormClick(view));
            this.gameContainer.addChild(view);
            this.wormViews.set(worm.id, view);
        }
    }

    // === 导出/导入 ===

    private exportLevel() {
        const json = this.gameManager.exportLevel();
        // 复制到剪贴板
        navigator.clipboard.writeText(json).then(() => {
            console.log('[导出] 已复制到剪贴板');
        }).catch(() => {
            console.log('[导出] 剪贴板失败，尝试文件下载');
        });
        // 同时下载文件
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `arrow-puzzle-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    private importLevel() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const json = reader.result as string;
                if (this.gameManager.importLevel(json)) {
                    this.buildViews();
                    this.startTimer();
                    this.updateUI();
                    document.getElementById('startOverlay')!.style.display = 'none';
                    // 触发 resize 以适配可能不同的网格尺寸
                    window.dispatchEvent(new Event('resize'));
                } else {
                    document.getElementById('statusText')!.innerText = '⚠️ 导入失败，文件格式不正确';
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    handleWormClick(view: WormView) {
        if (this.gameManager.tryRemoveWorm(view.worm.id)) {
            this.removeWormView(view);
        } else {
            view.playShake();
            const blockers = this.gameManager.getRaycastBlockers(
                view.worm.head.x,
                view.worm.head.y,
                view.worm.direction,
                view.worm.id
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
