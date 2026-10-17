import React from 'react';
import { RotateCcw, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { spatialAudio } from '../../utils/audio';

interface MorphControlBarProps {
  currentFactor: number;
  onSetMorphFactor: (factor: number) => void;
  onPrevMorph: () => void;
  onNextMorph: () => void;
  onResetView: () => void;
  isMiniCameraOpen: boolean;
  onToggleMiniCamera: () => void;
  isCameraActive: boolean;
}

const MORPH_STAGES = [
  { id: 0, label: 'Grid' },
  { id: 1, label: 'Cylinder' },
  { id: 2, label: 'Sphere' },
  { id: 3, label: 'Helix' },
  { id: 4, label: 'Wave' },
];

export const MorphControlBar: React.FC<MorphControlBarProps> = ({
  currentFactor,
  onSetMorphFactor,
  onPrevMorph,
  onNextMorph,
  onResetView,
  isMiniCameraOpen,
  onToggleMiniCamera,
  isCameraActive,
}) => {
  const currentNearestIndex = Math.round(currentFactor);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-3 select-none">
      {/* Morph Navigation Capsule */}
      <div className="liquid-glass rounded-full px-3 py-1.5 flex items-center space-x-2 shadow-2xl">
        {/* Step Prev */}
        <button
          onClick={() => {
            spatialAudio.playTactileTick();
            onPrevMorph();
          }}
          className="p-1.5 rounded-full hover:bg-white/10 text-[#86868B] hover:text-white transition-all active:scale-95"
          title="Previous Form (Swipe Left)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Morph Stage Pills */}
        <div className="flex items-center space-x-1">
          {MORPH_STAGES.map((stage) => {
            const isActive = currentNearestIndex === stage.id;
            return (
              <button
                key={stage.id}
                onClick={() => {
                  spatialAudio.playTactileTick();
                  onSetMorphFactor(stage.id);
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-[#86868B] hover:text-white hover:bg-white/5'
                }`}
              >
                {stage.label}
              </button>
            );
          })}
        </div>

        {/* Step Next */}
        <button
          onClick={() => {
            spatialAudio.playTactileTick();
            onNextMorph();
          }}
          className="p-1.5 rounded-full hover:bg-white/10 text-[#86868B] hover:text-white transition-all active:scale-95"
          title="Next Form (Swipe Right / Space)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="h-3 w-[1px] bg-white/10" />

        {/* Reset Camera View */}
        <button
          onClick={() => {
            spatialAudio.playTactileTick();
            onResetView();
          }}
          className="p-1.5 rounded-full hover:bg-white/10 text-[#86868B] hover:text-white transition-all active:scale-95"
          title="Reset Camera Orientation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Optical Tracker Mini Pill */}
      {isCameraActive && (
        <button
          onClick={() => {
            spatialAudio.playTactileTick();
            onToggleMiniCamera();
          }}
          className={`liquid-glass rounded-full px-3 py-2 flex items-center space-x-1.5 text-xs transition-all shadow-xl active:scale-95 ${
            isMiniCameraOpen ? 'text-white bg-white/15' : 'text-[#86868B] hover:text-white'
          }`}
          title="Toggle Hand Tracker Preview"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {isMiniCameraOpen ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
};
