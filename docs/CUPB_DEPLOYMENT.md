# 中石大模型接入与部署手册

本项目沿用原仓库的 React、Three.js、Vinext 和 GitHub Pages 静态导出流程。开发时通过本地 HTTP 服务访问；浏览器直接双击 `index.html` 形成的 `file://` 页面无法可靠加载模块、JSON 和 GLB。

## 1. 放置模型与检查坐标

模型路径在 `lib/campus/cupb-config.ts` 的 `model.url` 中编辑。替换或改名后运行 `python scripts/prepare-cupb-data.py`；若文件名不是默认的 `campus.glb`，指定 `--model public/models/cupb/你的文件.gltf`。脚本会更新 `public/data/models.json` 的 URL、字节数、SHA-256 缓存键和模型覆盖范围。随后运行 `node scripts/test-cupb-integration.mjs`，确认清单路径与配置一致。脚本不会改写 `cupb-config.ts`；地标和巡游以该配置对象为运行时唯一来源，`public/data/landmarks.json` 只是同源 GeoJSON 生成的初始参考快照。新模型应保留原点、米制比例、X 东/Z 南轴向；若这些改变，须同时校正地标。

把昌平校区的整体模型放在 `public/models/cupb/campus.glb`。该目录中的文件在浏览器端以项目资源路径加载；不要把它放进 `app/`、`lib/` 或构建产物 `out/`。模型使用 `.gltf` 时，还须把其引用的 `.bin` 和纹理一起放在可访问的相对路径下，并在配置中改用对应文件名。

场景适配参数集中在 `lib/campus/cupb-config.ts`。根据模型导出的坐标系，核对单位、地面高度、北向、整体位置和缩放；随后在同一个配置对象中修改初始镜头、地标坐标与巡游顺序。此处的坐标须与实际 GLB 一致。旧 HTML 的 `0–100` 局部坐标和广西大学数据坐标不能直接复用。

推荐先在建模软件中核对三个可辨认的控制点（例如图书馆、主楼、操场），再填写配置。现有参考资料可用于判读相对位置，但不等于测绘坐标。模型需要呈现建筑、道路、植被和水体时，以你导出的模型资产为准，不要运行原仓库的广西大学离线建模脚本来重建中石大。

## 2. 修改地标与巡游

当前 22 个地标包含图书馆、教学楼、体育馆、操场、宿舍组代表点和具名实验室。第一/第二教学楼在这份模型的同源数据中没有可核对点位，因此未编造标签。

全景镜头与第一视角起点、眼高、速度均在 `lib/campus/cupb-config.ts` 的 `overview`、`walk` 字段配置。换模型后先核实起点落在可通行地面，第一视角建筑阻挡使用同源 GeoJSON 足迹；模型覆盖矩形只是运行边界，不代表实测校界。

打开 `lib/campus/cupb-config.ts`，在中石大配置对象中维护地标名称、位置、标签锚点、参考机位和巡游顺序。每次调整后，检查标签是否落在建筑上方、点击后镜头是否能完整看到目标、巡游是否跳到预期站点。

原版巡游不是自由曲线或独立飞行路径：它按地标顺序逐站聚焦。保留原版节奏时，站间相机动画约为 1.3 秒，每站停留约 8.5 秒。配置中的巡游节点应为模型坐标系下已核实的地标；若尚未提供某栋建筑的位置，先不要把它作为已确认点位发布。

原版 UI 有八个图层开关。当前 `campus.glb` 虽是合并网格，但适配代码按原模型脚本的固定顶点色重排三角形索引，因而能分别隐藏建筑、道路、植被、水体、运动面；地面始终显示。此处理只复用原模型几何，不重新生成建筑。后续模型若没有该类别顶点色，可按建筑/道路/植被/水体/运动场为节点命名，加载器会按节点名称控制图层。完全合并且不带类别色或语义节点的模型无法单独开关图层。边界为模型覆盖矩形，不是实测校界；周边建筑没有独立语义层。

## 3. 本地启动

页面有“全景观看 / 第一视角”模式切换。全景可拖拽旋转、滚轮缩放并使用巡游；第一视角在桌面用 WASD 移动、Shift 加速、按住鼠标左键拖拽转向，Home 返回全景。触屏端使用画面上的四向按钮按住移动，并在场景画布上拖拽转向。点击地标会退出第一视角并聚焦该地点。复杂山地模型需要单独复核坡地地面碰撞。

使用 Node.js 24，在项目根目录运行：

Windows 也可双击项目根目录的 `open-campus.cmd`。启动文件自动构建并打开浏览器，页面效果与 `npm run preview` 一致；服务窗口需要保持打开。这是单击打开的本地入口，直接用 `file://` 打开 HTML 仍不支持模型资源加载。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。修改 `public/` 下的 GLB 或配置后，刷新页面并查看浏览器开发者工具的 Network 与 Console。运行静态构建检查：

```sh
npm run typecheck
npm run build:pages
npm run preview
```

静态文件生成在 `out/`；本项目仓库为 [`s-y-h123/cupd-compus-3d`](https://github.com/s-y-h123/cupd-compus-3d)，本地静态预览地址为 `http://127.0.0.1:4300/cupd-compus-3d/`。`npm run preview` 通过 HTTP 提供静态文件，直接打开 `out/index.html` 不会得到相同效果。

## 4. 发布到 GitHub Pages

`.github/workflows/pages.yml` 在推送 `main` 后执行检查、运行 `npm run build:pages`，上传 `out/` 并发布 Pages。当前仓库的 `AGENTS.md` 规定常规开发在 `dev` 分支进行，发布到 `main` 需要明确授权。首次发布时，在 [项目仓库](https://github.com/s-y-h123/cupd-compus-3d) 的 Settings → Pages 中启用 **GitHub Actions** 作为来源。预期在线地址为 [`https://s-y-h123.github.io/cupd-compus-3d/`](https://s-y-h123.github.io/cupd-compus-3d/)；以部署完成后 GitHub 显示的地址为准。

Pages 子路径由 `scripts/build-pages.mjs` 中的 `PAGES_BASE_PATH` 和仓库名确定。当前仓库使用 `/cupd-compus-3d` 前缀；若将项目改名，须重新构建并核对脚本、模型和数据请求的前缀。构建后确认 `out/models/cupb/campus.glb` 存在；发布完成再从实际 Pages 地址访问一次，并在 Network 面板确认模型请求成功。

## 5. 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| 替换模型后仍显示旧版或进度不准 | 重新运行数据准备脚本，刷新 `models.json` 的字节数和 SHA-256，再构建并检查浏览器/CDN 缓存。 |
| 模型请求 404 | 检查 `public/models/cupb/campus.glb` 的文件名大小写、配置路径、构建产物中的同名文件，以及 Pages 仓库子路径。用浏览器 Network 面板看实际请求 URL。 |
| `file://` 打开后空白或报跨域 | 使用 `npm run dev` 或 `npm run preview` 提供 HTTP 服务；不要直接双击构建文件。 |
| 外部纹理、`.bin` 或 Draco 解码失败 | `.gltf` 的外部文件须与其相对路径一起发布；压缩 GLB 要能从页面资源前缀访问到原仓库的 Draco 解码器。查看 Console 中的具体资源 URL。 |
| GLB 加载失败 | 页面应显示错误并启用当前适配实现中的简易占位几何体。先核对文件是否完整、浏览器是否支持 WebGL 2、GLB 是否能被 Three.js 解析；占位几何只用于保持页面可操作，不代表校园实景。 |
| 标签或镜头明显错位 | 重新核对模型单位、北向、原点及 `cupb-config.ts` 的同一坐标系。不要仅调整单个地标来掩盖全局缩放或轴向错误。 |
| 某个图层开关不能单独隐藏 | 核对新 GLB 的顶点色是否仍与 `scene.ts` 的类别色表相同；不同时导出按类别命名的独立节点。当前周边建筑图层没有可分离资产。 |
| 帧率低或加载慢 | 先检查 GLB 体积、三角面数量、纹理尺寸和 Draw Calls；使用原版自动画质，必要时在源模型端生成 LOD 或拆分远景。精细模式的阴影与后处理开销更高。 |

部署前请按 `README.md` 中的原仓库许可与数据署名要求处理代码、模型和地理数据。你自行加入的照片和模型应另行确认使用权。
