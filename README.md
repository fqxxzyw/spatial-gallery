# 🌌 Spatial Gallery — 极简空间手势照片浏览器

[GitHub Pages 在线使用](https://fqxxzyw.github.io/spatial-gallery/)

> **"Less Interface, More Interaction. 让照片成为主角，让界面尽可能隐形，让操作符合真实世界的物理直觉。"**

基于 **Apple visionOS** 空间计算体验、**iOS Spring Physics** 弹簧物理引擎与 **MediaPipe Hands** 计算机视觉手势追踪，彻底抛弃赛博朋克与科幻科技风，打造纯净、克制、优雅的摄影级空间三维照片浏览器。

---

## ✨ 核心设计理念与重构特色

### 1. Apple visionOS 纯净极简美学
- **深炭黑沉浸空间**：主背景使用深炭黑（`#101113`）与微弱暖调环境漫射，完全移除所有青蓝霓虹描边、激光扫线、地面科技网格与 HUD 悬浮参数。
- **纯粹摄影质感**：照片采用精细圆角（22px）与超细微反光边缘（0.8px 液态玻璃高光），保留作品原始纯净度。
- **Liquid Glass（液态玻璃）材质**：胶囊导航、搜索弹层与状态指示器均采用半透明微磨砂液态玻璃，悬浮于三维空间之中，具有呼吸式边缘折射与柔和阴影。

### 2. Continuous Spatial Morphing（连续空间形态变换）
五种空间形态不再是割裂的离散页面，而是同一个三维空间几何流形的**连续平滑变形**：
- **GRID（平面呼吸网格）**：宽广舒展的展览长卷，带有微弱波峰纵深起伏。
- **CYLINDER（全景曲面环形幕）**：默认视效，visionOS 经典曲面环抱，符合人眼自然视场。
- **SPHERE（斐波那契全息球体）**：天体球幕形态，照片沿黄金分割角分布。
- **HELIX（DNA 基因双螺旋）**：垂直盘旋升腾的数据与光影旋涡。
- **WAVE（流体动态波带）**：高低起伏的丝绸流体缎带。

> **连续性保证**：从网格过渡到圆柱与球体时，每张照片都保留独立身份，沿着连续空间轨迹飞向新坐标，绝无闪烁、白屏或跳跃。

### 3. 照片实时搜索与空间涌入 (Photo Search & Dynamic Spatial Influx)
- **关键词搜索**：支持在液态玻璃搜索浮层中输入任意主题（如“雪山”、“极简建筑”、“东京夜色”、“北欧峡湾”等），或点击灵感胶囊快速载入。
- **本地图片导入**：支持从电脑拖拽或选择个人照片文件（JPEG、PNG、WebP），照片将实时计算比例并以弹簧动画融入三维空间。
- **空间渐进涌入**：重新搜索时，旧照片像失重般沉入景深，新照片如同星流从三维深处分批次以物理弹簧曲线跃迁就位。

### 4. Apple-grade Spring Physics 弹簧物理系统
- **统一二阶弹簧仿真器**：采用无固定帧率绑定的物理积分器（Stiffness、Damping、Mass），驱动相机、旋转、缩放与形态变形。
- **iOS 橡皮筋阻尼（Rubber-Banding）**：边界拖拽时呈现物理阻力递增，松开后柔和回弹。
- **果冻微回弹（Jelly Focus）**：选中的照片向前浮起并伴随极其克制的小幅过冲与阻尼沉降；周围照片产生自然的径向避让呼吸。
- **惯性滑动（Inertial Momentum）**：快速挥手或拖拽后，照片墙保留初速度并依据摩擦系数自然衰减平稳停止。

---

## 🖐️ 自然手势交互指南

系统使用 MediaPipe Hands 追踪 21 个手部关键点，并引入 **EMA 滤波** 与 **滞回确认（Dwell Time）** 防止抖动与误触：

| 手势 | 操作方式 | 系统响应 |
| :--- | :--- | :--- |
| **🤏 捏合停留 (Pinch & Dwell)** | 拇指与食指轻触并短暂停留（防误触机制） | **磁吸聚焦**：照片向前平滑浮起，右侧浮现精修元数据卡片 |
| **✋ 单手张开平移 (Open Palm Pan)** | 张开手掌在镜头前平移 | **空间平移与轨道转动**：带自然惯性阻尼跟随 |
| **👐 双手间距展开 (Hand Spread)** | 双手在视野中逐渐拉大或缩小间距 | **连续空间变形 & 缩放**：动态平滑弯曲照片墙形态 |
| **👋 水平横向挥扫 (Horizontal Swipe)** | 单手张开快速向左或向右挥动 | **形态步进切换**：流体过渡至上一个/下一个空间形态 |
| **✊ 握拳释放 (Fist Dismiss)** | 五指握拳短暂停留 | **退出特写**：退出当前聚焦照片，重置相机视距 |

### 鼠标与触控板全面对齐（无摄像头依然完备）
- **左键单击卡片**：聚焦检视
- **左键拖拽**：3D 轨道空间旋转（带惯性）
- **Shift + 左键拖拽 / 右键拖拽**：平移空间
- **滚轮 / 双指缩放**：超丝滑距离缩放
- **空格键 / 方向键**：无缝步进变形形态
- **ESC 键**：退出聚焦照片

---

## 🏗️ 项目架构

```
src/
├── features/
│   ├── gesture/
│   │   ├── types.ts                  # 手势语义与遥测接口
│   │   ├── gestureDetector.ts        # EMA平滑滤波、捏合滞回判定与横向挥扫识别
│   │   └── cameraTracker.ts          # MediaPipe 驱动与 visionOS 极简骨骼视窗
│   └── scene/
│       ├── spatialPhysics.ts         # Apple 弹簧物理系统 (Spring1D, Spring3D, RubberBand)
│       ├── photoTextureGenerator.ts  # 无框圆角照片卡片、环境阴影与玻璃高光纹理
│       └── photoWallScene.ts         # Continuous Spatial Morphing 连续形态混合渲染核心
├── services/
│   └── photoSearchService.ts         # 摄影集检索、Unsplash 端点联动与本地照片拖拽导入
├── components/
│   ├── Navigation/
│   │   └── VisionTopBar.tsx          # 顶部 visionOS 悬浮胶囊导航
│   ├── Controls/
│   │   └── MorphControlBar.tsx       # 底部连续形态切换与微型指示坞
│   ├── Detail/
│   │   └── PhotoInspectionCard.tsx   # 选中照片的精修瑞士排版信息卡片
│   ├── Search/
│   │   └── SearchOverlay.tsx         # 极简 Liquid Glass 搜索与拖拽上传浮层
│   ├── Vision/
│   │   └── MiniHandViewport.tsx      # 右下角手部光学追踪视窗 (默认极简收起)
│   └── Guide/
│       └── SpatialGestureGuide.tsx   # 优雅手势说明弹窗
├── utils/
│   └── audio.ts                      # 温暖有机的触觉级声效合成器 (零外部音频依赖)
├── App.tsx                           # 主逻辑与状态装配器
└── index.css                         # Liquid Glass 材质与 Apple 色彩系统
```

---

## 💻 本地运行与构建

```bash
# 1. 启动本地开发服务 (端口 3000)
npm run dev

# 2. 语法与类型校验
npm run lint

# 3. 生产环境构建打包
npm run build
```

## GitHub Pages

推送 main 后自动部署。Pages 构建设置 `VITE_STATIC_HOST=true`，使用 Wikimedia Commons 和 Openverse 浏览器直连搜索；只接受允许跨域且能加载的图片，不提供原服务器的全网聚合搜索和图片代理。动漫词条可能没有结果，可导入本地照片。

`npm run dev` 仍运行原有 Express 服务。需要完整在线搜索时，另行部署 `server.ts`，并在 Pages 构建环境设置 `VITE_API_BASE_URL` 为允许跨域的 HTTPS 服务地址。不要把私密密钥写入 VITE 环境变量。
