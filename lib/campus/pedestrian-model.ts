import * as THREE from 'three';

type Joints = { arms: THREE.Group[]; legs: THREE.Group[] };
const skin = new THREE.MeshStandardMaterial({ color: '#c6ad99', roughness: .92 });
const hair = new THREE.MeshStandardMaterial({ color: '#33383d', roughness: .9 });
const trousers = new THREE.MeshStandardMaterial({ color: '#3b434b', roughness: .88 });
const shoes = new THREE.MeshStandardMaterial({ color: '#2b3135', roughness: .75 });
const shirt = new THREE.MeshStandardMaterial({ color: '#e1e0d9', roughness: .86 });
const coats = ['#454f57', '#7c8588', '#aeb3ae'].map(color =>
  new THREE.MeshStandardMaterial({ color, roughness: .87 }));

function part(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material,
  x: number, y: number, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** 校园行人和右上角预览共用同一套轻量关节模型。 */
export function createWalkingPerson(index = 0) {
  const person = new THREE.Group();
  const coat = coats[index % coats.length];
  part(person, new THREE.CylinderGeometry(.27, .34, .88, 8), coat, 0, 1.22);
  part(person, new THREE.BoxGeometry(.12, .54, .04), shirt, 0, 1.36, -.28);
  part(person, new THREE.CylinderGeometry(.09, .09, .16, 8), skin, 0, 1.73);
  part(person, new THREE.SphereGeometry(.23, 10, 8), skin, 0, 1.93);
  const cap = part(person, new THREE.SphereGeometry(.235, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.98);
  cap.rotation.x = .08;
  const arms: THREE.Group[] = [], legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .36, 1.56, 0); person.add(arm);
    part(arm, new THREE.CylinderGeometry(.095, .075, .53, 7), coat, 0, -.28);
    part(arm, new THREE.SphereGeometry(.085, 7, 6), skin, 0, -.58);
    arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .17, .82, 0); person.add(leg);
    part(leg, new THREE.CylinderGeometry(.13, .105, .69, 7), trousers, 0, -.34);
    part(leg, new THREE.BoxGeometry(.19, .12, .32), shoes, 0, -.72, -.08);
    legs.push(leg);
  }
  person.userData.pedestrianJoints = { arms, legs } satisfies Joints;
  return person;
}

export function setWalkingPose(person: THREE.Group, phase: number, moving = true) {
  const joints = person.userData.pedestrianJoints as Joints;
  if (!joints) return;
  const swing = moving ? Math.sin(phase) * .36 : 0;
  joints.legs[0].rotation.x = swing;
  joints.legs[1].rotation.x = -swing;
  joints.arms[0].rotation.x = -swing * .72;
  joints.arms[1].rotation.x = swing * .72;
  person.position.y = moving ? Math.abs(swing) * .035 : 0;
}
