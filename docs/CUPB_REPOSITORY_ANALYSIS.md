# 中石大场景接入前的仓库分析

分析对象：`wcqqq1214/gxu-campus-3d` 的 `dev` 分支，提交 `46377d5ccc878d7e8128a821947740bf516e2587`。本文件先于改造代码编写。线上地址作为交互参考；以下精确定位以该提交源码为准。

## 1. 实际结构与模块

仓库不是纯原生 Three.js 的 `index.html + js + css` 工程。它使用 React 19、TypeScript、Three.js、Vinext/Vite，并通过静态导出发布。源码中没有手写的运行时 `index.html`；该文件由构建生成。

| 路径 | 作用 |
| --- | --- |
| `app/page.tsx` | 客户端页面入口；左侧地点/图层/光影面板、右侧视角工具、巡游状态与搜索；加载数据并创建场景。 |
| `app/layout.tsx`、`app/globals.css` | 根布局、全局样式、响应式面板和按钮外观。 |
| `components/campus-*.tsx` | 语言、加载进度、迷你图、地点视角控制。`components/ui/*.tsx` 是原有按钮、输入框、切换、对话框、标签页基础组件。 |
| `lib/campus/scene.ts` | Three.js 场景、GLB 解析、图层、标签、拾取、相机动画、渲染循环。 |
| `lib/campus/boot.ts`、`streaming.ts` | 资源路径、模型清单、预加载、进度、重试与细节队列。 |
| `lib/campus/camera.ts`、`camera-store.ts`、`share.ts` | 地标机位/全景拟合、相机状态订阅、视角分享。 |
| `lib/campus/lighting.ts`、`sky.ts`、`night.ts`、`postprocessing.ts`、`shadow-frustum.ts` | 四档灯光参数、程序渐变天空/雾、夜景材质、后处理和阴影裁剪体。 |
| `lib/campus/quality.ts`、`frame-pacing.ts`、`convex-culling.ts` | 自动画质、帧调度、遮挡优化。 |
| `lib/campus/labels.ts`、`navigation.ts`、`boundary*.ts`、`vegetation.ts` | 标签锚点、搜索/地点目录、边界、植被实例。 |
| `lib/campus/palette.ts`、`context-style.ts`、`road-batching.ts`、`sports-batching.ts`、`ground-triangles.ts` | 原模型材质处理、道路/运动面合批及地形修整。 |
| `lib/campus/types.ts`、`i18n/*.ts` | 数据类型、默认图层、双语名称及文案。 |
| `data/*.json`、`scripts/*.py`、`blender/*.py` | 广西大学源数据、地理数据加工、离线 Blender 建模。`scripts/*.mjs` 包含构建、导出和回归脚本。 |
| `public/data/*.json`、`public/models/*.glb` | 浏览器运行时数据与已烘焙模型；当前是广西大学资产。 |
| `next.config.ts`、`vite.config.ts`、`scripts/build-pages.mjs`、`.github/workflows/pages.yml` | 静态导出、Vite/Vinext、Pages 打包与部署。 |

### 1.1 运行时文件逐项清单

下表以改造前的 `dev` 提交为准。`app` 下只有一个手写 CSS 文件，没有手写运行时 HTML；`out/index.html` 由构建产生。

| 文件 | 作用 |
| --- | --- |
| `app/layout.tsx` | HTML 根布局、语言标记、站点元数据，并引入全局样式。 |
| `app/page.tsx` | 客户端页面主入口；数据预取、场景控制器生命周期、左侧面板、巡游、搜索、右侧工具、分享和导图 UI。 |
| `app/globals.css` | Radix 色板变量、页面/面板/按钮/标签/小地图样式及窄屏响应布局。 |
| `components/campus-load-status.tsx` | 初始模型加载进度、后台加载状态、错误与重试入口。 |
| `components/campus-locale.tsx` | 中英文状态、持久化、翻译函数及 React Context。 |
| `components/campus-minimap.tsx` | 建筑足迹、校园边界、道路和相机朝向的小地图。 |
| `components/campus-view-controls.tsx` | 地标的正面、背面、俯视、入口及环绕等观察机位控件。 |
| `components/ui/button.tsx` | 原有按钮基础组件及样式变体。 |
| `components/ui/dialog.tsx` | 对话框、遮罩、标题、说明等基础组件。 |
| `components/ui/input.tsx` | 搜索等输入控件的通用封装。 |
| `components/ui/radio-group.tsx` | 单选组与单选项基础组件。 |
| `components/ui/switch.tsx` | 图层开关的可访问切换组件。 |
| `components/ui/tabs.tsx` | 地点、图层、光影等标签页基础组件。 |
| `lib/utils.ts` | 用 `clsx`、`tailwind-merge` 合并组件 CSS 类名。 |
| `lib/campus/benchmark-orbit.ts` | 性能基准测试用的可重复相机环绕与采样序列。 |
| `lib/campus/boot.ts` | 资源前缀与版本 URL、模型清单类型、首屏基础 GLB 预取。 |
| `lib/campus/boundary-data.ts` | 通过共享 JSON 加载器读取校园边界数据。 |
| `lib/campus/boundary.ts` | 边界数据类型和三维边界线几何生成。 |
| `lib/campus/camera-store.ts` | 供 React UI 订阅的相机快照存储。 |
| `lib/campus/camera.ts` | 地标方向、建筑包围盒、全景拟合、入口视角与机位计算。 |
| `lib/campus/context-style.ts` | 周边环境/边界的材质颜色处理。 |
| `lib/campus/convex-culling.ts` | 流畅档的凸面裁剪与可见性优化。 |
| `lib/campus/frame-pacing.ts` | 流畅档帧率调度。 |
| `lib/campus/ground-triangles.ts` | 基础模型重叠地面三角面的裁减。 |
| `lib/campus/i18n/descriptions.ts` | 地标英文介绍及说明文字选择。 |
| `lib/campus/i18n/index.ts` | 语言类型、名称映射、翻译和状态文案接口。 |
| `lib/campus/i18n/messages.ts` | 界面英文翻译字典。 |
| `lib/campus/i18n/names.ts` | 校园地点与建筑的双语名称字典。 |
| `lib/campus/labels.ts` | 把地标数据或已加载模型的屋顶转换为标签锚点。 |
| `lib/campus/lighting.ts` | 清晨、白天、黄昏、夜晚四档灯光参数表。 |
| `lib/campus/load-status-store.ts` | 加载文案、错误与进度的外部状态存储。 |
| `lib/campus/math.ts` | 地理坐标投影、点击判定及巡游下标循环；原点仍为广西大学坐标。 |
| `lib/campus/navigation.ts` | 地标/普通建筑的搜索、可拾取足迹及别名处理。 |
| `lib/campus/night.ts` | 夜景窗灯、材质处理与道路灯光。 |
| `lib/campus/palette.ts` | 原广西大学建筑和地表的材质颜色规则。 |
| `lib/campus/postprocessing.ts` | 精细档的 SAO、夜景 Bloom 和输出后处理。 |
| `lib/campus/quality.ts` | 自动画质判定及精细、流畅档的像素比、阴影和细节预算。 |
| `lib/campus/resources.ts` | 场景对象的几何、材质、贴图与阴影资源释放。 |
| `lib/campus/road-batching.ts` | 静态道路和场地路面网格合批。 |
| `lib/campus/scene.ts` | Three.js 场景总控制器；GLB/Draco、渲染、灯光、图层、标签、相机、拾取与加载队列。 |
| `lib/campus/shadow-frustum.ts` | 缓存阴影裁剪体参数，避免无意义的阴影重算。 |
| `lib/campus/share.ts` | 相机快照 URL 编解码及指南针朝向计算。 |
| `lib/campus/shared-json.ts` | 可复用、支持取消的 JSON 请求及缓存。 |
| `lib/campus/sky.ts` | Canvas 渐变天空纹理和四档雾化距离。 |
| `lib/campus/sports-batching.ts` | 运动场地的静态几何合批。 |
| `lib/campus/streaming.ts` | JSON/GLB 网络请求、进度、重试及近景资源预算队列。 |
| `lib/campus/types.ts` | 建筑、地标、图层、画质、环境和场景控制器接口。 |
| `lib/campus/vegetation.ts` | 树木实例的高度、朝向、颜色和优先级计算。 |

本次新增的 `lib/campus/cupb-config.ts` 不属于原仓库：它集中保存中石大模型路径、坐标适配、初始镜头、地标和巡游配置，避免把新校区数据散落在原业务文件中。

### 1.2 JavaScript 工具脚本与唯一 HTML 文件

这些 `scripts/*.mjs` 不是浏览器运行时的独立 JS 模块。除打包插件和数据转换外，多数是开发验收工具；不要把它们误列为页面入口。

| 文件 | 作用 |
| --- | --- |
| `scripts/build-pages.mjs` | 调用 Vinext 构建，按 Pages 子路径整理 `out/`，验证资源并裁剪发布数据。 |
| `scripts/preview.mjs` | 用本地 HTTP 服务预览 `out/`，也可模拟资源失败。 |
| `scripts/vite-draco-assets.mjs` | Vite 插件：让 Draco 解码资源使用 `public/draco/` 的单一副本。 |
| `scripts/data-version.mjs` | 计算公开 JSON 数据版本哈希，用于静态资源缓存更新。 |
| `scripts/runtime-data.mjs` | 将完整建筑数据缩减为浏览器页面实际读取的字段。 |
| `scripts/benchmark-capture.mjs` | 浏览器内捕获连续性能基准采样。 |
| `scripts/browser-check-helpers.mjs` | 浏览器检查脚本复用的面板操作、图层切换和截图辅助函数。 |
| `scripts/draco-geometry.mjs` | 在 Node 检查工具中解码 GLB 的 Draco 几何。 |
| `scripts/road-position-domain.mjs` | 读取道路网格的编码位置域，辅助几何精度验证。 |
| `scripts/run-geometry-tests.mjs` | 收集并运行 Blender 侧 Python 几何回归测试。 |
| `scripts/check-benchmark-capture.mjs` | 验证性能采样捕获脚本的浏览器行为。 |
| `scripts/check-campus-performance.mjs` | 在固定视角比较两个构建的渲染性能。 |
| `scripts/check-campus-startup.mjs` | 对比冷启动加载和首帧时序。 |
| `scripts/check-convex-culling.mjs` | 对真实 GLB 测试凸面裁剪，并生成核对数据。 |
| `scripts/check-i18n-browser.mjs` | 浏览器中检查中英文界面与响应布局。 |
| `scripts/check-menu-interactions-browser.mjs` | 浏览器中回归菜单、面板等交互。 |
| `scripts/check-panel-camera-browser.mjs` | 比较面板开合与相机视角的浏览器回归。 |
| `scripts/check-paving-browser.mjs` | 检查铺地近景、图层与夜景显示。 |
| `scripts/check-shore-browser.mjs` | 检查岸线近景、图层与夜景显示。 |
| `scripts/check-site-browser.mjs` | 检查建筑前场近景、图层与夜景显示。 |
| `scripts/check-sports-batching-browser.mjs` | 比较运动场地合批前后画面及图层。 |
| `scripts/fixtures/postprocessing.html` | 仓库唯一手写 HTML；专供真实 WebGL 2 后处理数值回归，不是校园网页入口。 |

`scripts/test-*.mjs` 为 Node 单元/集成回归，按名称分组如下：

- 加载、资源与部署：`test-boot`、`test-streaming`、`test-resources`、`test-shared-json`、`test-runtime-data`、`test-data-version`、`test-draco-assets`、`test-load-status-store`。
- 地图与几何：`test-boundary`、`test-campus`、`test-infrastructure`、`test-huicui`、`test-sources`、`test-sports`、`test-basketball`、`test-terrain-slices`、`test-ground-triangles`、`test-convex-culling`、`test-static-road-batching`、`test-sports-batching`、`test-vegetation`。
- 镜头、界面与渲染：`test-camera`、`test-benchmark-orbit`、`test-building-search`、`test-labels`、`test-share`、`test-i18n`、`test-fog`、`test-night`、`test-loading-lighting`、`test-quality`、`test-frame-pacing`、`test-shadow-frustum`。

本次新增的 `scripts/test-cupb-integration.mjs` 专门验证中石大资产接入与配置，不属于原仓库文件。

`public/draco/draco_decoder.js` 与 `public/draco/draco_wasm_wrapper.js` 是 Three.js GLB/Draco 加载使用的分发解码器，配套 `draco_decoder.wasm`；它们是第三方运行资源，不是业务页面或可编辑的校园模块。仓库没有其他手写 CSS 或页面 HTML。

## 2. 关键入口和精确逻辑

| 目标 | 源码位置 | 行为 |
| --- | --- | --- |
| 模型加载入口 | `app/page.tsx:231-249`；`lib/campus/boot.ts:37-58`；`lib/campus/scene.ts:1019-1086,1421-1435` | 先取 `public/data/models.json`，预取 `base`，通过 `GLTFLoader.parseAsync` 解析；页面加载状态接收字节进度。 |
| 模型清单 | `public/data/models.json`；`lib/campus/boot.ts:14-23` | `base`、`trees`、`zones`、`landmarks` 等资源均从清单读取。原 `base` 是 `models/base.glb`。 |
| 点位配置 | `public/data/landmarks.json`；`app/page.tsx:234-240` | 运行时读取数组；原始编辑源为 `data/landmarks.json`，导出脚本可覆盖 `public/data`。标签在 `scene.ts:347-367,416-427` 创建并定位。 |
| 巡游路线 | `app/page.tsx:476-502`；`scene.ts:1789-1795` | **没有独立的路径数组**；按地标数组顺序逐站 `focus`，每站 8500 ms，相机单段动画为 1300 ms 三次缓出。 |
| 灯光、天空、雾 | `lib/campus/lighting.ts:19-69`；`sky.ts:10-66`；`scene.ts:1544-1570` | 四档参数复用同一组灯光；当前切换直接赋值和重绘天空，并非平滑插值。 |
| 画质与阴影 | `lib/campus/quality.ts:38-62`；`scene.ts:105-118,162-169,1503-1542`；`postprocessing.ts` | ACES 色调映射、PCF 阴影、2048² 阴影图；自动/精细/流畅三档，精细档启用后处理。 |
| 图层 | `lib/campus/types.ts:4-12,142-151`；`app/page.tsx:90-99,954-972`；`scene.ts:962-983` | 原版有标签、边界、建筑、植被、道路、湖塘、运动场、周边建筑八项。 |
| 相机 | `scene.ts:127-139,1617-1644`；`camera.ts` | `OrbitControls`：左键旋转、右键平移、滚轮缩放，方向键平移；不是第一人称 WASD 漫游。 |
| 原生几何体 | `scene.ts:438-466`；`blender/build_campus.py` | 浏览器中的挤出几何主要用于不可见拾取代理；可见广西大学建筑由 Blender 离线生成 GLB。不存在“运行时生成整校方块建筑”的主分支。 |

## 3. 场景替换设计与兜底

新场景优先加载中石大 GLB，保留原有 `GLTFLoader`、进度回调、材质处理、光照/渲染和 UI。模型接入参数及中石大点位集中到一个配置对象。广西大学 `models.json` 清单不进入正常中石大场景，防止两校模型叠加。加载失败时仅启用简易占位几何体，保留原离线建模代码供查阅；不能把原广西大学模型当成中石大兜底。

已找到用户现有资产 `C:\Users\syh\Documents\deepseek-harness\default-workspace\cup_data\campus.glb`（约 1.78 MB）。它的几何范围为 X `[-573.04,573.04]`、Y `[0,60]`、Z `[-476.84,476.74]`，仅一个合并网格、一个 PBR 材质，但包含顶点色。`campus_scene.geojson` 含建筑、道路、绿地、运动场、水体等分类；`campus_buildings.geojson` 含建筑足迹。当前合并 GLB **无法仅靠节点名称分别隐藏建筑/道路/植被/水体，也无法保留各自独立材质**。本次可依据原模型生成脚本的固定顶点色，把现有三角形索引分成可见性组，不重新生成建筑几何；若以后改用贴图或统一顶点色，须导出带语义节点的分层模型。

当前工作区根目录的 `buildings_final.json` 和路线 JSON 使用另一套约 12–90 的局部坐标；不能直接套在上述米制 GLB 上。另一个 `cupmap/out/campus_fence.glb` 也与 `cup_data/campus.glb` 原点不一致，不应直接叠加。

建筑名称还参考了学校[公共信息编码规范](https://www.cup.edu.cn/nic/zczd/xjzd/850436c0ab2c48048ce5cf5562d661bf.htm)。用户旧会话要求按真实布局校准，并指出旧 HTML 使用 0–100 局部坐标；本次点位取现有同源 GeoJSON，不挪用旧坐标。照片包的“北校区”文件夹、旧 HTML 的“北校区”与图文汇编中的“西校区”称谓不应直接作为坐标分区。官方资料可核实红旗操场等名称，但无法由名称推得三维机位。

结合项目另外两段对话及附件：第十九阶段单页 HTML 使用 0–100 相对坐标和示意行人路线，未提供实测米制坐标；19 张建筑照片可辅助外观比对，但不能确定镜头方位或建筑中心。照片目录的“北校区”称谓与图文汇编中的西、南、东组团不能直接对应。另一份 `campus_buildings_lod1.geojson` 与本次 GLB 同 ID 建筑的坐标显著不同，例如第五教学楼 ID 937 在本次同源数据约为 `[483.7,-277.1]` 米，LOD1 则约为 `[65.3,-117.3]` 米，因此不能拼接这两套点位。本次 22 个地标均取当前 GLB 同源 GeoJSON；第一/第二教学楼虽见于部分资料，但没有同源定位点，故未放进巡游。

## 4. 依赖、打包与部署

`package.json` 固定的主要运行依赖：React/React DOM `19.2.8`、Three.js `^0.185.1`、Vinext `1.0.0-beta.9`、Base UI `1.7.0`、Lucide React `1.31.0`、Tailwind 相关包。开发依赖有 TypeScript `5.9.3`、Vite `8.2.2`、Tailwind CSS `4.2.1`、oxlint `1.76.0` 等；完整锁定版本见 `package-lock.json`，改造不增加依赖。

完整的 `package.json` 直接依赖清单如下。带 `^` 的是声明范围；`package-lock.json` 固定了每个包本次安装的实际解析版本，例如 `three` 锁定为 `0.185.1`。

| 运行依赖 | 声明版本 | 开发依赖 | 声明版本 |
| --- | --- | --- | --- |
| `@base-ui/react` | `1.7.0` | `@tailwindcss/postcss` | `4.2.1` |
| `@radix-ui/colors` | `3.0.0` | `@types/node` | `22.19.19` |
| `class-variance-authority` | `0.7.1` | `@types/react` | `19.2.14` |
| `clsx` | `2.1.1` | `@types/react-dom` | `19.2.3` |
| `lucide-react` | `1.31.0` | `@types/three` | `^0.185.4` |
| `react` | `19.2.8` | `@vitejs/plugin-react` | `6.0.2` |
| `react-dom` | `19.2.8` | `@vitejs/plugin-rsc` | `0.5.34` |
| `react-server-dom-webpack` | `19.2.8` | `oxfmt` | `0.61.0` |
| `shadcn` | `4.18.0` | `oxlint` | `1.76.0` |
| `tailwind-merge` | `3.6.0` | `oxlint-tsgolint` | `7.0.2001` |
| `three` | `^0.185.1` | `tailwindcss` | `4.2.1` |
| `tw-animate-css` | `1.4.0` | `typescript` | `5.9.3` |
| `vinext` | `1.0.0-beta.9` | `vite` | `8.2.2` |

`package.json` 另声明 Node.js `>=22.13.0` 和 `sharp` override `0.35.4`；原仓库 README 与 Pages 工作流实际使用 Node.js 24。

`README.md` 指定 Node.js 24、`npm ci`、`npm run dev`。`npm run build:pages` 调用 `scripts/build-pages.mjs`，生成 `out/`；`.github/workflows/pages.yml` 发布到 GitHub Pages。`next.config.ts` 使用静态导出和 `NEXT_PUBLIC_BASE_PATH` 适配仓库子路径。构建脚本含广西大学文案与数据校验，场景替换时须同步改为中石大校验。

由于浏览器对 `file://` 模块与 `fetch` 有限制，**保留原仓库架构与“直接双击本地打开”无法同时成立**。交付采用与原仓库相同的本地服务器和 Pages 静态部署方式，生成的 `out/index.html` 也应通过本地 HTTP 服务预览。

## 5. 与需求文字的差异

用户描述的“原版第一人称 WASD + Shift + 碰撞”“四档光影平滑过渡”“五项图层”“右侧上下平移按钮”均与该提交现有实现不同。后续用户明确要求重新设计白红面板，并加入全景观看和第一视角漫游，因此这两项是中石大版新增交互，并非原 demo 的 1:1 复刻。原仓库光照参数与静态切换方式仍保留；图层、右侧工具和巡游基于原代码继续工作。
