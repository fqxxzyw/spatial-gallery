import React, { useState } from 'react';
import { Search, X, Upload, Sparkles, Loader2, Globe } from 'lucide-react';
import { spatialAudio } from '../../utils/audio';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (keyword: string) => Promise<void>;
  onFilesSelected: (files: FileList) => void;
  isSearching: boolean;
}

const PRESET_TOPICS = [
  '雪之下雪乃',
  '初音未来',
  '吉卜力风光',
  '赛博朋克都市',
  '阿尔卑斯雪山',
  '极简空间建筑',
  '深空星云',
  '治愈系猫咪',
];

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  isOpen,
  onClose,
  onSearch,
  onFilesSelected,
  isSearching,
}) => {
  const [query, setQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isSearching) return;
    spatialAudio.playTactileTick();
    await onSearch(query.trim());
    onClose();
  };

  const handleSelectPreset = async (topic: string) => {
    if (isSearching) return;
    spatialAudio.playTactileTick();
    setQuery(topic);
    await onSearch(topic);
    onClose();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      spatialAudio.playPhotosLoaded();
      onFilesSelected(e.dataTransfer.files);
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-200 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg liquid-glass rounded-3xl p-6 shadow-2xl space-y-5"
      >
        {/* Search Header & Live Badge */}
        <div className="flex items-center justify-between text-xs text-[#86868B]">
          <div className="flex items-center space-x-1.5 text-white/90 font-medium">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>全网真实图像搜索引擎（动漫 / 摄影 / 艺术 / 风光）</span>
          </div>

          <button onClick={onClose} className="text-[#86868B] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-[#86868B]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索任何真实照片（如：雪之下雪乃、初音未来、雪山、猫咪）..."
            autoFocus
            disabled={isSearching}
            className="w-full bg-white/5 border border-white/10 rounded-full pl-11 pr-12 py-3 text-sm text-[#F5F5F7] placeholder-[#86868B] focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all disabled:opacity-50"
          />
          {isSearching ? (
            <div className="absolute right-4 top-3.5 text-white/70 animate-spin">
              <Loader2 className="w-4 h-4" />
            </div>
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-4 top-3.5 text-[#86868B] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </form>

        {/* Live Loading Prompt */}
        {isSearching && (
          <div className="flex items-center justify-center space-x-2 py-2 text-xs text-white/70">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>连接全球多引擎检索真实照片并载入 3D 空间...</span>
          </div>
        )}

        {/* Curated Inspiration Pills */}
        <div className="space-y-2">
          <div className="flex items-center space-x-1.5 text-xs text-[#86868B] font-medium">
            <Sparkles className="w-3.5 h-3.5 text-amber-300/80" />
            <span>热门探索推荐</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESET_TOPICS.map((topic) => (
              <button
                key={topic}
                onClick={() => handleSelectPreset(topic)}
                disabled={isSearching}
                className="px-3.5 py-1.5 text-xs rounded-full bg-white/5 hover:bg-white/15 border border-white/5 hover:border-white/20 text-[#86868B] hover:text-[#F5F5F7] transition-all disabled:opacity-50 cursor-pointer"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        {/* Local File Upload Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border border-dashed rounded-2xl p-4 text-center transition-all ${
            isDragging
              ? 'border-white/50 bg-white/10 scale-[1.01]'
              : 'border-white/10 bg-white/[0.02] hover:border-white/20'
          }`}
        >
          <Upload className="w-5 h-5 text-[#86868B] mx-auto mb-1.5" />
          <p className="text-xs text-[#F5F5F7] font-medium mb-0.5">
            或将本地照片拖拽放入三维空间
          </p>
          <p className="text-[10px] text-[#86868B] mb-2.5">
            支持 JPG、PNG、WebP，本地极速圆角解析渲染
          </p>

          <label className="inline-block px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs text-white font-medium cursor-pointer transition-colors">
            选择本地照片
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  spatialAudio.playPhotosLoaded();
                  onFilesSelected(e.target.files);
                  onClose();
                }
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
};
