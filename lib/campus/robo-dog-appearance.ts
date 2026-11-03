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
      material.emissive.copy(accent).multiplyScalar(.06);
      material.needsUpdate = true;
    }
  };
}
