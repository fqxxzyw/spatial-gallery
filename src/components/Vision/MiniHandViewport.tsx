import React, { useEffect, useRef } from 'react';
import { X, Hand } from 'lucide-react';
import { cameraGestureService } from '../../features/gesture/cameraTracker';
import { GestureTelemetry } from '../../features/gesture/types';
import { spatialAudio } from '../../utils/audio';

interface MiniHandViewportProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: GestureTelemetry;
}

export const MiniHandViewport: React.FC<MiniHandViewportProps> = ({
  isOpen,
  onClose,
  telemetry,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      cameraGestureService.setPreviewCanvas(canvasRef.current);
    }
    return () => {
      cameraGestureService.setPreviewCanvas(null);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-20 right-6 z-30 w-56 liquid-glass rounded-2xl overflow-hidden shadow-2xl animate-in fade-in duration-200 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 text-xs text-[#86868B]">
        <div className="flex items-center space-x-1.5">
          <Hand className="w-3 h-3 text-[#F5F5F7]" />
          <span className="text-[11px] font-medium text-[#F5F5F7]">Hand Tracking</span>
        </div>
        <button
          onClick={() => {
            spatialAudio.playTactileTick();
            onClose();
          }}
          className="text-[#86868B] hover:text-white p-0.5 rounded-full"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Canvas */}
      <div className="relative aspect-[4/3] bg-[#141518]">
        <canvas ref={canvasRef} width={240} height={180} className="w-full h-full block" />
      </div>

      {/* Footer */}
      <div className="px-3 py-1 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[10px] text-[#86868B]">
        <span>{telemetry.statusMessage}</span>
        <span className="text-white/60">{telemetry.handsCount} Hands</span>
      </div>
    </div>
  );
};
