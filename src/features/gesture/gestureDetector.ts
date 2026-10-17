import { HandGestureType, HandLandmark, ProcessedHand, GestureTelemetry } from './types';

export function calcDistance(p1: HandLandmark, p2: HandLandmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function calcDist2D(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Checks if a specific finger is extended away from palm
 */
function isFingerExtended(tip: HandLandmark, pip: HandLandmark, mcp: HandLandmark, wrist: HandLandmark): boolean {
  const distTipWrist = calcDistance(tip, wrist);
  const distPipWrist = calcDistance(pip, wrist);
  const distTipMcp = calcDistance(tip, mcp);
  const distPipMcp = calcDistance(pip, mcp);
  return distTipWrist > distPipWrist && distTipMcp > distPipMcp;
}

export class GestureAnalyzer {
  private smoothedLandmarks: Map<number, HandLandmark[]> = new Map();
  private smoothingAlpha = 0.65; // High responsiveness with jitter suppression
  private prevHandPos: { x: number; y: number; time: number } | null = null;
  private prevTwoHandDist: number | null = null;
  private prevTwoHandAngle: number | null = null;

  // Dwell filter for pinch confirmation
  private pinchHoldFrames = 0;
  private pinchTriggerThreshold = 3;

  // Swipe gesture cooldown
  private lastSwipeTime = 0;
  private swipeCooldown = 650; // ms between layout morph switches

  public processRawHands(
    multiHandLandmarks: HandLandmark[][] | undefined,
    multiHandedness: Array<{ label: 'Left' | 'Right' }> | undefined
  ): { hands: ProcessedHand[]; telemetry: GestureTelemetry } {
    const rawHandsCount = multiHandLandmarks?.length || 0;
    const now = performance.now();

    // 1. When NO hand is detected: trigger cinematic auto-play loop!
    if (!multiHandLandmarks || rawHandsCount === 0) {
      this.smoothedLandmarks.clear();
      this.prevHandPos = null;
      this.prevTwoHandDist = null;
      this.prevTwoHandAngle = null;
      this.pinchHoldFrames = 0;

      return {
        hands: [],
        telemetry: {
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
          isAutoPlaying: true, // Auto loop when hands absent
          isCameraActive: true,
          cameraPermissionGranted: true,
          hasCameraError: false,
          errorMessage: null,
          fps: 60,
          statusMessage: '空间漫游巡航中 (无手势自动循环播放)',
        },
      };
    }

    // 2. Process landmarks with temporal exponential filter
    const processedHands: ProcessedHand[] = multiHandLandmarks.map((rawLms, handIdx) => {
      let smoothed = this.smoothedLandmarks.get(handIdx);
      if (!smoothed || smoothed.length !== rawLms.length) {
        smoothed = rawLms.map((lm) => ({ ...lm }));
      } else {
        smoothed = rawLms.map((lm, i) => ({
          x: smoothed![i].x * (1 - this.smoothingAlpha) + lm.x * this.smoothingAlpha,
          y: smoothed![i].y * (1 - this.smoothingAlpha) + lm.y * this.smoothingAlpha,
          z: (smoothed![i].z || 0) * (1 - this.smoothingAlpha) + (lm.z || 0) * this.smoothingAlpha,
        }));
      }
      this.smoothedLandmarks.set(handIdx, smoothed);

      const wrist = smoothed[0];
      const thumbTip = smoothed[4];
      const thumbIp = smoothed[3];
      const thumbMcp = smoothed[2];

      const indexTip = smoothed[8];
      const indexPip = smoothed[6];
      const indexMcp = smoothed[5];

      const middleTip = smoothed[12];
      const middlePip = smoothed[10];
      const middleMcp = smoothed[9];

      const ringTip = smoothed[16];
      const ringPip = smoothed[14];
      const ringMcp = smoothed[13];

      const pinkyTip = smoothed[20];
      const pinkyPip = smoothed[18];
      const pinkyMcp = smoothed[17];

      // Pinch detection (Index tip to Thumb tip distance)
      const pinchDist = calcDistance(thumbTip, indexTip);
      const isPinching = pinchDist < 0.082;

      // Individual finger extension detection
      const indexOpen = isFingerExtended(indexTip, indexPip, indexMcp, wrist);
      const middleOpen = isFingerExtended(middleTip, middlePip, middleMcp, wrist);
      const ringOpen = isFingerExtended(ringTip, ringPip, ringMcp, wrist);
      const pinkyOpen = isFingerExtended(pinkyTip, pinkyPip, pinkyMcp, wrist);

      const openCount = (indexOpen ? 1 : 0) + (middleOpen ? 1 : 0) + (ringOpen ? 1 : 0) + (pinkyOpen ? 1 : 0);

      // Single Point (Index pointing alone)
      const isSinglePoint = indexOpen && !middleOpen && !ringOpen && !pinkyOpen && !isPinching;

      // Two Fingers (Index + Middle extended)
      const isTwoFingers = indexOpen && middleOpen && !ringOpen && !pinkyOpen && !isPinching;

      // Three Fingers (Index + Middle + Ring extended)
      const isThreeFingers = indexOpen && middleOpen && ringOpen && !pinkyOpen && !isPinching;

      // Open Palm (4 or 5 fingers extended wide)
      const isOpenPalm = openCount >= 4 && !isPinching;

      // Closed Fist (All fingers curled, not pinching)
      const isFist = openCount === 0 && !isPinching;

      // Thumbs Up (Thumb up, 4 fingers curled)
      const isThumbUpward = thumbTip.y < thumbIp.y && thumbIp.y < thumbMcp.y;
      const isThumbsUp = isThumbUpward && openCount === 0;

      // Victory
      const isVictory = isTwoFingers;

      const palmCenter = {
        x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
        y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3,
        z: ((wrist.z || 0) + (indexMcp.z || 0) + (pinkyMcp.z || 0)) / 3,
      };

      const handedness = multiHandedness?.[handIdx]?.label || (handIdx === 0 ? 'Right' : 'Left');

      return {
        handedness,
        landmarks: smoothed,
        pinchDistance: pinchDist,
        isPinching,
        palmCenter,
        isSinglePoint,
        isTwoFingers,
        isThreeFingers,
        isOpenPalm,
        isFist,
        isThumbsUp,
        isVictory,
        velocityX: 0,
        velocityY: 0,
      };
    });

    let activeGesture: HandGestureType = 'IDLE_AUTO_PLAY';
    let statusMessage = '手势已捕捉 (自动播放暂停)';
    let panDelta = { x: 0, y: 0 };
    let zoomDelta = 0;
    let rotationDelta = 0;
    let isSwipeLeft = false;
    let isSwipeRight = false;
    let isSwipeUp = false;
    let isSwipeDown = false;
    let isThumbsUp = false;
    let isVictoryLike = false;
    let isPinching = false;
    let isSinglePoint = false;
    let isTwoFingers = false;
    let isThreeFingers = false;
    let isOpenPalm = false;
    let isFist = false;
    let handDistanceSpread: number | null = null;
    let normalizedPointer: { x: number; y: number } | null = null;

    if (processedHands.length >= 2) {
      // TWO HANDS INTERACTIONS
      const h1 = processedHands[0];
      const h2 = processedHands[1];
      const currentDist = calcDist2D(h1.palmCenter, h2.palmCenter);
      handDistanceSpread = currentDist;

      const currentAngle = Math.atan2(h2.palmCenter.y - h1.palmCenter.y, h2.palmCenter.x - h1.palmCenter.x);

      if (this.prevTwoHandDist !== null && this.prevTwoHandAngle !== null) {
        const distDiff = currentDist - this.prevTwoHandDist;
        const angleDiff = currentAngle - this.prevTwoHandAngle;

        if (Math.abs(distDiff) > 0.007) {
          activeGesture = 'TWO_HAND_ZOOM';
          zoomDelta = distDiff * 28;
          statusMessage = zoomDelta > 0 ? '双手推拉：视角放大' : '双手推拉：视角缩小';
        } else if (Math.abs(angleDiff) > 0.02) {
          activeGesture = 'TWO_HAND_SPREAD_MORPH';
          rotationDelta = angleDiff * 1.6;
          statusMessage = '双手旋转照片空间';
        }
      }

      this.prevTwoHandDist = currentDist;
      this.prevTwoHandAngle = currentAngle;
      this.prevHandPos = null;

      const midX = (h1.palmCenter.x + h2.palmCenter.x) / 2;
      const midY = (h1.palmCenter.y + h2.palmCenter.y) / 2;
      normalizedPointer = {
        x: (1 - midX) * 2 - 1,
        y: -(midY * 2 - 1),
      };
    } else {
      // SINGLE HAND INTERACTIONS (Exact mapping of user specifications)
      this.prevTwoHandDist = null;
      this.prevTwoHandAngle = null;

      const hand = processedHands[0];
      const handPos = { x: hand.palmCenter.x, y: hand.palmCenter.y };

      // Pointer follows index fingertip (mirrored horizontally for intuitive webcam interaction)
      const normX = (1 - hand.landmarks[8].x) * 2 - 1;
      const normY = -(hand.landmarks[8].y * 2 - 1);
      normalizedPointer = { x: normX, y: normY };

      isSinglePoint = hand.isSinglePoint;
      isTwoFingers = hand.isTwoFingers;
      isThreeFingers = hand.isThreeFingers;
      isOpenPalm = hand.isOpenPalm;
      isFist = hand.isFist;
      isThumbsUp = hand.isThumbsUp;

      // 1. 食指和拇指啮合确定放大当前聚焦的图片 (Pinch Confirmation)
      if (hand.isPinching) {
        this.pinchHoldFrames++;
        if (this.pinchHoldFrames >= this.pinchTriggerThreshold) {
          isPinching = true;
          activeGesture = 'PINCH_CONFIRM_ZOOM';
          statusMessage = '食指拇指捏合：确定放大聚焦图片 🤏';
        }
      } else {
        this.pinchHoldFrames = 0;
      }

      // 2. 单指进行选择，选聚焦时照片发出轮廓光 (Single Pointing)
      if (!isPinching && hand.isSinglePoint) {
        activeGesture = 'SINGLE_POINT_FOCUS';
        statusMessage = '单指指向：悬停聚焦，激发照片轮廓光 ☝️';
      }

      // 3. 双指复制平移 (Two Fingers Pan)
      else if (!isPinching && hand.isTwoFingers) {
        activeGesture = 'TWO_FINGER_PAN';
        statusMessage = '双指拖拽：平移整个照片空间 ✌️';

        if (this.prevHandPos) {
          panDelta = {
            x: -(handPos.x - this.prevHandPos.x) * 16,
            y: -(handPos.y - this.prevHandPos.y) * 16,
          };
        }
      }

      // 4. 三指滑动切换显示模式 (Three Fingers Swipe Mode)
      else if (!isPinching && hand.isThreeFingers) {
        activeGesture = 'THREE_FINGER_SWIPE_MODE';
        statusMessage = '三指滑动：切换照片墙显示模式 3️⃣';

        if (this.prevHandPos && now - this.lastSwipeTime > this.swipeCooldown) {
          const dtMs = Math.max(16, now - this.prevHandPos.time);
          const vx = -(handPos.x - this.prevHandPos.x) / (dtMs / 1000);
          const vy = -(handPos.y - this.prevHandPos.y) / (dtMs / 1000);

          if (Math.abs(vx) > 1.2 || Math.abs(vy) > 1.2) {
            if (Math.abs(vx) > Math.abs(vy)) {
              if (vx > 0) {
                isSwipeRight = true;
                statusMessage = '三指右滑：切换下一空间形态 ⏩';
              } else {
                isSwipeLeft = true;
                statusMessage = '三指左滑：切换上一空间形态 ⏪';
              }
            } else {
              if (vy < 0) {
                isSwipeUp = true;
                statusMessage = '三指上滑：仰视变形 🔼';
              } else {
                isSwipeDown = true;
                statusMessage = '三指下滑：俯视变形 🔽';
              }
            }
            this.lastSwipeTime = now;
          }
        }
      }

      // 5. 张开手掌和握拳来控制整个视图的缩放 (Open Palm Zoom In & Fist Zoom Out)
      else if (!isPinching && hand.isOpenPalm) {
        activeGesture = 'OPEN_PALM_ZOOM_IN';
        zoomDelta = 0.22; // Smooth continuous push-in
        statusMessage = '张开手掌：推进视角放大视图 🖐️';
      } else if (!isPinching && hand.isFist) {
        activeGesture = 'FIST_ZOOM_OUT';
        zoomDelta = -0.22; // Smooth continuous pull-out
        statusMessage = '握紧拳头：拉远视角缩小视图 ✊';
      }

      // 6. 大拇指点赞 (Thumbs Up)
      else if (hand.isThumbsUp) {
        activeGesture = 'THUMBS_UP_LIKE';
        isThumbsUp = true;
        statusMessage = '大拇指点赞：收藏当前作品 👍';
      }

      this.prevHandPos = { x: handPos.x, y: handPos.y, time: now };
    }

    return {
      hands: processedHands,
      telemetry: {
        activeGesture,
        confidence: 0.95,
        handsCount: processedHands.length,
        panDelta,
        zoomDelta,
        rotationDelta,
        normalizedPointer,
        handDistanceSpread,
        isSwipeLeft,
        isSwipeRight,
        isSwipeUp,
        isSwipeDown,
        isThumbsUp,
        isVictoryLike,
        isPinching,
        isSinglePoint,
        isTwoFingers,
        isThreeFingers,
        isOpenPalm,
        isFist,
        isAutoPlaying: processedHands.length === 0, // Hands present -> Pause auto play!
        isCameraActive: true,
        cameraPermissionGranted: true,
        hasCameraError: false,
        errorMessage: null,
        fps: 60,
        statusMessage,
      },
    };
  }
}
