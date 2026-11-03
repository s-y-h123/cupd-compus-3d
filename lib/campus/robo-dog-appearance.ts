import * as THREE from 'three';

/** 只为机器狗的灰色不透明外壳克隆材质，保留关节、镜头和原始贴图细节。 */
export function createRoboDogPaint(root: THREE.Object3D) {
  const painted = new Map<THREE.MeshStandardMaterial, number>();
  const replacements = new Map<THREE.Material, THREE.Material>();
  const paintMaterial = (material: THREE.Material): THREE.Material => {
    const cached = replacements.get(material);
    if (cached) return cached;
    if (!(material instanceof THREE.MeshStandardMaterial) || material.transparent || material.opacity < .9) return material;
    const color = material.color;
    const brightest = Math.max(color.r, color.g, color.b);
    const darkest = Math.min(color.r, color.g, color.b);
    // GLTFLoader 已把源模型的灰色 sRGB 转为线性值；彩色指示器和深灰关节不修改。
    if (brightest - darkest > .05 || brightest < .11 || brightest > .55) return material;
    const clone = material.clone();
    painted.set(clone, brightest);
    replacements.set(material, clone);
    return clone;
  };
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(paintMaterial)
      : paintMaterial(object.material);
  });
  return (hex: string) => {
    const accent = new THREE.Color(hex);
    for (const [material, shade] of painted) {
      material.color.copy(accent).multiplyScalar(.82 + shade * .7);
      // 只增强机器狗外壳的自发光，不让灯光改变校园模型的颜色。
      material.emissive.copy(accent).multiplyScalar(.3);
      material.needsUpdate = true;
    }
  };
}

/** 全景定位光环：面向相机、保持约 40px，近距离和第一视角自动隐藏。 */
export function createRoboDogBeacon(root: THREE.Object3D, hex: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('机器狗定位光环无法创建');
  const glow = context.createRadialGradient(64, 64, 7, 64, 64, 60);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(.24, 'rgba(255,255,255,.85)');
  glow.addColorStop(.45, 'rgba(255,255,255,.38)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 128, 128);
  context.beginPath();
  context.arc(64, 64, 30, 0, Math.PI * 2);
  context.lineWidth = 5;
  context.strokeStyle = 'rgba(255,255,255,.95)';
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture, color: hex, transparent: true, depthTest: false,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const marker = new THREE.Sprite(material);
  marker.name = 'roboDogBeacon';
  marker.position.set(0, 3.1, 0);
  marker.renderOrder = 100;
  const coreCanvas = document.createElement('canvas');
  coreCanvas.width = coreCanvas.height = 32;
  const coreContext = coreCanvas.getContext('2d');
  if (!coreContext) throw new Error('机器狗定位光点无法创建');
  coreContext.fillStyle = '#fff';
  coreContext.beginPath();
  coreContext.arc(16, 16, 12, 0, Math.PI * 2);
  coreContext.fill();
  const coreTexture = new THREE.CanvasTexture(coreCanvas);
  const coreMaterial = new THREE.SpriteMaterial({
    map: coreTexture, color: '#fff', transparent: true, depthTest: false,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const core = new THREE.Sprite(coreMaterial);
  core.name = 'roboDogBeaconCore';
  core.position.set(0, 3.11, 0);
  core.renderOrder = 101;
  root.add(marker, core);
  const worldPosition = new THREE.Vector3();
  return {
    setColor(color: string) { material.color.set(color); },
    update(camera: THREE.Camera, time: number, firstPerson: boolean) {
      root.getWorldPosition(worldPosition);
      const distance = camera.position.distanceTo(worldPosition);
      marker.visible = !firstPerson && distance > 24;
      core.visible = marker.visible;
      if (!marker.visible) return;
      const viewHeight = camera instanceof THREE.PerspectiveCamera
        ? 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
        : camera instanceof THREE.OrthographicCamera ? (camera.top - camera.bottom) / camera.zoom : 20;
      marker.scale.setScalar(viewHeight * .085);
      core.scale.setScalar(viewHeight * .016);
      material.opacity = .82 + .13 * Math.sin(time * .004);
    },
    dispose() {
      root.remove(marker, core);
      material.dispose(); texture.dispose(); coreMaterial.dispose(); coreTexture.dispose();
    },
  };
}
