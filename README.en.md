# China University of Petroleum (Beijing) Campus 3D Map

[简体中文](README.md) · **English**

Project repository: [s-y-h123/cupd-compus-3d](https://github.com/s-y-h123/cupd-compus-3d). This project adapts an open-source Three.js campus map to the Changping campus of China University of Petroleum (Beijing), using a CUPB GLB model and matching geographic data. The interface uses a white dashboard with red accents and includes panorama and first-person viewing modes. The original source copyright notice remains in [LICENSE](LICENSE).

## Features

- Load `public/models/cupb/campus.glb` as the campus scene, with simple geometry as a fallback if loading fails.
- Search buildings and 22 verified landmarks, focus a place, and follow the guided tour.
- Switch between morning, day, dusk, and night lighting; adjust layers and rendering quality.
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

Open the address printed by the dev server. Directly opening `index.html` through `file://` cannot reliably load the JSON and GLB assets. For a static preview:

```sh
npm run typecheck
npm run lint
node scripts/test-cupb-integration.mjs
npm run build:pages
npm run preview
```

The static output is in `out/`. The expected GitHub Pages URL is [s-y-h123.github.io/cupd-compus-3d](https://s-y-h123.github.io/cupd-compus-3d/); use the address reported by GitHub Actions after deployment.

## Data and documentation

The GLB model belongs in `public/models/cupb/`. Model coordinates, camera positions, landmarks, and tour order are configured in `lib/campus/cupb-config.ts`. See the Chinese [deployment and asset guide](docs/CUPB_DEPLOYMENT.md), [repository analysis](docs/CUPB_REPOSITORY_ANALYSIS.md), and [next steps](docs/CUPB_NEXT_STEPS.md).

The source code and retained assets follow the notices in [LICENSE](LICENSE) and [third-party notices](licenses/THIRD_PARTY.md). OpenStreetMap-derived data retains **© OpenStreetMap contributors** attribution. Verify rights separately for user-supplied models and photos.
