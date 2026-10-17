import React, { useEffect, useRef, useState } from 'react';
import { PhotoWallScene, SpatialMorphState } from './features/scene/photoWallScene';
import { cameraGestureService } from './features/gesture/cameraTracker';
import { GestureTelemetry, ProcessedHand } from './features/gesture/types';
import {
  PhotoItem,
  searchPhotos,
  processUploadedFiles,
} from './services/photoSearchService';
import { VisionTopBar } from './components/Navigation/VisionTopBar';
import { SearchOverlay } from './components/Search/SearchOverlay';
import { PhotoInspectionCard } from './components/Detail/PhotoInspectionCard';
import { MorphControlBar } from './components/Controls/MorphControlBar';
import { MiniHandViewport } from './components/Vision/MiniHandViewport';
import { SpatialGestureGuide } from './components/Guide/SpatialGestureGuide';
import { spatialAudio } from './utils/audio';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<PhotoWallScene | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Gallery & Search State - Defaults to Yukinoshita Yukino (雪之下雪乃)
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [currentCategory, setCurrentCategory] = useState<string>('雪之下雪乃');
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [currentMorphFactor, setCurrentMorphFactor] = useState<number>(1.0); // 1.0 = Cylinder Arc
  const [morphStateName, setMorphStateName] = useState<SpatialMorphState>('CYLINDER');
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // UI Overlays
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isMiniCameraOpen, setIsMiniCameraOpen] = useState(false);
  const [isCameraRunning, setIsCameraRunning] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Gesture Telemetry State
  const [telemetry, setTelemetry] = useState<GestureTelemetry>({
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
    hasCameraError: false,
    errorMessage: null,
    fps: 60,
    statusMessage: '空间漫游巡航中 (无手势自动循环播放)',
  });

  // 1. Initialize Three.js Scene and Fetch Initial Photos from Live Search Engine
  useEffect(() => {
    if (!canvasMountRef.current) return;

    const scene = new PhotoWallScene(canvasMountRef.current);
    sceneRef.current = scene;
    scene.setMorphFactor(1.0); // Default to visionOS Cylinder Arc

    scene.setOnSelectCallback((photo) => {
      setSelectedPhoto(photo);
    });

    scene.setOnMorphProgressCallback((factor, stateName) => {
      setCurrentMorphFactor(factor);
      setMorphStateName(stateName);
    });

    // Fetch initial collection live from real search engine (雪之下雪乃)
    (async () => {
      setIsSearching(true);
      const livePhotos = await searchPhotos('雪之下雪乃');
      setPhotos(livePhotos);
      scene.setPhotos(livePhotos);
      setIsSearching(false);
    })();

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // 2. Connect Camera Gesture Service
  useEffect(() => {
    cameraGestureService.setCallback((newTelemetry: GestureTelemetry, hands: ProcessedHand[]) => {
      setTelemetry(newTelemetry);

      if (sceneRef.current) {
        sceneRef.current.applyGesture(
          newTelemetry.panDelta,
          newTelemetry.zoomDelta,
          newTelemetry.rotationDelta,
          newTelemetry.normalizedPointer,
          newTelemetry.isPinching,
          newTelemetry.isSwipeLeft,
          newTelemetry.isSwipeRight,
          newTelemetry.isSwipeUp,
          newTelemetry.isSwipeDown,
          newTelemetry.isFist,
          newTelemetry.isThumbsUp,
          newTelemetry.isVictoryLike,
          newTelemetry.handDistanceSpread
        );
      }
    });

    // Automatically initialize camera tracking if supported
    handleStartCamera();

    return () => {
      cameraGestureService.stop();
    };
  }, []);

  const handleStartCamera = async () => {
    const res = await cameraGestureService.start();
    if (res.success) {
      setIsCameraRunning(true);
    } else {
      setIsCameraRunning(false);
    }
  };

  const handleToggleCamera = () => {
    if (isCameraRunning) {
      cameraGestureService.stop();
      setIsCameraRunning(false);
      setTelemetry((prev) => ({
        ...prev,
        isCameraActive: false,
        statusMessage: '触控板与鼠标控制模式',
      }));
    } else {
      handleStartCamera();
    }
  };

  const handleSelectCategory = async (catId: string) => {
    setCurrentCategory(catId);
    setIsSearching(true);
    const newPhotos = await searchPhotos(catId);
    setPhotos(newPhotos);
    if (sceneRef.current) {
      sceneRef.current.setPhotos(newPhotos);
    }
    setIsSearching(false);
  };

  const handleSearch = async (keyword: string) => {
    setCurrentCategory(keyword);
    setIsSearching(true);
    const newPhotos = await searchPhotos(keyword);
    setPhotos(newPhotos);
    if (sceneRef.current) {
      sceneRef.current.setPhotos(newPhotos);
    }
    setIsSearching(false);
  };

  const handleFilesSelected = async (files: FileList) => {
    const newUploaded = await processUploadedFiles(files);
    if (newUploaded.length > 0) {
      const merged = [...newUploaded, ...photos];
      setPhotos(merged);
      if (sceneRef.current) {
        sceneRef.current.setPhotos(merged);
      }
    }
  };

  const handleSetMorphFactor = (factor: number) => {
    setCurrentMorphFactor(factor);
    if (sceneRef.current) {
      sceneRef.current.setMorphFactor(factor);
    }
  };

  const handlePrevMorph = () => {
    if (sceneRef.current) {
      sceneRef.current.cyclePrevMorph();
    }
  };

  const handleNextMorph = () => {
    if (sceneRef.current) {
      sceneRef.current.cycleNextMorph();
    }
  };

  const handleResetView = () => {
    if (sceneRef.current) {
      sceneRef.current.resetView();
    }
    setSelectedPhoto(null);
  };

  const handleToggleMute = () => {
    const muted = spatialAudio.toggleMute();
    setIsMuted(muted);
  };

  // Helper to determine the gesture status HUD display
  const getGestureIndicator = () => {
    if (telemetry.isAutoPlaying) {
      return {
        icon: '🔄',
        text: '自动巡航播放中 · 出现手势即刻暂停',
        color: 'border-white/10 bg-black/40',
        badge: 'bg-emerald-400',
      };
    }
    if (telemetry.isPinching) {
      return {
        icon: '🤏',
        text: '食指拇指捏合：确定放大当前照片',
        color: 'border-white/40 bg-white/15',
        badge: 'bg-amber-400',
      };
    }
    if (telemetry.isSinglePoint) {
      return {
        icon: '☝️',
        text: '单指指向：悬停聚焦，照片激发轮廓光',
        color: 'border-white/30 bg-white/10',
        badge: 'bg-sky-400',
      };
    }
    if (telemetry.isTwoFingers) {
      return {
        icon: '✌️',
        text: '双指平移：拖拽滑动整个照片墙',
        color: 'border-white/20 bg-white/10',
        badge: 'bg-indigo-400',
      };
    }
    if (telemetry.isThreeFingers) {
      return {
        icon: '3️⃣',
        text: '三指滑动：切换显示模式 (环形/球幕/矩阵/螺旋/波浪)',
        color: 'border-white/30 bg-white/15',
        badge: 'bg-purple-400',
      };
    }
    if (telemetry.isOpenPalm) {
      return {
        icon: '🖐️',
        text: '张开手掌：视角推近放大',
        color: 'border-white/20 bg-white/10',
        badge: 'bg-teal-400',
      };
    }
    if (telemetry.isFist) {
      return {
        icon: '✊',
        text: '握紧拳头：视角拉远缩小',
        color: 'border-white/20 bg-white/10',
        badge: 'bg-rose-400',
      };
    }
    if (telemetry.isThumbsUp) {
      return {
        icon: '👍',
        text: '大拇指点赞：收藏当前作品',
        color: 'border-white/30 bg-white/15',
        badge: 'bg-red-400',
      };
    }

    return {
      icon: '✨',
      text: telemetry.statusMessage || '空间追踪就绪',
      color: 'border-white/10 bg-black/40',
      badge: 'bg-white/60',
    };
  };

  const indicator = getGestureIndicator();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#101113] text-[#F5F5F7] select-none">
      {/* 1. Dedicated Three.js Spatial Viewport Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* 2. Top visionOS Glass Pill Bar */}
      <VisionTopBar
        currentCategory={currentCategory}
        onSelectCategory={handleSelectCategory}
        onOpenSearch={() => setIsSearchOpen(true)}
        onUploadClick={() => fileInputRef.current?.click()}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onOpenGuide={() => setIsGuideOpen(true)}
        isCameraRunning={isCameraRunning}
        onToggleCamera={handleToggleCamera}
        gestureStatusText={indicator.text}
      />

      {/* 3. Floating Vision Gesture HUD Pill at Top Center */}
      <div className="fixed top-18 left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all duration-300">
        <div
          className={`flex items-center space-x-2.5 px-4 py-2 rounded-full backdrop-blur-2xl border shadow-xl transition-all ${indicator.color}`}
        >
          <span className="text-base select-none">{indicator.icon}</span>
          <span className={`w-1.5 h-1.5 rounded-full ${indicator.badge} animate-pulse`} />
          <span className="text-xs font-medium tracking-tight text-[#F5F5F7]">
            {indicator.text}
          </span>
        </div>
      </div>

      {/* 4. Inspected Photo Hero Caption Panel */}
      <PhotoInspectionCard
        photo={selectedPhoto}
        onClose={() => {
          setSelectedPhoto(null);
          if (sceneRef.current) {
            sceneRef.current.selectPhoto(null);
          }
        }}
      />

      {/* 5. Bottom Continuous Spatial Morph Control Bar */}
      <MorphControlBar
        currentFactor={currentMorphFactor}
        onSetMorphFactor={handleSetMorphFactor}
        onPrevMorph={handlePrevMorph}
        onNextMorph={handleNextMorph}
        onResetView={handleResetView}
        isMiniCameraOpen={isMiniCameraOpen}
        onToggleMiniCamera={() => setIsMiniCameraOpen(!isMiniCameraOpen)}
        isCameraActive={isCameraRunning}
      />

      {/* 6. Minimalist Vision Optical Hand Tracker Mini Viewport */}
      <MiniHandViewport
        isOpen={isMiniCameraOpen}
        onClose={() => setIsMiniCameraOpen(false)}
        telemetry={telemetry}
      />

      {/* 7. Liquid Glass Search & Drag-Drop Modal */}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSearch={handleSearch}
        onFilesSelected={handleFilesSelected}
        isSearching={isSearching}
      />

      {/* 8. Apple Spatial Gesture Guide Modal */}
      <SpatialGestureGuide
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* Hidden File Input for Local Photo Imports */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilesSelected(e.target.files);
          }
        }}
      />
    </div>
  );
}
