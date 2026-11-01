# 中国石油大学（北京）昌平校区三维地图

项目仓库：[s-y-h123/cupd-compus-3d](https://github.com/s-y-h123/cupd-compus-3d)。本项目在原开源校园三维地图的 dev 分支基础上接入中石大校园模型与地理数据，沿用其 React、Three.js 场景、光照与静态发布管线。中石大版使用白色与红色的新控制台，并增加全景观看和第一视角漫游。原项目版权声明保留在 [LICENSE](LICENSE)。

## 已接入内容

- **public/models/cupb/campus.glb**：用户现有的昌平校区整体模型。页面优先加载它；失败时显示简易几何占位并允许重试。
- **data/cupb/**：用户现有 GeoJSON；**public/data/** 提供与模型同坐标系的建筑、道路、地标和小地图数据。
- **lib/campus/cupb-config.ts**：模型入口、初始机位、22 个同源定位地标及游览顺序。地标未覆盖的建筑不能仅凭名称估计坐标。
- 合并模型按原资产的顶点色分离图层可见性；若替换模型时丢失类别顶点色，应改用语义节点分层。
- 全景观看可拖拽旋转、缩放和逐站巡游；第一视角支持桌面 WASD/Shift、鼠标拖拽转向及移动端方向键。漫游使用同源建筑多边形和模型覆盖范围阻挡穿越。

模型范围线是**模型覆盖矩形**，不是实测校园边界。地图位置和建筑轮廓来自用户提供的素材，个别高度、名称与近景机位仍需现场核验。

## 本地运行

建议 Node.js 24；项目声明支持 Node.js >=22.13.0。

Windows 可直接双击 **open-campus.cmd**。它会在首次运行时安装原项目依赖、构建静态页面、启动本地服务并打开浏览器。预览服务的命令窗口需保持打开；再次双击会复用已运行的服务。

    npm ci
    npm run dev

浏览器打开终端显示的地址。直接双击生成的 index.html 以 file:// 打开，无法可靠加载 JSON 与 GLB。静态发布前运行：

    npm run typecheck
    npm run lint
    node scripts/test-cupb-integration.mjs
    npm run build:pages
    npm run preview

构建输出在 **out/**，由 **.github/workflows/pages.yml** 发布到本项目的 GitHub Pages。仓库发布地址预计为 [s-y-h123.github.io/cupd-compus-3d](https://s-y-h123.github.io/cupd-compus-3d/)；以 GitHub Actions 部署成功后显示的地址为准。

## 文档

1. [原仓库结构分析与关键代码定位](docs/CUPB_REPOSITORY_ANALYSIS.md)
2. [模型、点位修改与部署手册](docs/CUPB_DEPLOYMENT.md)
3. [后续迭代清单](docs/CUPB_NEXT_STEPS.md)

第一视角按 Home 可返回全景。当前模型的地面基本平坦；若替换成高差复杂的山地模型，需要额外提供可信的地形碰撞层以复核坡地行走。原仓库四档光影仍沿用原参数与切换方式。

源仓库代码与资产的许可见 [LICENSE](LICENSE) 和[第三方说明](licenses/THIRD_PARTY.md)。OpenStreetMap 派生数据保留 **© OpenStreetMap contributors** 署名；用户自行加入的模型与照片应分别核对授权。
