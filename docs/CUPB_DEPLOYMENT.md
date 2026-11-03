# 中石大几何场景与部署手册

本项目沿用原仓库的 React、Three.js、Vinext 和 GitHub Pages 静态导出流程。开发时通过本地 HTTP 服务访问；直接用 `file://` 打开构建文件无法可靠加载模块和 JSON。

## 1. 场景数据与坐标

运行时由 `lib/campus/procedural-campus.ts` 从 `public/data/buildings.json` 生成建筑、绿化和行人，道路只加载 `public/models/cupb/original-roads.glb`。该路面由 `scripts/extract_cupb_roads.py` 从原 `campus.glb` 提取；`public/data/pedestrian-routes.json` 是沿原路面、绕开建筑和中央喷泉预计算的南北校区行走路线，机器狗巡检也复用这些已连通路段。`infrastructure-map.json` 的路径仅用于道路沿线树灯布置，不绘制路面。修改行人目标地点可编辑 `scripts/prepare-pedestrian-routes.py` 的 `PAIRS`，然后运行此脚本。修改已有建筑轮廓则更新同源 GeoJSON 后运行 `python scripts/prepare-cupb-data.py`。

机器狗模型位于 `public/models/cupb/robot-dog.glb`，约 13 MB。来源是用户提供的 FBX，转为 Three.js 可直接加载的 Draco 压缩 GLB；网格和材质保留。源文件没有骨骼动画，当前使用模型中四条腿的独立部件生成程序化步态。校园加载完成后自动载入机器狗；右上角机器狗面板可选择六条路线，开始、暂停、继续和结束巡检，调节速度并跟随镜头。路线及停留秒数在 `lib/campus/cupb-config.ts` 的 `patrolRoutes` 中，必须使用 `public/data/pedestrian-routes.json` 内已连通的路段。到达每个检查点停留 10 秒，转弯时先原地转身。当前没有真实传感器或自动异常识别，检查点仅表示演示中的停留位置。

场景配置集中在 `lib/campus/cupb-config.ts`。坐标为米制 X 东、Z 南，地标、建筑和道路须同源。旧 HTML 的 `0–100` 局部坐标不能直接复用。

建议以图书馆、主楼、操场至少三个控制点核对坐标。立面风格和人流是规则化示意，不等于逐栋实测。若更新原 `campus.glb`，运行 `python scripts/extract_cupb_roads.py` 重新提取路面，再执行静态构建。

景观放在 `lib/campus/site-elements.ts`；篮球场、网球场及其围网、灯柱已从场景中移除。原 `(273,110)` 圆形喷泉和 `(81.5,-0.5)` 青年园小水池已删除。现有唯一喷泉位于图书馆南侧中央空地，中心约 `(76,116)`（X 东、北向坐标），水池外框约宽 36 米、南北长 84 米，按用户俯视标注图换算；其造型参考旧 HTML 的长方形浅水池及三处纵向喷水点，尺寸仍需实测核验。

原先附加的 V1–V3、H1–H4 网格道路、球场环道和楼前连接步道已移除，道路以原校园 GLB 路面为准。覆盖范围围墙沿现有模型矩形外框生成，矩形**不是实测校界**。已知北门、东门、南门的门体放在当前数据点位；东门继续使用 `(321.597,114.713)`，与用户提供的地图截图方位一致。外框上的对应开口是投影示意，不能视作真实门墙连接。南校区北门尚无可核对米制坐标；用户要求本轮不放西南门，因此这两处均未新增门体和标签。

## 2. 修改地标与巡游

当前 22 个地标包含图书馆、教学楼、体育馆、操场、宿舍组代表点和具名实验室。第一/第二教学楼在这份模型的同源数据中没有可核对点位，因此未编造标签。

全景镜头与第一视角起点、眼高、速度均在 `lib/campus/cupb-config.ts` 的 `overview`、`walk` 字段配置。换模型后先核实起点落在可通行地面，第一视角建筑阻挡使用同源 GeoJSON 足迹；模型覆盖矩形只是运行边界，不代表实测校界。

打开 `lib/campus/cupb-config.ts`，在中石大配置对象中维护地标名称、位置、标签锚点、参考机位和巡游顺序。每次调整后，检查标签是否落在建筑上方、点击后镜头是否能完整看到目标、巡游是否跳到预期站点。

原版巡游不是自由曲线或独立飞行路径：它按地标顺序逐站聚焦。保留原版节奏时，站间相机动画约为 1.3 秒，每站停留约 8.5 秒。配置中的巡游节点应为模型坐标系下已核实的地标；若尚未提供某栋建筑的位置，先不要把它作为已确认点位发布。

左侧八项图层继续使用；新生成场景将建筑、道路、植被、运动面、行人分别放入独立 Group。雨天湿路面随道路图层隐藏。边界是模型资料覆盖矩形，不是实测校界。环境页的天气和时间段独立切换；键盘 1 晴日、2 阴天、3 雨天、4 雾霾，四种天气均可搭配清晨、白天、黄昏、夜晚。

## 3. 本地启动

页面有“全景观看 / 第一视角”模式切换。全景可拖拽旋转、滚轮缩放并使用巡游；第一视角在桌面用 WASD 移动、Shift 加速、按住鼠标左键拖拽转向，Home 返回全景。触屏端使用画面上的四向按钮按住移动，并在场景画布上拖拽转向。点击地标会退出第一视角并聚焦该地点。复杂山地模型需要单独复核坡地地面碰撞。

使用 Node.js 24，在项目根目录运行：

Windows 也可双击项目根目录的 `open-campus.cmd`。启动文件自动构建、在后台启动本地预览服务并打开浏览器，页面效果与 `npm run preview` 一致。启动文件须留在项目根目录；要从桌面打开，请创建指向它的快捷方式。重启电脑后再次双击即可；不要单独依赖旧的 `127.0.0.1` 收藏地址。直接用 `file://` 打开 HTML 仍不支持数据加载。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。修改场景配置或 GeoJSON 后刷新页面，并查看浏览器开发者工具的 Network 与 Console。运行静态构建检查：

```sh
npm run typecheck
npm run build:pages
npm run preview
```

静态文件生成在 `out/`；本项目仓库为 [`s-y-h123/cupd-compus-3d`](https://github.com/s-y-h123/cupd-compus-3d)。双击启动文件优先使用 `http://127.0.0.1:4301/cupd-compus-3d/`，若端口已被其他程序占用会自动选择 4302–4305 并打开正确地址；手工 `npm run preview` 默认使用 4300。两种方式都通过 HTTP 提供静态文件，直接打开 `out/index.html` 不会得到相同效果。给别人查看时发送完成部署的 HTTPS 地址，`127.0.0.1` 只指向收件人自己的电脑。

## 4. 发布到 GitHub Pages

`.github/workflows/pages.yml` 在推送 `dev` 后执行检查、运行 `npm run build:pages`，上传 `out/` 并发布 Pages。这样遵守仓库 `AGENTS.md` 的开发分支规则，不需要更新 `main`。首次发布时，在 [项目仓库](https://github.com/s-y-h123/cupd-compus-3d) 的 Settings → Pages 中启用 **GitHub Actions** 作为来源。预期在线地址为 [`https://s-y-h123.github.io/cupd-compus-3d/`](https://s-y-h123.github.io/cupd-compus-3d/)；以部署完成后 GitHub 显示的地址为准。

Pages 子路径由 `scripts/build-pages.mjs` 中的 `PAGES_BASE_PATH` 和仓库名确定。当前仓库使用 `/cupd-compus-3d` 前缀；若将项目改名，须重新构建并核对脚本与数据请求的前缀。构建后确认 `out/data/buildings.json` 和 `out/data/infrastructure-map.json` 存在；发布完成再从实际 Pages 地址访问一次。旧校园 GLB 仍可能随历史资产打包，但页面不请求它。

## 5. 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| 修改建筑后仍显示旧版 | 重新运行数据准备脚本和静态构建，并清理浏览器/CDN 缓存；确认 `out/data/buildings.json` 已更新。 |
| 场景数据请求 404 | 检查 `public/data/buildings.json`、`public/data/infrastructure-map.json`、Pages 子路径和构建产物同名文件。 |
| `file://` 打开后空白或报跨域 | 使用 `npm run dev` 或 `npm run preview` 提供 HTTP 服务；不要直接双击构建文件。 |
| 机器狗 GLB/GLTF 加载失败 | 页面右上角会显示模型加载失败。检查 `models/cupb/robot-dog.glb` 及 `draco/` 解码资源是否可访问；校园场景仍可独立运行。 |
| 标签或镜头明显错位 | 重新核对 GeoJSON 米制单位、北向、原点及 `cupb-config.ts` 的同一坐标系。不要仅调整单个地标来掩盖全局缩放或轴向错误。 |
| 某个图层开关不能单独隐藏 | 核对 `procedural-campus.ts` 各 Group 的 `userData.layer` 与 `scene.ts` 图层映射。 |
| 帧率低或加载慢 | 检查 Draw Calls、阴影档位、窗口实例数、行人数量和雨粒数量；先使用原版自动画质。 |

部署前请按 `README.md` 中的原仓库许可与数据署名要求处理代码、模型和地理数据。你自行加入的照片和模型应另行确认使用权。
