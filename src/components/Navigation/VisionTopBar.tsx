import React, { useState } from 'react';
import { Search, Upload, Volume2, VolumeX, HelpCircle, Video, VideoOff } from 'lucide-react';
import { CURATED_CATEGORIES } from '../../services/photoSearchService';
import { spatialAudio } from '../../utils/audio';

interface VisionTopBarProps {
  currentCategory: string;
  onSelectCategory: (catId: string) => void;
  onOpenSearch: () => void;
  onUploadClick: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenGuide: () => void;
  isCameraRunning: boolean;
  onToggleCamera: () => void;
  gestureStatusText: string;
}

export const VisionTopBar: React.FC<VisionTopBarProps> = ({
  currentCategory,
  onSelectCategory,
  onOpenSearch,
  onUploadClick,
  isMuted,
  onToggleMute,
  onOpenGuide,
  isCameraRunning,
  onToggleCamera,
  gestureStatusText,
}) => {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  const activeCategoryLabel =
    CURATED_CATEGORIES.find((c) => c.id === currentCategory)?.label || 'All Photos';

  return (
    <header className="fixed top-5 left-0 right-0 z-30 pointer-events-none flex items-center justify-between px-6 select-none">
      {/* Left: Spatial Gallery Pill */}
      <div className="pointer-events-auto flex items-center space-x-2.5 liquid-glass px-4 py-2 rounded-full">
        <div className="w-2 h-2 rounded-full bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
        <span className="text-[13px] font-medium tracking-tight text-[#F5F5F7]">
          Spatial Gallery
        </span>
        <span className="text-white/20 text-xs">•</span>

        {/* Album Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              spatialAudio.playTactileTick();
              setShowCategoryMenu(!showCategoryMenu);
            }}
            className="text-[13px] text-[#86868B] hover:text-[#F5F5F7] transition-colors flex items-center space-x-1"
          >
            <span>{activeCategoryLabel}</span>
          </button>

          {showCategoryMenu && (
            <div className="absolute top-8 left-0 w-48 liquid-glass rounded-2xl p-1.5 shadow-2xl z-50">
              {CURATED_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    spatialAudio.playTactileTick();
                    onSelectCategory(cat.id);
                    setShowCategoryMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded-xl transition-colors ${
                    currentCategory === cat.id
                      ? 'bg-white/15 text-white font-medium'
                      : 'text-[#86868B] hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: Subtle Gesture State Status */}
      <div className="pointer-events-auto hidden md:flex items-center space-x-2 liquid-glass-subtle px-3.5 py-1.5 rounded-full text-xs text-[#86868B]">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
        <span className="text-[#F5F5F7] font-medium tracking-normal text-[12px]">
          {gestureStatusText}
        </span>
      </div>

      {/* Right: Search, Upload & Utility Actions */}
      <div className="pointer-events-auto flex items-center space-x-2">
        {/* Search button */}
        <button
          onClick={() => {
            spatialAudio.playTactileTick();
            onOpenSearch();
          }}
          className="liquid-glass p-2.5 rounded-full hover:bg-white/10 text-[#86868B] hover:text-white transition-all shadow-lg active:scale-95"
          title="Search Photographs"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Local Photo Upload button */}
        <button
          onClick={() => {
            spatialAudio.playTactileTick();
            onUploadClick();
          }}
          className="liquid-glass p-2.5 rounded-full hover:bg-white/10 text-[#86868B] hover:text-white transition-all shadow-lg active:scale-95"
          title="Import Local Photos"
        >
          <Upload className="w-4 h-4" />
        </button>

        {/* Camera Tracker Toggle */}
        <button
          onClick={() => {
            spatialAudio.playTactileTick();
            onToggleCamera();
          }}
          className={`liquid-glass p-2.5 rounded-full transition-all shadow-lg active:scale-95 ${
            isCameraRunning ? 'text-white bg-white/10' : 'text-[#86868B] hover:text-white'
          }`}
          title={isCameraRunning ? 'Optical Tracking Active' : 'Enable Camera Gestures'}
        >
          {isCameraRunning ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </button>

        {/* Sound Toggle */}
        <button
          onClick={() => {
            onToggleMute();
          }}
          className="liquid-glass p-2.5 rounded-full hover:bg-white/10 text-[#86868B] hover:text-white transition-all shadow-lg active:scale-95"
          title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-white/40" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* Gesture Guide */}
        <button
          onClick={() => {
            spatialAudio.playTactileTick();
            onOpenGuide();
          }}
          className="liquid-glass p-2.5 rounded-full hover:bg-white/10 text-[#86868B] hover:text-white transition-all shadow-lg active:scale-95"
          title="Gesture Guide"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
