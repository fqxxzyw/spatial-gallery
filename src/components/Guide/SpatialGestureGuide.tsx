import React from 'react';
import { X, Mouse, Sparkles } from 'lucide-react';
import { spatialAudio } from '../../utils/audio';

interface SpatialGestureGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SpatialGestureGuide: React.FC<SpatialGestureGuideProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-200 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl liquid-glass rounded-3xl p-6 shadow-2xl space-y-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F7] tracking-tight flex items-center space-x-2">
              <span>空间交互与手势指南</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/80 font-normal">
                Apple visionOS
              </span>
            </h2>
            <p className="text-xs text-[#86868B] mt-0.5">
              高精度光学骨骼手势追踪 · 触控板与鼠标完美同构
            </p>
          </div>

          <button
            onClick={() => {
              spatialAudio.playDismiss();
              onClose();
            }}
            className="p-1.5 rounded-full text-[#86868B] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Gestures Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
          {/* 1. 单指选择悬停 */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
            <div className="flex items-center space-x-2 text-white font-medium">
              <span className="text-lg">☝️</span>
              <span>单指指向 · 悬停聚焦</span>
            </div>
            <p className="text-[#86868B] leading-relaxed text-[11px]">
              伸出食指在空间中移动，屏幕空间光标跟随。指向照片时，照片<span className="text-white">发出柔和轮廓光</span>并向外轻微浮起。
            </p>
          </div>

          {/* 2. 捏合放大 */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
            <div className="flex items-center space-x-2 text-white font-medium">
              <span className="text-lg">🤏</span>
              <span>食指拇指捏合 · 确定放大</span>
            </div>
            <p className="text-[#86868B] leading-relaxed text-[11px]">
              食指与拇指轻轻捏合，立即确认并将当前聚焦照片<span className="text-white">平滑放大至正中央展出</span>。
            </p>
          </div>

          {/* 3. 双指平移 */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
            <div className="flex items-center space-x-2 text-white font-medium">
              <span className="text-lg">✌️</span>
              <span>双指并拢 · 拖动平移</span>
            </div>
            <p className="text-[#86868B] leading-relaxed text-[11px]">
              伸出食指和中指移动，如同双指触控板手势，带动整个照片墙在 3D 空间中<span className="text-white">弹性平移与自转</span>。
            </p>
          </div>

          {/* 4. 三指滑动切换模式 */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
            <div className="flex items-center space-x-2 text-white font-medium">
              <span className="text-lg">3️⃣</span>
              <span>三指挥动 · 切换显示模式</span>
            </div>
            <p className="text-[#86868B] leading-relaxed text-[11px]">
              伸出三指（食指+中指+无名指）向左/右挥动，无缝在<span className="text-white">环形弧面、全景球幕、悬浮矩阵、双螺旋、波浪流</span>之间连续变形！
            </p>
          </div>

          {/* 5. 张开手掌放大整个视图 */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
            <div className="flex items-center space-x-2 text-white font-medium">
              <span className="text-lg">🖐️</span>
              <span>张开手掌 · 推进放大视图</span>
            </div>
            <p className="text-[#86868B] leading-relaxed text-[11px]">
              张开五指手掌，视角连续平滑推近，近距离沉浸式观赏照片细节。
            </p>
          </div>

          {/* 6. 握拳缩小整个视图 */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
            <div className="flex items-center space-x-2 text-white font-medium">
              <span className="text-lg">✊</span>
              <span>握紧拳头 · 拉远缩小视图</span>
            </div>
            <p className="text-[#86868B] leading-relaxed text-[11px]">
              握起拳头，视角连续拉远后撤，远距离总览宏大画卷；亦可快速退出大图查看。
            </p>
          </div>

          {/* 7. 无手势自动循环播放 */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
            <div className="flex items-center space-x-2 text-white font-medium">
              <span className="text-lg">🔄</span>
              <span>无手势自动循环 · 出现手势暂停</span>
            </div>
            <p className="text-[#86868B] leading-relaxed text-[11px]">
              手离开摄像头画面时，照片墙自动进入<span className="text-white">优雅巡航循环播放</span>；一旦检测到手部，立即无缝暂停交由手势控制！
            </p>
          </div>

          {/* 8. 点赞收藏 */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
            <div className="flex items-center space-x-2 text-white font-medium">
              <span className="text-lg">👍</span>
              <span>大拇指点赞 · 收藏佳作</span>
            </div>
            <p className="text-[#86868B] leading-relaxed text-[11px]">
              竖起大拇指，为当前聚焦的照片点亮收藏爱心，激荡柔和光效。
            </p>
          </div>
        </div>

        {/* Trackpad & Mouse Parity */}
        <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
          <div className="flex items-center space-x-2 text-xs font-medium text-white">
            <Mouse className="w-3.5 h-3.5 text-[#86868B]" />
            <span>无摄像头时的鼠标/触控板操作</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[#86868B]">
            <div>
              <span className="text-white block font-medium">移动光标</span>
              <span>悬停聚焦 & 轮廓光</span>
            </div>
            <div>
              <span className="text-white block font-medium">单击照片</span>
              <span>放大展示</span>
            </div>
            <div>
              <span className="text-white block font-medium">拖拽 / 右键</span>
              <span>平移旋转空间</span>
            </div>
            <div>
              <span className="text-white block font-medium">滚轮 / 空格</span>
              <span>缩放 / 切换形态</span>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-1">
          <button
            onClick={() => {
              spatialAudio.playTactileTick();
              onClose();
            }}
            className="px-5 py-2 rounded-full bg-white text-[#101113] text-xs font-semibold hover:bg-white/90 transition-all active:scale-95"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};
