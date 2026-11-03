'use client';

import { useEffect, useRef, useState } from 'react';
import { Dog, PersonStanding, X } from 'lucide-react';
import * as THREE from 'three';
import { createWalkingPerson, setWalkingPose } from '@/lib/campus/pedestrian-model';
import type { Locale } from '@/lib/campus/i18n';
import { createRoboDogPaint } from '@/lib/campus/robo-dog-appearance';
import type { PatrolRouteDefinition, PatrolSnapshot } from '@/lib/campus/robo-dog-patrol';

type ModelTab = 'person' | 'dog';

export function CampusModelPreview({ locale, count, speed, showRoutes, dogStatus, dogProgress, getDogPreview, dogSpeed, dogColor, dogFirstPerson, dogPatrol, patrolRoutes, onCountChange, onSpeedChange, onRoutesChange, onFocusDog, onDogFirstPersonChange, onDogSpeedChange, onDogColorChange, onStartPatrol, onPausePatrol, onResumePatrol, onStopPatrol, onRetryDog }: {
  locale: Locale;
  count: number;
  speed: number;
  showRoutes: boolean;
  dogStatus: 'loading' | 'ready' | 'error';
  dogProgress: number | null;
  getDogPreview: () => THREE.Object3D | null;
  dogSpeed: number;
  dogColor: string;
  dogFirstPerson: boolean;
  dogPatrol: PatrolSnapshot;
  patrolRoutes: PatrolRouteDefinition[];
  onCountChange: (count: number) => void;
  onSpeedChange: (speed: number) => void;
  onRoutesChange: (show: boolean) => void;
  onFocusDog: () => void;
  onDogFirstPersonChange: () => void;
  onDogSpeedChange: (speed: number) => void;
  onDogColorChange: (color: string) => void;
  onStartPatrol: (id: string) => void;
  onPausePatrol: () => void;
  onResumePatrol: () => void;
  onStopPatrol: () => void;
  onRetryDog: () => void;
}) {
  const [tab, setTab] = useState<ModelTab | null>(null);
  const [selectedPatrol, setSelectedPatrol] = useState(patrolRoutes[0]?.id ?? '');
  const host = useRef<HTMLDivElement>(null);
  const [dogPreviewError, setDogPreviewError] = useState(false);
  const [dogPreviewLoading, setDogPreviewLoading] = useState(false);
  const patrolStatusRef = useRef(dogPatrol.status);
  useEffect(() => { patrolStatusRef.current = dogPatrol.status; }, [dogPatrol.status]);
  const dogColorRef = useRef(dogColor);
  const paintRef = useRef<((hex: string) => void) | null>(null);
  useEffect(() => { dogColorRef.current = dogColor; paintRef.current?.(dogColor); }, [dogColor]);
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
    let visual: THREE.Object3D | null = null;
    let updateGait: ((dt: number, motion: 'idle' | 'walking' | 'turning') => void) | null = null;
    setDogPreviewError(false);
    setDogPreviewLoading(true);
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
      visual = getDogPreview();
      if (!visual) throw new Error('机器狗模型尚未准备好');
      // 复用场景中的几何体，仅复制材质，预览不再重复下载与解码 GLB。
      visual.traverse(object => {
        if (object instanceof THREE.Mesh)
          object.material = Array.isArray(object.material)
            ? object.material.map(material => material.clone())
            : object.material.clone();
      });
      const hips = [0, 1, 2, 3].map(i => visual?.getObjectByName(`roboDogHip${i}`));
      const knees = [0, 1, 2, 3].map(i => visual?.getObjectByName(`roboDogKnee${i}`));
      if (hips.every(Boolean) && knees.every(Boolean)) {
        let phase = 0, blend = 0;
        const idleHeight = visual.position.y;
        updateGait = (dt, motion) => {
          const target = motion === 'walking' ? 1 : motion === 'turning' ? .55 : 0;
          blend += (target - blend) * Math.min(1, dt * 7);
          if (motion !== 'idle') phase += dt * (motion === 'turning' ? 5 : 8);
          for (let i = 0; i < 4; i++) {
            const wave = Math.sin(phase + (i === 0 || i === 3 ? 0 : Math.PI));
            hips[i]!.rotation.x = wave * .27 * blend;
            knees[i]!.rotation.x = Math.max(0, -wave) * .34 * blend;
          }
          visual!.position.y = idleHeight + Math.abs(Math.sin(phase * 2)) * .012 * blend;
        };
      }
      paintRef.current = createRoboDogPaint(visual);
      paintRef.current(dogColorRef.current);
      model = new THREE.Group();
      model.add(visual);
      scene.add(model);
      setDogPreviewLoading(false);
      let lastTime = 0;
      const animate = (time: number) => {
        const dt = lastTime ? Math.min(.08, (time - lastTime) / 1000) : 0;
        lastTime = time;
        updateGait?.(dt, patrolStatusRef.current === 'walking' ? 'walking' : patrolStatusRef.current === 'turning' ? 'turning' : 'idle');
        if (model) model.rotation.y = -.35 + Math.sin(time * .00025) * .3;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    })().catch(() => { if (!disposed) { setDogPreviewLoading(false); setDogPreviewError(true); } });
    return () => {
      disposed = true;
      paintRef.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      visual?.traverse(object => {
        if (object instanceof THREE.Mesh) {
          if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
          else object.material.dispose();
        }
      });
      ground.geometry.dispose();
      ground.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [tab, dogStatus, getDogPreview]);

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
            dogStatus === 'error' ? <div className="model-preview-empty">
              <Dog size={26} aria-hidden="true" />
              <span>{en ? 'Model failed to load' : '模型加载失败'}</span>
              <button type="button" className="dog-retry-button" onClick={onRetryDog}>{en ? 'Retry' : '重新加载'}</button>
            </div> : dogStatus === 'loading' ? <output className="model-preview-empty">
              <Dog size={26} aria-hidden="true" />
              <span>{dogProgress === 1 ? (en ? 'Preparing the model…' : '正在解析模型…') : dogProgress !== null ? (en ? `Downloading model ${Math.round(dogProgress * 100)}%` : `下载模型 ${Math.round(dogProgress * 100)}%`) : (en ? 'Loading robot dog…' : '正在加载机器狗…')}</span>
              {dogProgress !== null && <progress max="1" value={dogProgress} aria-label={en ? 'Robot dog download progress' : '机器狗下载进度'} />}
            </output> : dogPreviewError ? <div className="model-preview-empty">
              <Dog size={26} aria-hidden="true" />
              <span>{en ? 'Preview failed to load' : '模型预览加载失败'}</span>
              <button type="button" className="dog-retry-button" onClick={() => { setTab(null); window.setTimeout(() => setTab('dog'), 0); }}>{en ? 'Retry preview' : '重试预览'}</button>
            </div> : <>
              <div className="model-preview-canvas" ref={host} />
              {dogPreviewLoading && <output className="model-preview-loading">{en ? 'Preparing preview…' : '正在生成预览…'}</output>}
              {dogStatus === 'ready' && <>
                <div className="dog-view-actions">
                  <button type="button" className="dog-focus-button" onClick={onFocusDog}>{en ? 'Follow in campus' : '在校园中跟随'}</button>
                  <button type="button" className={`dog-first-person-button${dogFirstPerson ? ' active' : ''}`}
                    aria-pressed={dogFirstPerson} onClick={() => {
                      onDogFirstPersonChange();
                      if (!dogFirstPerson) setTab(null);
                    }}>
                    {dogFirstPerson ? (en ? 'Back to overview' : '返回全景') : (en ? 'Dog first person' : '机器狗第一视角')}
                  </button>
                </div>
                <div className="dog-patrol-controls">
                  <label htmlFor="dog-patrol-route">{en ? 'Patrol route' : '巡检路线'}</label>
                  <select id="dog-patrol-route" value={selectedPatrol} onChange={event => setSelectedPatrol(event.target.value)}>
                    {patrolRoutes.map(route => <option key={route.id} value={route.id}>{en ? route.nameEn : route.name}</option>)}
                  </select>
                  <div className="dog-patrol-stops">{patrolRoutes.find(route => route.id === selectedPatrol)?.checkpoints.join(' → ')}</div>
                  <label htmlFor="dog-patrol-speed"><span>{en ? 'Walking speed' : '巡检速度'}</span><output>{dogSpeed.toFixed(1)} m/s</output></label>
                  <input id="dog-patrol-speed" type="range" min="0.6" max="2" step="0.1" value={dogSpeed} onChange={event => onDogSpeedChange(Number(event.target.value))} />
                  <label htmlFor="dog-color">{en ? 'Robot dog color' : '机器狗颜色'}</label>
                  <div className="dog-color-controls">
                    {['#c5283e', '#ed8a19', '#1975c6', '#2a9c70'].map(color =>
                      <button key={color} type="button" className={dogColor === color ? 'active' : ''}
                        style={{ backgroundColor: color }} aria-label={`${en ? 'Choose color' : '选择颜色'} ${color}`}
                        aria-pressed={dogColor === color} onClick={() => onDogColorChange(color)} />)}
                    <input id="dog-color" type="color" value={dogColor} onChange={event => onDogColorChange(event.target.value)}
                      aria-label={en ? 'Custom robot dog color' : '自定义机器狗颜色'} />
                  </div>
                  <div className="dog-patrol-actions">
                    <button type="button" onClick={() => onStartPatrol(selectedPatrol)}>{en ? 'Start' : '开始巡检'}</button>
                    {dogPatrol.status === 'paused' ?
                      <button type="button" onClick={onResumePatrol}>{en ? 'Resume' : '继续'}</button> :
                      <button type="button" onClick={onPausePatrol} disabled={!['walking', 'turning', 'yielding', 'checking'].includes(dogPatrol.status)}>{en ? 'Pause' : '暂停'}</button>}
                    <button type="button" onClick={onStopPatrol} disabled={!dogPatrol.routeId}>{en ? 'Stop' : '结束'}</button>
                  </div>
                  {dogPatrol.routeId && <output className="dog-patrol-progress">
                    <span>{({ idle: en ? 'Stopped' : '已结束', walking: en ? 'Walking' : '行走中', turning: en ? 'Turning' : '转身中', yielding: en ? 'Yielding to walkers' : '礼让行人', checking: en ? 'Inspecting' : '停留巡检中', paused: en ? 'Paused' : '已暂停', completed: en ? 'Completed' : '巡检完成', blocked: en ? 'Path blocked' : '道路受阻' } as const)[dogPatrol.status]} · {dogPatrol.checkpoint}</span>
                    <progress max={Math.max(1, dogPatrol.total)} value={dogPatrol.distance} />
                    <small>{Math.round(dogPatrol.distance)} / {Math.round(dogPatrol.total)} m</small>
                  </output>}
                </div>
              </>}
            </>}
        </section>
      )}
    </div>
  );
}
