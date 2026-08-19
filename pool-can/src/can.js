import * as THREE from "three";
import { mobile } from "./shared.js";
import { FLAVORS } from "./flavors.js";

let renderer = null;
let scene = null;
let clickTargets = null;

export function initCanModule(context) {
  renderer = context.renderer;
  scene = context.scene;
  clickTargets = context.clickTargets;
}

function drawCanLabel(label, flavor) {
  const context = label.getContext("2d");
  context.fillStyle = flavor.can.base;
  context.fillRect(0, 0, label.width, label.height);

  for (let panel = 0; panel < 2; panel += 1) {
    const centerX = panel * 1024 + 512;
    context.save();
    context.translate(centerX, 0);
    drawLabelPanelTexts(context, flavor);
    context.restore();
  }
}

function drawLabelPanelTexts(context, flavor) {
  context.fillStyle = flavor.can.accent;

  context.save();
  context.translate(330, 724);
  context.rotate(-Math.PI / 2);
  context.textAlign = "left";
  let wordmarkSize = 255;
  context.font = `400 ${wordmarkSize}px Anton, sans-serif`;
  const maxRun = 700;
  const run = context.measureText(flavor.shortName).width;
  if (run > maxRun) {
    wordmarkSize = Math.floor((wordmarkSize * maxRun) / run);
    context.font = `400 ${wordmarkSize}px Anton, sans-serif`;
  }
  context.fillText(flavor.shortName, 0, 0);
  context.restore();

  const topLines = [
    { text: "SPARKLING ZERO", font: "400 34px Anton, sans-serif" },
    { text: "제로 슈거 · 0 kcal", font: '600 28px "Noto Sans KR", sans-serif' },
  ];
  topLines.forEach((line, index) => {
    context.save();
    context.translate(52 - index * 42, 64);
    context.rotate(-Math.PI / 2);
    context.textAlign = "right";
    context.font = line.font;
    context.fillText(line.text, 0, 0);
    context.restore();
  });

  const bottomLines = [
    { text: `${flavor.krName} 탄산음료 355 mL`, font: '600 28px "Noto Sans KR", sans-serif' },
    { text: "원산지: 대한민국", font: '600 28px "Noto Sans KR", sans-serif' },
    { text: "SPARKLING ZERO", font: "400 32px Anton, sans-serif" },
  ];
  bottomLines.forEach((line, index) => {
    context.save();
    context.translate(52 - index * 42, 704);
    context.rotate(-Math.PI / 2);
    context.textAlign = "left";
    context.font = line.font;
    context.fillText(line.text, 0, 0);
    context.restore();
  });
}

function createCanLabel(flavor) {
  const label = document.createElement("canvas");
  label.width = 2048;
  label.height = 768;
  drawCanLabel(label, flavor);
  const texture = new THREE.CanvasTexture(label);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.userData.flavor = flavor;
  return texture;
}

export const canLabelTextures = new Map();

export function getCanLabelTexture(flavor) {
  if (!canLabelTextures.has(flavor.id)) {
    canLabelTextures.set(flavor.id, createCanLabel(flavor));
  }
  return canLabelTextures.get(flavor.id);
}

export function preloadLabels() {
  for (const flavor of FLAVORS) getCanLabelTexture(flavor);
  Promise.all([
    document.fonts.load("400 255px Anton"),
    document.fonts.load('600 28px "Noto Sans KR"'),
  ]).then(() => {
    for (const texture of canLabelTextures.values()) {
      drawCanLabel(texture.image, texture.userData.flavor);
      texture.needsUpdate = true;
    }
  });
}

const CAN_R = 0.85;
const canBodyProfile = [
  [0.0, -1.24],
  [0.3, -1.31],
  [0.5, -1.4],
  [0.585, -1.45],
  [0.66, -1.44],
  [0.77, -1.38],
  [0.84, -1.28],
  [CAN_R, -1.14],
  [CAN_R, 0.9],
  [0.83, 1.06],
  [0.75, 1.24],
  [0.69, 1.35],
  [0.7, 1.4],
  [0.665, 1.43],
  [0.63, 1.42],
  [0.585, 1.38],
  [0.572, 1.362],
];
const canPaintedGeometry = (() => {
  const geometry = new THREE.LatheGeometry(
    canBodyProfile.slice(0, 13).map(([x, y]) => new THREE.Vector2(x, y)),
    72,
  );
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i += 1) {
    uv.setY(i, (position.getY(i) + 1.14) / 2.04);
  }
  return geometry;
})();
const canNeckGeometry = new THREE.LatheGeometry(
  canBodyProfile.slice(12).map(([x, y]) => new THREE.Vector2(x, y)),
  72,
);
const seamGeometry = new THREE.TorusGeometry(0.675, 0.036, 14, 72);
const lidPanelGeometry = new THREE.CircleGeometry(0.585, 64);
const rivetGeometry = new THREE.CylinderGeometry(0.055, 0.065, 0.035, 24);
const openingPanelGeometry = new THREE.CircleGeometry(0.17, 32);
const scorelineGeometry = new THREE.RingGeometry(0.17, 0.177, 48);

function createTabGeometry() {
  const halfW = 0.13;
  const shape = new THREE.Shape();
  shape.absarc(0, 0.1, halfW, 0, Math.PI, false);
  shape.lineTo(-halfW, -0.24);
  shape.absarc(0, -0.24, halfW, Math.PI, Math.PI * 2, false);
  shape.lineTo(halfW, 0.1);
  const fingerHole = new THREE.Path();
  fingerHole.absarc(0, -0.2, 0.088, 0, Math.PI * 2, true);
  const rivetHole = new THREE.Path();
  rivetHole.absarc(0, 0.06, 0.042, 0, Math.PI * 2, true);
  shape.holes.push(fingerHole, rivetHole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.024,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.007,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geometry.rotateX(Math.PI / 2);
  return geometry;
}
const tabGeometry = createTabGeometry();

const aluminumMaterial = new THREE.MeshStandardMaterial({
  color: 0xc2c9ce,
  metalness: 1,
  roughness: 0.38,
  envMapIntensity: 0.55,
  emissive: 0x303940,
  emissiveIntensity: 0.45,
  side: THREE.DoubleSide,
});
const metalMaterial = new THREE.MeshStandardMaterial({
  color: 0xd4d9dc,
  metalness: 0.72,
  roughness: 0.34,
  envMapIntensity: 0.8,
  emissive: 0x596168,
  emissiveIntensity: 0.72,
});
const lidPanelMaterial = new THREE.MeshStandardMaterial({
  color: 0xc7cdd1,
  metalness: 0.65,
  roughness: 0.44,
  envMapIntensity: 0.7,
  emissive: 0x505a62,
  emissiveIntensity: 0.6,
  side: THREE.DoubleSide,
});

export function createCan(flavor, home, phase, tipDirection) {
  const anchor = new THREE.Group();
  const visual = new THREE.Group();
  visual.rotation.order = "XZY";
  const body = new THREE.Group();
  anchor.add(visual);
  visual.add(body);
  scene.add(anchor);

  const labelTexture = getCanLabelTexture(flavor);
  const labelMaterial = new THREE.MeshPhysicalMaterial({
    map: labelTexture,
    color: 0xffffff,
    metalness: 0.62,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.9,
    specularIntensity: 1,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: labelTexture,
    emissiveIntensity: 1,
    opacity: 1,
  });

  const shell = new THREE.Mesh(canPaintedGeometry, labelMaterial);
  shell.rotation.y = Math.PI / 2;
  body.add(shell);

  const neck = new THREE.Mesh(canNeckGeometry, aluminumMaterial);
  body.add(neck);

  const lid = new THREE.Group();
  lid.position.y = 1.352;
  lid.rotation.y = -tipDirection * (Math.PI / 2);
  body.add(lid);

  const seam = new THREE.Mesh(seamGeometry, metalMaterial);
  seam.rotation.x = Math.PI / 2;
  seam.position.y = 0.085;
  lid.add(seam);

  const lidPanel = new THREE.Mesh(lidPanelGeometry, lidPanelMaterial);
  lidPanel.rotation.x = -Math.PI / 2;
  lidPanel.position.y = 0.012;
  lid.add(lidPanel);

  const lidUnderside = new THREE.Mesh(
    new THREE.CircleGeometry(0.64, 64),
    lidPanelMaterial,
  );
  lidUnderside.rotation.x = -Math.PI / 2;
  lidUnderside.position.y = -0.006;
  lid.add(lidUnderside);

  const opening = new THREE.Mesh(
    openingPanelGeometry,
    new THREE.MeshBasicMaterial({ color: 0x232b31 }),
  );
  opening.rotation.x = -Math.PI / 2;
  opening.position.set(0, 0.016, 0.3);
  opening.visible = false;
  lid.add(opening);

  const openingPivot = new THREE.Group();
  openingPivot.position.set(0, 0.018, 0.105);
  lid.add(openingPivot);
  const flapMaterial = lidPanelMaterial.clone();
  flapMaterial.side = THREE.DoubleSide;
  const openingFlap = new THREE.Mesh(openingPanelGeometry, flapMaterial);
  openingFlap.rotation.x = -Math.PI / 2;
  openingFlap.position.z = 0.195;
  openingPivot.add(openingFlap);

  const scoreline = new THREE.Mesh(
    scorelineGeometry,
    new THREE.MeshBasicMaterial({ color: 0x10151a, transparent: true, opacity: 0.6 }),
  );
  scoreline.rotation.x = -Math.PI / 2;
  scoreline.position.set(0, 0.017, 0.3);
  lid.add(scoreline);

  const rivet = new THREE.Mesh(rivetGeometry, metalMaterial);
  rivet.position.set(0, 0.03, 0.02);
  lid.add(rivet);

  const tabPivot = new THREE.Group();
  tabPivot.position.set(0, 0.042, 0.02);
  lid.add(tabPivot);
  const tab = new THREE.Mesh(tabGeometry, metalMaterial);
  tab.position.z = -0.06;
  tabPivot.add(tab);

  const spout = new THREE.Object3D();
  spout.position.set(tipDirection * 0.4, 1.43, 0.08);
  visual.add(spout);

  const can = {
    flavor,
    anchor,
    visual,
    body,
    shell,
    opening,
    openingPivot,
    labelMaterial,
    labelTexture,
    tabPivot,
    spout,
    home: new THREE.Vector3(...home),
    phase,
    tipDirection,
    hoverAmount: 0,
    scale: mobile ? 1.25 : 1.35,
  };

  body.rotation.y = Math.PI;
  body.traverse((object) => {
    if (!object.isMesh) return;
    object.userData.flavorId = flavor.id;
    clickTargets.push(object);
  });
  return can;
}

export function applyFlavorToCan(can, flavor) {
  const labelTexture = getCanLabelTexture(flavor);
  can.flavor = flavor;
  can.labelTexture = labelTexture;
  can.labelMaterial.map = labelTexture;
  can.labelMaterial.emissiveMap = labelTexture;
  can.labelMaterial.needsUpdate = true;
  can.body.traverse((object) => {
    if (object.isMesh) object.userData.flavorId = flavor.id;
  });
}
