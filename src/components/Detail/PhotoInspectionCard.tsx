import React from 'react';
import { PhotoItem } from '../../services/photoSearchService';
import { X, ExternalLink, Camera, MapPin } from 'lucide-react';
import { spatialAudio } from '../../utils/audio';

interface PhotoInspectionCardProps {
  photo: PhotoItem | null;
  onClose: () => void;
}

export const PhotoInspectionCard: React.FC<PhotoInspectionCardProps> = ({ photo, onClose }) => {
  if (!photo) return null;

  return (
    <aside className="fixed top-24 right-8 z-30 w-80 liquid-glass rounded-3xl p-5 shadow-2xl animate-in fade-in slide-in-from-right-6 duration-300 select-none">
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
            onClose();
          }}
          className="p-1 rounded-full text-[#86868B] hover:text-white hover:bg-white/10 transition-colors"
          title="Dismiss (Esc / Fist)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Meta Specifications */}
      <div className="py-3.5 space-y-2.5 text-xs text-[#86868B]">
        {/* Location */}
        <div className="flex items-center space-x-2">
          <MapPin className="w-3.5 h-3.5 text-[#F5F5F7]/70 shrink-0" />
          <span className="text-[#F5F5F7] truncate">{photo.location}</span>
        </div>

        {/* Camera Gear */}
        <div className="flex items-center space-x-2">
          <Camera className="w-3.5 h-3.5 text-[#F5F5F7]/70 shrink-0" />
          <span className="text-[#F5F5F7] truncate">{photo.camera}</span>
        </div>

        {/* Optical Exposure Tags */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#F5F5F7]">
            {photo.focalLength}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#F5F5F7]">
            {photo.aperture}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#F5F5F7]">
            ISO {photo.iso}
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

        <span className="text-[11px] text-[#86868B]">
          Pinch away to return
        </span>
      </div>
    </aside>
  );
};
