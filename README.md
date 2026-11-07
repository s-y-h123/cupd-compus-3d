# 中国石油大学（北京）昌平校区三维地图

项目仓库：[s-y-h123/cupd-compus-3d](https://github.com/s-y-h123/cupd-compus-3d)。本项目沿用原开源校园地图的 React、Three.js 交互与静态发布管线，以中石大同源矢量数据生成建筑和绿化，道路采用原校园 GLB 中的路面。白红控制台保留全景、第一视角与 22 地点导览。原项目版权声明保留在 [LICENSE](LICENSE)。

## 已接入内容

- **lib/campus/procedural-campus.ts**：按 100 栋建筑足迹生成不同立面、树阵、跑道和行人；路面加载从原 `campus.glb` 提取的 `original-roads.glb`。
- **public/data/**：建筑、地标和小地图数据；`pedestrian-routes.json` 包含沿原模型路面计算的南北校区 22 条行人路线，不生成新道路。
- **lib/campus/cupb-config.ts**：初始机位、22 个同源定位地标及游览顺序。地标未覆盖的建筑不能仅凭名称估计坐标。
- 天气可用面板或键盘 1–4 切换晴日、阴天、雨天、雾霾；清晨、白天、黄昏、夜晚可独立切换，例如雨夜与清晨雨天。机器狗容器初始为空，仅显式调用 `loadRoboDog(modelUrl)` 才加载真实模型。
- 右上角行人按钮展开人数（0–180）、速度（0–3 倍）和路线显示控件；初始 96 人。路线可用 `python scripts/prepare-pedestrian-routes.py` 按原路面与建筑足迹重新计算。
- 右上角机器狗面板可一键投放最多 4 只机器狗，按道路覆盖范围分配互异的南北校区巡检路线；也可逐只手动选路线。面板显示每只狗的状态、绕行次数和累计巡检里程。路遇行人或其他机器狗会等待，遇静态障碍只在原道路附近尝试安全绕行，找不到通路则报告受阻。当前没有接入异常识别模型。
- 图书馆南侧中央空地设置一处南北向长方形喷泉，并保留模型覆盖范围围墙；北门、东门、南门门扇可通过 `setGateOpen(name, open)` 控制。喷泉位置与比例参照俯视标注图，细节见部署手册。
- 全景观看可拖拽旋转、缩放和逐站巡游；第一视角支持桌面 WASD/Shift、鼠标拖拽转向及移动端方向键。漫游使用同源建筑多边形和模型覆盖范围阻挡穿越。

模型范围线是**模型覆盖矩形**，不是实测校园边界。地图位置和建筑轮廓来自用户提供的素材，个别高度、名称与近景机位仍需现场核验。

## 本地运行

建议 Node.js 24；项目声明支持 Node.js >=22.13.0。

Windows 可直接双击 **open-campus.cmd**。它会在首次运行时安装原项目依赖，每次打开前构建最新页面，在后台启动本地服务并打开浏览器；再次双击会复用已运行的服务。重启电脑后只需再次双击。启动文件必须留在项目根目录，桌面应放它的快捷方式，不能把 `.cmd` 本体移走。不要只收藏 `127.0.0.1` 地址：本地服务未运行时，单独打开地址会显示“无法访问此网站”。

    npm ci
    npm run dev

浏览器打开终端显示的地址。直接双击生成的 index.html 以 file:// 打开，无法可靠加载 JSON。静态发布前运行：

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

第一视角按 Home 可返回全景。当前生成场景地面平坦；若加入高差复杂的地形，需要额外提供地形碰撞层。立面、雨天积水与植被按现有数据做示意性还原，并非实测或照片级复刻。

源仓库代码与资产的许可见 [LICENSE](LICENSE) 和[第三方说明](licenses/THIRD_PARTY.md)。OpenStreetMap 派生数据保留 **© OpenStreetMap contributors** 署名；用户自行加入的模型与照片应分别核对授权。
