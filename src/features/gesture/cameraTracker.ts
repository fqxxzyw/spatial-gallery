import { GestureAnalyzer } from './gestureDetector';
import { GestureTelemetry, ProcessedHand } from './types';

export type GestureCallback = (telemetry: GestureTelemetry, hands: ProcessedHand[]) => void;

export class CameraGestureService {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private analyzer: GestureAnalyzer = new GestureAnalyzer();
  private callback: GestureCallback | null = null;
  private isRunning: boolean = false;
  private stream: MediaStream | null = null;
  private handsInstance: unknown = null;
  private cameraInstance: unknown = null;
  private lastFrameTime = performance.now();
  private fpsCounter = 0;
  private currentFps = 60;
  private animFrameId: number | null = null;

  constructor() {
    this.analyzer = new GestureAnalyzer();
  }

  public setCallback(cb: GestureCallback) {
    this.callback = cb;
  }

  public setPreviewCanvas(canvas: HTMLCanvasElement | null) {
    this.canvasElement = canvas;
    if (canvas) {
      this.canvasCtx = canvas.getContext('2d');
    } else {
      this.canvasCtx = null;
    }
  }

  /**
   * Initialize and start camera hand tracking
   */
  public async start(): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning) return { success: true };

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API (getUserMedia) not supported in this environment');
      }

      // Create internal video element for hand tracking
      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('playsinline', 'true');
        this.videoElement.style.display = 'none';
        document.body.appendChild(this.videoElement);
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      // Initialize MediaPipe Hands
      await this.initMediaPipe();

      this.isRunning = true;
      return { success: true };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('Camera initialization notice:', errMsg);

      if (this.callback) {
        this.callback(
          {
            activeGesture: 'IDLE_AUTO_PLAY',
            confidence: 0,
            handsCount: 0,
            panDelta: { x: 0, y: 0 },
            zoomDelta: 0,
            rotationDelta: 0,
            normalizedPointer: null,
            handDistanceSpread: null,
            isSwipeLeft: false,
            isSwipeRight: false,
            isSwipeUp: false,
            isSwipeDown: false,
            isThumbsUp: false,
            isVictoryLike: false,
            isPinching: false,
            isSinglePoint: false,
            isTwoFingers: false,
            isThreeFingers: false,
            isOpenPalm: false,
            isFist: false,
            isAutoPlaying: true,
            isCameraActive: false,
            cameraPermissionGranted: false,
            hasCameraError: true,
            errorMessage: errMsg.includes('Permission') ? 'Camera permission denied. Use mouse/touch controls.' : errMsg,
            fps: 0,
            statusMessage: '触控板与鼠标控制模式 (自动漫游巡航中)',
          },
          []
        );
      }

      return { success: false, error: errMsg };
    }
  }

  private async loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  private async initMediaPipe(): Promise<void> {
    // Check if Hands is available globally or via module
    let HandsClass: any = (window as any).Hands;

    if (!HandsClass) {
      try {
        const mpHands = await import('@mediapipe/hands');
        HandsClass = (mpHands as any).Hands || (mpHands as any).default?.Hands || (window as any).Hands;
      } catch {
        // Fallback to CDN script if bundler has module resolution issues
      }
    }

    if (!HandsClass) {
      // Load from CDN
      await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
      HandsClass = (window as any).Hands;
    }

    if (!HandsClass) {
      throw new Error('MediaPipe Hands library could not be loaded');
    }

    const hands = new HandsClass({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    hands.onResults((results: any) => {
      this.onHandsResults(results);
    });

    this.handsInstance = hands;

    // Use requestVideoFrameCallback or standard rAF loop to send video frames
    this.startDetectionLoop();
  }

  private startDetectionLoop() {
    let lastSendTime = 0;
    const sendInterval = 1000 / 30; // 30 FPS processing is optimal for balance of latency and CPU

    const loop = async (now: number) => {
      if (!this.isRunning || !this.videoElement || !this.handsInstance) return;

      // Calculate FPS
      this.fpsCounter++;
      if (now - this.lastFrameTime >= 1000) {
        this.currentFps = Math.round((this.fpsCounter * 1000) / (now - this.lastFrameTime));
        this.fpsCounter = 0;
        this.lastFrameTime = now;
      }

      if (now - lastSendTime >= sendInterval && this.videoElement.readyState >= 2) {
        lastSendTime = now;
        try {
          await (this.handsInstance as any).send({ image: this.videoElement });
        } catch {
          // Frame skip safe
        }
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private onHandsResults(results: any) {
    const rawHands = results.multiHandLandmarks;
    const handedness = results.multiHandedness;

    const { hands, telemetry } = this.analyzer.processRawHands(rawHands, handedness);
    telemetry.fps = this.currentFps;
    telemetry.isCameraActive = this.isRunning;

    // Render skeleton to mini HUD preview canvas if active
    if (this.canvasElement && this.canvasCtx) {
      this.drawMiniPreview(results, hands);
    }

    if (this.callback) {
      this.callback(telemetry, hands);
    }
  }

  private drawMiniPreview(results: any, processedHands: ProcessedHand[]) {
    if (!this.canvasCtx || !this.canvasElement || !this.videoElement) return;
    const ctx = this.canvasCtx;
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;

    // Clear with dark subtle tinted background
    ctx.fillStyle = '#141518';
    ctx.fillRect(0, 0, w, h);

    // Draw video feed with low opacity and monochrome tone
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // mirror flip
    ctx.drawImage(this.videoElement, 0, 0, w, h);
    ctx.restore();

    // Hand connections
    const HAND_CONNECTIONS = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];

    // Draw hand skeleton with elegant white/warm accents
    processedHands.forEach((hand) => {
      const isPinch = hand.isPinching;
      const strokeCol = isPinch ? '#f5f5f7' : 'rgba(255, 255, 255, 0.45)';

      ctx.save();
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1.2;

      // Draw bones
      HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
        const p1 = hand.landmarks[startIdx];
        const p2 = hand.landmarks[endIdx];
        if (!p1 || !p2) return;

        const x1 = (1 - p1.x) * w;
        const y1 = p1.y * h;
        const x2 = (1 - p2.x) * w;
        const y2 = p2.y * h;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      // Draw joints
      hand.landmarks.forEach((lm, idx) => {
        const x = (1 - lm.x) * w;
        const y = lm.y * h;
        const isTip = [4, 8, 12, 16, 20].includes(idx);
        const radius = isTip ? 2.5 : 1.8;

        ctx.fillStyle = isTip ? '#ffffff' : 'rgba(255, 255, 255, 0.65)';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Subtle pinch ring
      if (isPinch) {
        const thumb = hand.landmarks[4];
        const index = hand.landmarks[8];
        const midX = (1 - (thumb.x + index.x) / 2) * w;
        const midY = ((thumb.y + index.y) / 2) * h;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(midX, midY, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      if (this.videoElement.parentElement) {
        this.videoElement.parentElement.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }
    if (this.handsInstance) {
      try {
        (this.handsInstance as any).close();
      } catch {}
      this.handsInstance = null;
    }
  }
}

export const cameraGestureService = new CameraGestureService();
