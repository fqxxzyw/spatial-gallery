import React, { useEffect, useRef, useState } from 'react';
import { PhotoWallScene, SpatialMorphState } from './features/scene/photoWallScene';
import { cameraGestureService } from './features/gesture/cameraTracker';
import { GestureTelemetry, ProcessedHand } from './features/gesture/types';
import {
  PhotoItem,
  searchPhotos,
  processUploadedFiles,
  SafeSearchLevel,
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

  // Gallery & Search State - Defaults to Genshin Impact (原神)
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [currentCategory, setCurrentCategory] = useState<string>('原神');
  const [safeSearch, setSafeSearch] = useState<SafeSearchLevel>(() => {
    return (localStorage.getItem('spatial_safesearch') as SafeSearchLevel) || 'off';
  });
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [isDetailZoomed, setIsDetailZoomed] = useState<boolean>(false);
  const [currentMorphFactor, setCurrentMorphFactor] = useState<number>(1.0); // 1.0 = Cylinder Arc
  const [_morphStateName, setMorphStateName] = useState<SpatialMorphState>('CYLINDER');
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
    statusMessage: '',
  });

  // 1. Initialize Three.js Scene and Fetch Initial Photos from Search Engine
  useEffect(() => {
    if (!canvasMountRef.current) return;

    const scene = new PhotoWallScene(canvasMountRef.current);
    sceneRef.current = scene;
    scene.setMorphFactor(1.0); // Default to visionOS Cylinder Arc

    scene.setOnSelectCallback((photo) => {
      setSelectedPhoto(photo);
      if (!photo) {
        setIsDetailZoomed(false);
      }
    });

    scene.setOnDetailZoomCallback((zoomed) => {
      setIsDetailZoomed(zoomed);
    });

    scene.setOnMorphProgressCallback((factor, stateName) => {
      setCurrentMorphFactor(factor);
      setMorphStateName(stateName);
    });

    // Fetch initial collection live (原神)
    (async () => {
      setIsSearching(true);
      const initialSafe =
        (localStorage.getItem('spatial_safesearch') as SafeSearchLevel) || 'off';
      const livePhotos = await searchPhotos('原神', initialSafe);
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
    cameraGestureService.setCallback((newTelemetry: GestureTelemetry, _hands: ProcessedHand[]) => {
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
    setIsCameraRunning(res.success);
  };

  const handleToggleCamera = () => {
    if (isCameraRunning) {
      cameraGestureService.stop();
      setIsCameraRunning(false);
    } else {
      handleStartCamera();
    }
  };

  const handleSafeSearchChange = (level: SafeSearchLevel) => {
    setSafeSearch(level);
    localStorage.setItem('spatial_safesearch', level);
  };

  const handleSelectCategory = async (catId: string) => {
    setCurrentCategory(catId);
    if (selectedPhoto) {
      setSelectedPhoto(null);
      sceneRef.current?.selectPhoto(null);
    }
    setIsSearching(true);
    const newPhotos = await searchPhotos(catId, safeSearch);
    setPhotos(newPhotos);
    if (sceneRef.current) {
      sceneRef.current.setPhotos(newPhotos);
    }
    setIsSearching(false);
  };

  const handleSearch = async (keyword: string, searchLevel?: SafeSearchLevel) => {
    const effectiveSafe = searchLevel || safeSearch;
    setCurrentCategory(keyword);
    if (selectedPhoto) {
      setSelectedPhoto(null);
      sceneRef.current?.selectPhoto(null);
    }
    setIsSearching(true);
    const newPhotos = await searchPhotos(keyword, effectiveSafe);
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

  // Crucial requirement: When a photo is inspected/fullscreen, switching layout returns photo to wall first!
  const handleSetMorphFactor = (factor: number) => {
    if (selectedPhoto) {
      setSelectedPhoto(null);
      if (sceneRef.current) {
        sceneRef.current.selectPhoto(null);
      }
    }
    setCurrentMorphFactor(factor);
    if (sceneRef.current) {
      sceneRef.current.setMorphFactor(factor);
    }
  };

  const handlePrevMorph = () => {
    if (selectedPhoto) {
      setSelectedPhoto(null);
      if (sceneRef.current) {
        sceneRef.current.selectPhoto(null);
      }
    }
    if (sceneRef.current) {
      sceneRef.current.cyclePrevMorph();
    }
  };

  const handleNextMorph = () => {
    if (selectedPhoto) {
      setSelectedPhoto(null);
      if (sceneRef.current) {
        sceneRef.current.selectPhoto(null);
      }
    }
    if (sceneRef.current) {
      sceneRef.current.cycleNextMorph();
    }
  };

  const handleResetView = () => {
    if (selectedPhoto) {
      setSelectedPhoto(null);
    }
    if (sceneRef.current) {
      sceneRef.current.resetView();
    }
  };

  const handleToggleMute = () => {
    const muted = spatialAudio.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#101113] text-[#F5F5F7] select-none">
      {/* 1. Dedicated Three.js Spatial Viewport Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* 2. Top visionOS Glass Bar */}
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
        safeSearch={safeSearch}
      />

      {/* 3. Inspected Photo Hero Caption Panel (Defaults to Collapsed Minimal Pill) */}
      <PhotoInspectionCard
        photo={selectedPhoto}
        isDetailZoomed={isDetailZoomed}
        onToggleZoom={() => {
          sceneRef.current?.toggleDetailZoom();
        }}
        onClose={() => {
          setSelectedPhoto(null);
          setIsDetailZoomed(false);
          if (sceneRef.current) {
            sceneRef.current.selectPhoto(null);
          }
        }}
      />

      {/* 4. Bottom Continuous Spatial Morph Control Bar */}
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

      {/* 5. Minimal Camera Gesture Tracker Pip Viewport */}
      {isMiniCameraOpen && isCameraRunning && (
        <MiniHandViewport
          isOpen={isMiniCameraOpen}
          onClose={() => setIsMiniCameraOpen(false)}
          telemetry={telemetry}
        />
      )}

      {/* 6. Spotlight Search Modal */}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSearch={handleSearch}
        onFilesSelected={handleFilesSelected}
        isSearching={isSearching}
        safeSearch={safeSearch}
        onSafeSearchChange={handleSafeSearchChange}
      />

      {/* 7. Vision Gestures Spatial Guide Modal */}
      <SpatialGestureGuide
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* Hidden local photo file picker input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleFilesSelected(e.target.files);
          }
        }}
      />
    </div>
  );
}
