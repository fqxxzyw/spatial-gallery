export type HandGestureType =
  | 'IDLE_AUTO_PLAY'          // 无手势：自动循环巡航播放
  | 'SINGLE_POINT_FOCUS'      // 单指指向：光标选择悬停，照片发出轮廓光
  | 'PINCH_CONFIRM_ZOOM'      // 食指与拇指捏合：确定放大当前聚焦的图片
  | 'TWO_FINGER_PAN'          // 双指平移：拖拽平移整个照片墙
  | 'THREE_FINGER_SWIPE_MODE' // 三指滑动：切换显示模式 / 空间形态连续变形
  | 'OPEN_PALM_ZOOM_IN'       // 张开手掌：推进视角放大整个三维相册
  | 'FIST_ZOOM_OUT'           // 握紧拳头：拉远视角缩小整个三维相册
  | 'THUMBS_UP_LIKE'          // 大拇指点赞：收藏当前照片并泛起心动粒子
  | 'TWO_HAND_ZOOM'           // 双手张开/合拢缩放
  | 'TWO_HAND_SPREAD_MORPH';  // 双手开合形态变形

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface ProcessedHand {
  handedness: 'Left' | 'Right';
  landmarks: HandLandmark[];
  pinchDistance: number;
  isPinching: boolean;
  palmCenter: { x: number; y: number; z: number };
  isSinglePoint: boolean;
  isTwoFingers: boolean;
  isThreeFingers: boolean;
  isOpenPalm: boolean;
  isFist: boolean;
  isThumbsUp: boolean;
  isVictory: boolean;
  velocityX: number;
  velocityY: number;
}

export interface GestureTelemetry {
  activeGesture: HandGestureType;
  confidence: number;
  handsCount: number;
  panDelta: { x: number; y: number };
  zoomDelta: number;
  rotationDelta: number;
  normalizedPointer: { x: number; y: number } | null;
  handDistanceSpread: number | null;
  isSwipeLeft: boolean;
  isSwipeRight: boolean;
  isSwipeUp: boolean;
  isSwipeDown: boolean;
  isThumbsUp: boolean;
  isVictoryLike: boolean;
  isPinching: boolean;
  isSinglePoint: boolean;
  isTwoFingers: boolean;
  isThreeFingers: boolean;
  isOpenPalm: boolean;
  isFist: boolean;
  isAutoPlaying: boolean;
  isCameraActive: boolean;
  cameraPermissionGranted: boolean;
  hasCameraError: boolean;
  errorMessage: string | null;
  fps: number;
  statusMessage: string;
}
