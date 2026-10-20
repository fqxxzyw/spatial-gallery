import React, { useState } from 'react';
import { PhotoItem } from '../../services/photoSearchService';
import { X, ExternalLink, Camera, MapPin, Info, ChevronDown, ChevronUp, ZoomIn, ZoomOut } from 'lucide-react';
import { spatialAudio } from '../../utils/audio';

interface PhotoInspectionCardProps {
  photo: PhotoItem | null;
  onClose: () => void;
  isDetailZoomed?: boolean;
  onToggleZoom?: () => void;
}

export const PhotoInspectionCard: React.FC<PhotoInspectionCardProps> = ({
  photo,
  onClose,
  isDetailZoomed = false,
  onToggleZoom,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!photo) return null;

  return (
    <div className="fixed bottom-24 right-8 z-30 select-none flex flex-col items-end">
      {/* Expanded Meta Details Card (Default Hidden) */}
      {isExpanded && (
        <aside className="w-80 mb-3 liquid-glass rounded-3xl p-5 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-white/10">
            <div>
              <span className="text-[11px] font-medium tracking-wide text-[#86868B] uppercase">
                {photo.category}
              </span>
              <h2 className="text-base font-semibold text-[#F5F5F7] tracking-tight mt-0.5">
                {photo.title}
              </h2>
              <p className="text-xs text-[#86868B] mt-0.5">
                by <span className="text-[#F5F5F7]">{photo.photographer}</span>
              </p>
            </div>

            <button
              onClick={() => {
                spatialAudio.playDismiss();
                setIsExpanded(false);
              }}
              className="p-1 rounded-full text-[#86868B] hover:text-white hover:bg-white/10 transition-colors"
              title="Collapse Details"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Meta Specifications */}
          <div className="py-3.5 space-y-2.5 text-xs text-[#86868B]">
            <div className="flex items-center space-x-2">
              <MapPin className="w-3.5 h-3.5 text-[#F5F5F7]/70 shrink-0" />
              <span className="text-[#F5F5F7] truncate">{photo.location}</span>
            </div>

            <div className="flex items-center space-x-2">
              <Camera className="w-3.5 h-3.5 text-[#F5F5F7]/70 shrink-0" />
              <span className="text-[#F5F5F7] truncate">{photo.camera}</span>
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#F5F5F7]">
                {photo.focalLength}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#F5F5F7]">
                {photo.aperture}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#F5F5F7]">
                {photo.iso}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#F5F5F7]">
                {photo.year}
              </span>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between">
            <a
              href={photo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 text-xs font-medium text-white/90 hover:text-white transition-colors"
            >
              <span>View Source</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <div className="flex items-center space-x-2">
              {onToggleZoom && (
                <button
                  onClick={() => {
                    spatialAudio.playTactileTick();
                    onToggleZoom();
                  }}
                  className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs text-white transition-colors flex items-center space-x-1"
                >
                  {isDetailZoomed ? (
                    <>
                      <ZoomOut className="w-3 h-3" />
                      <span>还原</span>
                    </>
                  ) : (
                    <>
                      <ZoomIn className="w-3 h-3" />
                      <span>放大局部</span>
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => {
                  spatialAudio.playDismiss();
                  onClose();
                }}
                className="text-xs text-white/60 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Minimal Collapsed Pill (Default Visible) */}
      <div className="liquid-glass rounded-full px-4 py-2 flex items-center space-x-3 shadow-xl backdrop-blur-2xl border border-white/15">
        <button
          onClick={() => {
            spatialAudio.playTactileTick();
            setIsExpanded(!isExpanded);
          }}
          className="flex items-center space-x-2 text-xs text-[#F5F5F7] hover:text-white transition-colors"
          title="Toggle Photo Details"
        >
          <Info className="w-3.5 h-3.5 text-white/70" />
          <span className="font-medium max-w-[170px] truncate">{photo.title}</span>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-white/50" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-white/50" />
          )}
        </button>

        {onToggleZoom && (
          <>
            <div className="w-[1px] h-3 bg-white/15" />
            <button
              onClick={() => {
                spatialAudio.playTactileTick();
                onToggleZoom();
              }}
              className={`p-1 rounded-full transition-colors ${
                isDetailZoomed
                  ? 'text-cyan-300 bg-white/10 hover:bg-white/20'
                  : 'text-[#86868B] hover:text-white hover:bg-white/10'
              }`}
              title={isDetailZoomed ? '还原大小 (再次双击)' : '放大局部 (双击)'}
            >
              {isDetailZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
            </button>
          </>
        )}

        <div className="w-[1px] h-3 bg-white/15" />

        <button
          onClick={() => {
            spatialAudio.playDismiss();
            onClose();
          }}
          className="p-1 rounded-full text-[#86868B] hover:text-white hover:bg-white/10 transition-colors"
          title="关闭单张照片 (再次单击 / 握拳 / 下滑手势)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
