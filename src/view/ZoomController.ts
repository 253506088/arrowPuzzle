import { Container } from 'pixi.js';

/**
 * 缩放控制器：处理缩放、拖动平移
 * - 鼠标滚轮 / 双指捏合缩放，以焦点为中心
 * - 放大后可拖动平移（按住不放+移动）
 * - 最小缩放 = 初始一屏比例（zoomLevel = 1.0）
 */
export class ZoomController {
    private container: Container;
    private canvas: HTMLCanvasElement;

    /** resize 时算出的"一屏"基准缩放值 */
    private fitScale = 1;
    /** resize 时的居中偏移 */
    private fitX = 0;
    private fitY = 0;

    /** 当前缩放等级，1.0 = 一屏（最小值） */
    private zoomLevel = 1.0;
    private readonly maxZoom = 5.0;
    private readonly zoomStep = 0.1;

    // 双指触摸状态
    private lastTouchDist = 0;

    // 拖动状态
    private isDragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private containerStartX = 0;
    private containerStartY = 0;
    /** 拖动判定阈值（像素） */
    private readonly dragThreshold = 5;
    private pointerDownX = 0;
    private pointerDownY = 0;
    private dragCandidate = false;

    // 事件回调引用（用于 destroy 时移除）
    private onWheel: (e: WheelEvent) => void;
    private onTouchStart: (e: TouchEvent) => void;
    private onTouchMove: (e: TouchEvent) => void;
    private onTouchEnd: (e: TouchEvent) => void;
    private onPointerDown: (e: PointerEvent) => void;
    private onPointerMove: (e: PointerEvent) => void;
    private onPointerUp: (e: PointerEvent) => void;

    constructor(container: Container, canvas: HTMLCanvasElement) {
        this.container = container;
        this.canvas = canvas;

        this.onWheel = this.handleWheel.bind(this);
        this.onTouchStart = this.handleTouchStart.bind(this);
        this.onTouchMove = this.handleTouchMove.bind(this);
        this.onTouchEnd = this.handleTouchEnd.bind(this);
        this.onPointerDown = this.handlePointerDown.bind(this);
        this.onPointerMove = this.handlePointerMove.bind(this);
        this.onPointerUp = this.handlePointerUp.bind(this);

        this.bindEvents();
    }

    /** resize 时调用，更新基准缩放和居中位置 */
    setFitTransform(fitScale: number, fitX: number, fitY: number) {
        this.fitScale = fitScale;
        this.fitX = fitX;
        this.fitY = fitY;
        // 重置缩放等级，回到一屏
        this.zoomLevel = 1.0;
        this.applyTransform();
    }

    /** 重置缩放到一屏并居中 */
    resetZoom() {
        this.zoomLevel = 1.0;
        this.applyTransform();
    }

    private bindEvents() {
        // passive: false 用于阻止默认滚动/缩放行为
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
        this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this.onTouchEnd);
        // 拖动平移
        this.canvas.addEventListener('pointerdown', this.onPointerDown);
        this.canvas.addEventListener('pointermove', this.onPointerMove);
        this.canvas.addEventListener('pointerup', this.onPointerUp);
        this.canvas.addEventListener('pointerleave', this.onPointerUp);
    }

    destroy() {
        this.canvas.removeEventListener('wheel', this.onWheel);
        this.canvas.removeEventListener('touchstart', this.onTouchStart);
        this.canvas.removeEventListener('touchmove', this.onTouchMove);
        this.canvas.removeEventListener('touchend', this.onTouchEnd);
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('pointerleave', this.onPointerUp);
    }

    // ========== 鼠标滚轮缩放 ==========

    private handleWheel(e: WheelEvent) {
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? -this.zoomStep : this.zoomStep;
        const newZoom = Math.max(1.0, Math.min(this.maxZoom, this.zoomLevel + delta));

        if (newZoom === this.zoomLevel) return;

        this.zoomAt(mouseX, mouseY, newZoom);
    }

    // ========== 双指触摸缩放 ==========

    private handleTouchStart(e: TouchEvent) {
        if (e.touches.length === 2) {
            e.preventDefault();
            // 双指开始时取消单指拖动
            this.dragCandidate = false;
            this.isDragging = false;
            const [t0, t1] = [e.touches[0], e.touches[1]];
            this.lastTouchDist = this.touchDist(t0, t1);
        }
    }

    private handleTouchMove(e: TouchEvent) {
        if (e.touches.length !== 2) return;
        e.preventDefault();

        const [t0, t1] = [e.touches[0], e.touches[1]];
        const dist = this.touchDist(t0, t1);
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;

        if (this.lastTouchDist > 0) {
            const rect = this.canvas.getBoundingClientRect();
            const focalX = midX - rect.left;
            const focalY = midY - rect.top;

            // 根据双指间距变化计算缩放比例
            const ratio = dist / this.lastTouchDist;
            const newZoom = Math.max(1.0, Math.min(this.maxZoom, this.zoomLevel * ratio));

            this.zoomAt(focalX, focalY, newZoom);
        }

        this.lastTouchDist = dist;
    }

    private handleTouchEnd(e: TouchEvent) {
        if (e.touches.length < 2) {
            this.lastTouchDist = 0;
        }
    }

    // ========== 拖动平移 ==========

    private handlePointerDown(e: PointerEvent) {
        // 只处理单指/鼠标左键（button === 0）
        if (e.button !== 0) return;
        // 未放大时不需要拖动
        if (this.zoomLevel <= 1.0) return;

        this.pointerDownX = e.clientX;
        this.pointerDownY = e.clientY;
        this.dragCandidate = true;
        this.isDragging = false;
    }

    private handlePointerMove(e: PointerEvent) {
        if (!this.dragCandidate) return;

        const dx = e.clientX - this.pointerDownX;
        const dy = e.clientY - this.pointerDownY;

        if (!this.isDragging) {
            // 移动超过阈值才开始拖动
            if (Math.abs(dx) > this.dragThreshold || Math.abs(dy) > this.dragThreshold) {
                this.isDragging = true;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.containerStartX = this.container.x;
                this.containerStartY = this.container.y;
                // 拖动时禁用虫子交互，避免误触
                this.container.interactiveChildren = false;
                this.canvas.style.cursor = 'grabbing';
            }
            return;
        }

        // 正在拖动：平移 container
        this.container.x = this.containerStartX + (e.clientX - this.dragStartX);
        this.container.y = this.containerStartY + (e.clientY - this.dragStartY);
    }

    private handlePointerUp(_e: PointerEvent) {
        if (this.isDragging) {
            // 拖动结束，恢复虫子交互
            this.container.interactiveChildren = true;
            this.canvas.style.cursor = '';
        }
        this.dragCandidate = false;
        this.isDragging = false;
    }

    // ========== 核心缩放逻辑 ==========

    /**
     * 以 (focalX, focalY) 为中心缩放到 newZoom
     * 坐标是相对于 canvas 的像素坐标
     */
    private zoomAt(focalX: number, focalY: number, newZoom: number) {
        const oldScale = this.fitScale * this.zoomLevel;
        const newScale = this.fitScale * newZoom;

        // 缩放前，焦点指向的"世界坐标"
        const worldX = (focalX - this.container.x) / oldScale;
        const worldY = (focalY - this.container.y) / oldScale;

        this.zoomLevel = newZoom;

        // 缩放后，让同一个世界坐标仍在焦点位置
        this.container.scale.set(newScale);
        this.container.x = focalX - worldX * newScale;
        this.container.y = focalY - worldY * newScale;
    }

    /** 不带焦点的变换应用（resize / 重置时用） */
    private applyTransform() {
        const scale = this.fitScale * this.zoomLevel;
        this.container.scale.set(scale);
        this.container.x = this.fitX;
        this.container.y = this.fitY;
    }

    // ========== 工具方法 ==========

    private touchDist(t0: Touch, t1: Touch): number {
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
