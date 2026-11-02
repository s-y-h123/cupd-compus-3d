'use client';

import { useEffect, useRef, useState } from 'react';
import { Dog, PersonStanding, X } from 'lucide-react';
import * as THREE from 'three';
import { createWalkingPerson, setWalkingPose } from '@/lib/campus/pedestrian-model';
import type { Locale } from '@/lib/campus/i18n';
import { asset } from '@/lib/campus/boot';

type ModelTab = 'person' | 'dog';

export function CampusModelPreview({ locale, count, speed, showRoutes, dogStatus, dogModelUrl, onCountChange, onSpeedChange, onRoutesChange, onFocusDog }: {
  locale: Locale;
  count: number;
  speed: number;
  showRoutes: boolean;
  dogStatus: 'loading' | 'ready' | 'error';
  dogModelUrl: string;
  onCountChange: (count: number) => void;
  onSpeedChange: (speed: number) => void;
  onRoutesChange: (show: boolean) => void;
  onFocusDog: () => void;
}) {
  const [tab, setTab] = useState<ModelTab | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [dogPreviewError, setDogPreviewError] = useState(false);
  const en = locale === 'en';

  useEffect(() => {
    if (tab !== 'person' || !host.current) return;
    const node = host.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4f5f4');
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
    camera.position.set(2.7, 2.15, 4.7);
    camera.lookAt(0, 1.05, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    node.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b7b6af', 2));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(3, 6, 4); sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -4;
    sun.shadow.camera.right = sun.shadow.camera.top = 4;
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48),
      new THREE.MeshStandardMaterial({ color: '#d9dcda', roughness: .95 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const person = createWalkingPerson(0);
    scene.add(person);
    const resize = () => {
      const width = Math.max(1, node.clientWidth), height = Math.max(1, node.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node); resize();
    let frame = 0;
    const animate = (time: number) => {
      setWalkingPose(person, time * .006);
      person.rotation.y = -.35 + Math.sin(time * .0003) * .2;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      ground.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== 'dog' || dogStatus !== 'ready' || !host.current) return;
    const node = host.current;
    let disposed = false;
    let frame = 0;
    let model: THREE.Object3D | null = null;
    let decoder: import('three/addons/loaders/DRACOLoader.js').DRACOLoader | null = null;
    setDogPreviewError(false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dfe5e5');
    const camera = new THREE.PerspectiveCamera(38, 1, .01, 50);
    camera.position.set(1.8, 1.5, 3.4);
    camera.lookAt(.2, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    node.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#ffffff', '#9ca6aa', 2.3));
    const sun = new THREE.DirectionalLight('#ffffff', 2.4);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48),
      new THREE.MeshStandardMaterial({ color: '#d9dcda', roughness: .95 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const resize = () => {
      const width = Math.max(1, node.clientWidth), height = Math.max(1, node.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    void (async () => {
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/loaders/DRACOLoader.js'),
      ]);
      decoder = new DRACOLoader().setDecoderPath(asset('draco/'));
      const loaded = await new GLTFLoader().setDRACOLoader(decoder).loadAsync(dogModelUrl);
      if (disposed) return;
      const visual = loaded.scene;
      visual.rotation.x = -Math.PI / 2;
      visual.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(visual);
      const size = box.getSize(new THREE.Vector3());
      visual.scale.multiplyScalar(1.1 / Math.max(size.x, size.z));
      visual.updateMatrixWorld(true);
      box.setFromObject(visual);
      const center = box.getCenter(new THREE.Vector3());
      visual.position.set(-center.x, -box.min.y, -center.z);
      model = new THREE.Group();
      model.add(visual);
      scene.add(model);
      const animate = (time: number) => {
        if (model) model.rotation.y = -.35 + Math.sin(time * .00025) * .3;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    })().catch(() => { if (!disposed) setDogPreviewError(true); });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      decoder?.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [tab, dogStatus, dogModelUrl]);

  return (
    <div className="campus-model-preview">
      <div className="model-preview-launchers" aria-label={en ? 'Model previews' : '模型预览'}>
        <button type="button" className={tab === 'person' ? 'active' : ''}
          aria-label={en ? 'Open walking person model' : '打开行人模型'}
          aria-expanded={tab === 'person'} onClick={() => setTab(tab === 'person' ? null : 'person')}>
          <PersonStanding size={19} aria-hidden="true" />
        </button>
        <button type="button" className={tab === 'dog' ? 'active' : ''}
          aria-label={en ? 'Open robot dog 1 model slot' : '打开机器狗1模型接口'}
          aria-expanded={tab === 'dog'} onClick={() => setTab(tab === 'dog' ? null : 'dog')}>
          <Dog size={19} aria-hidden="true" />
        </button>
      </div>
      {tab && (
        <section className={`model-preview-panel${tab === 'dog' ? ' dog-preview-panel' : ''}`} aria-label={en ? 'Model preview' : '模型预览'}>
          <div className="model-preview-head">
            <strong>{tab === 'person' ? (en ? 'Walking person' : '行人模型') : (en ? 'Robot dog 1' : '机器狗1')}</strong>
            <button type="button" onClick={() => setTab(null)} aria-label={en ? 'Close model preview' : '关闭模型预览'}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {tab === 'person' ? <>
            <div className="model-preview-canvas" ref={host} />
            <div className="pedestrian-controls">
              <p>{en ? 'North and south campus walking routes' : '南北校区道路行走'}</p>
              <label htmlFor="pedestrian-count"><span>{en ? 'People' : '行人人数'}</span><output>{count}</output></label>
              <input id="pedestrian-count" type="range" min="0" max="180" step="4" value={count}
                onChange={event => onCountChange(Number(event.target.value))} />
              <label htmlFor="pedestrian-speed"><span>{en ? 'Walking speed' : '行走速度'}</span><output>{speed.toFixed(1)}×</output></label>
              <input id="pedestrian-speed" type="range" min="0" max="3" step="0.1" value={speed}
                onChange={event => onSpeedChange(Number(event.target.value))} />
              <label className="pedestrian-route-toggle">
                <input type="checkbox" checked={showRoutes} onChange={event => onRoutesChange(event.target.checked)} />
                <span>{en ? 'Show walking routes' : '显示行走路线'}</span>
              </label>
              <small>{en ? 'Set speed to 0 to pause walkers.' : '速度设为 0 可暂停行人。'}</small>
            </div>
          </> :
            dogStatus === 'error' || dogPreviewError ? <div className="model-preview-empty">
              <Dog size={26} aria-hidden="true" />
              <span>{en ? 'Model failed to load' : '模型加载失败'}</span>
            </div> : <>
              <div className="model-preview-canvas" ref={host} />
              {dogStatus === 'loading' && <div className="model-preview-loading">{en ? 'Loading robot dog…' : '正在加载机器狗…'}</div>}
              {dogStatus === 'ready' && <button type="button" className="dog-focus-button" onClick={onFocusDog}>{en ? 'View in campus' : '在校园中查看'}</button>}
            </>}
        </section>
      )}
    </div>
  );
}
