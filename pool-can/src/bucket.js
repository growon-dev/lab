import * as THREE from "three";
import { mobile } from "./shared.js";

const bucketMetalMaterial = new THREE.MeshStandardMaterial({
  color: 0xc8d2d9,
  metalness: 0.5,
  roughness: 0.35,
  envMapIntensity: 1.4,
  emissive: 0x454f57,
  side: THREE.DoubleSide,
});

export function createBucket(scene, clickTargets) {
  const anchor = new THREE.Group();
  const visual = new THREE.Group();
  anchor.add(visual);
  scene.add(anchor);

  const profile = [
    new THREE.Vector2(0.001, 0.05),
    new THREE.Vector2(0.46, 0.05),
    new THREE.Vector2(0.49, 0),
    new THREE.Vector2(0.51, 0.07),
    new THREE.Vector2(0.66, 1.02),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), bucketMetalMaterial);
  visual.add(body);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.665, 0.032, 12, 48), bucketMetalMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.02;
  visual.add(rim);

  for (const [ribY, ribRadius] of [[0.34, 0.545], [0.7, 0.6]]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(ribRadius, 0.016, 10, 48), bucketMetalMaterial);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = ribY;
    visual.add(rib);
  }

  const handlePivot = new THREE.Group();
  handlePivot.position.y = 1.0;
  visual.add(handlePivot);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.022, 10, 32, Math.PI), bucketMetalMaterial);
  handlePivot.add(handle);
  for (const side of [-1, 1]) {
    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), bucketMetalMaterial);
    lug.rotation.z = Math.PI / 2;
    lug.position.set(side * 0.7, 1.0, 0);
    visual.add(lug);
  }

  const hitArea = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.64, 1.32, 20),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  hitArea.position.y = 0.58;
  visual.add(hitArea);

  visual.traverse((object) => {
    if (!object.isMesh) return;
    object.userData.bucket = true;
    clickTargets.push(object);
  });

  const scale = mobile ? 1.15 : 1.12;
  visual.scale.setScalar(scale);
  return {
    anchor,
    visual,
    handlePivot,
    home: new THREE.Vector3(4.7, 0, -5.8),
    scale,
    hoverAmount: 0,
  };
}
