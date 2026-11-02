# China University of Petroleum (Beijing) Campus 3D Map

[简体中文](README.md) · **English**

Project repository: [s-y-h123/cupd-compus-3d](https://github.com/s-y-h123/cupd-compus-3d). This version generates the buildings from CUPB coordinates and uses the road surface extracted from the original campus GLB. It retains the existing React and Three.js interactions, white dashboard with red accents, and overview and first-person modes. The original source copyright notice remains in [LICENSE](LICENSE).

## Features

- Generate varied facades, trees, a running track, and pedestrians from the supplied coordinate data. Roads are loaded from `original-roads.glb`, extracted from the original `campus.glb`.
- Search buildings and 22 verified landmarks, focus a place, and follow the guided tour.
- Switch independently between morning, day, dusk, and night lighting and clear, cloudy, rain, or haze weather with keys 1–4; adjust layers and rendering quality.
- A north–south rectangular fountain sits in the central open area south of the library, alongside a schematic wall around the model coverage rectangle. The existing north, east, and south gate leaves can be toggled with `setGateOpen(name, open)`. Fountain proportions follow the annotated overhead view; see the deployment guide.
- Orbit and zoom in panorama mode. In first-person mode, move with WASD, hold Shift to run, drag to look around, and press Home to return to panorama. Touch screens provide a direction pad.
- Use building footprint and model boundary checks to limit first-person movement.

The model boundary is its coverage rectangle, not a surveyed campus boundary. Some names, heights, and close-up views still need on-site verification. The current ground is nearly flat; a future terrain model with significant elevation changes needs a dedicated collision layer.

## Run locally

Node.js 24 is recommended; the package supports Node.js 22.13 or newer. On Windows, double-click `open-campus.cmd` to build and open a local preview. Keep the preview server window open.

```sh
git clone https://github.com/s-y-h123/cupd-compus-3d.git
cd cupd-compus-3d
npm ci
npm run dev
```

Open the address printed by the dev server. Directly opening `index.html` through `file://` cannot reliably load the JSON and JavaScript assets. For a static preview:

```sh
npm run typecheck
npm run lint
node scripts/test-cupb-integration.mjs
npm run build:pages
npm run preview
```

The static output is in `out/`. The expected GitHub Pages URL is [s-y-h123.github.io/cupd-compus-3d](https://s-y-h123.github.io/cupd-compus-3d/); use the address reported by GitHub Actions after deployment.

## Data and documentation

The scene is generated from `public/data/buildings.json` and `public/data/infrastructure-map.json`. Camera positions, landmarks, and tour order are configured in `lib/campus/cupb-config.ts`. A future robot dog GLB can be loaded through `SceneController.loadRoboDog(modelUrl)`. See the Chinese [deployment and asset guide](docs/CUPB_DEPLOYMENT.md), [repository analysis](docs/CUPB_REPOSITORY_ANALYSIS.md), and [next steps](docs/CUPB_NEXT_STEPS.md).

The source code and retained assets follow the notices in [LICENSE](LICENSE) and [third-party notices](licenses/THIRD_PARTY.md). OpenStreetMap-derived data retains **© OpenStreetMap contributors** attribution. Verify rights separately for user-supplied models and photos.
