import * as THREE from "three";
import { mobile, reducedMotion } from "./shared.js";
import { sampleOcean } from "./ocean.js";

export const STREAM_SEGMENTS = 28;
const STREAM_SIDES = 9;

function createLiquidStreamGeometry() {
  const vertexCount = (STREAM_SEGMENTS + 1) * STREAM_SIDES;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = [];

  for (let segment = 0; segment <= STREAM_SEGMENTS; segment += 1) {
    for (let side = 0; side < STREAM_SIDES; side += 1) {
      const vertex = segment * STREAM_SIDES + side;
      uvs[vertex * 2] = side / STREAM_SIDES;
      uvs[vertex * 2 + 1] = segment / STREAM_SEGMENTS;
    }
  }

  for (let segment = 0; segment < STREAM_SEGMENTS; segment += 1) {
    for (let side = 0; side < STREAM_SIDES; side += 1) {
      const nextSide = (side + 1) % STREAM_SIDES;
      const current = segment * STREAM_SIDES + side;
      const next = segment * STREAM_SIDES + nextSide;
      const below = (segment + 1) * STREAM_SIDES + side;
      const belowNext = (segment + 1) * STREAM_SIDES + nextSide;
      indices.push(current, below, next, next, below, belowNext);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

const streamGeometry = createLiquidStreamGeometry();
export const streamMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
  toneMapped: false,
});
export const liquidStream = new THREE.Mesh(streamGeometry, streamMaterial);
liquidStream.visible = false;
liquidStream.frustumCulled = false;
liquidStream.renderOrder = 4;

export const liquidMouth = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), streamMaterial);
liquidMouth.visible = false;
liquidMouth.frustumCulled = false;
liquidMouth.renderOrder = 4;

const dropletGeometry = new THREE.SphereGeometry(0.075, 10, 8);
export const dropletMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  emissive: 0xffffff,
  emissiveIntensity: 0.08,
  roughness: 0.035,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  transmission: 0.12,
  thickness: 0.14,
  ior: 1.34,
  specularIntensity: 1,
  specularColor: new THREE.Color(0xffffff),
  transparent: true,
  opacity: 0.74,
  depthWrite: false,
});
const dropletHighlightGeometry = new THREE.SphereGeometry(0.019, 8, 6);
const dropletHighlightMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.82,
  depthWrite: false,
  toneMapped: false,
});

const droplets = [];

const fizzTexture = (() => {
  const fizzCanvas = document.createElement("canvas");
  fizzCanvas.width = fizzCanvas.height = 32;
  const context = fizzCanvas.getContext("2d");
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.85)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(fizzCanvas);
})();

const FIZZ_COUNT = mobile ? 70 : 160;
const fizzPositions = new Float32Array(FIZZ_COUNT * 3);
fizzPositions.fill(-999);
const fizzGeometry = new THREE.BufferGeometry();
fizzGeometry.setAttribute("position", new THREE.BufferAttribute(fizzPositions, 3));
const fizzMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  map: fizzTexture,
  size: 0.065,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});
const fizzPoints = new THREE.Points(fizzGeometry, fizzMaterial);
fizzPoints.visible = false;
fizzPoints.frustumCulled = false;
fizzPoints.renderOrder = 5;

const fizzBubbles = Array.from({ length: FIZZ_COUNT }, () => ({
  x: 0,
  y: 0,
  z: 0,
  rise: 1,
  age: 1,
  life: 0,
  wobblePhase: 0,
}));

export function initEffects(scene) {
  scene.add(liquidStream, liquidMouth, fizzPoints);
  for (let i = 0; i < (mobile ? 20 : 36); i += 1) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(dropletGeometry, dropletMaterial);
    const highlight = new THREE.Mesh(dropletHighlightGeometry, dropletHighlightMaterial);
    highlight.position.set(-0.038, 0.043, 0.052);
    group.add(core, highlight);
    group.visible = false;
    scene.add(group);
    droplets.push({
      mesh: group,
      velocity: new THREE.Vector3(),
      age: 0,
      baseScale: 1,
      wobblePhase: Math.random() * Math.PI * 2,
      type: "stream",
    });
  }
}

export function spawnFizzBubble(x, y, z) {
  const bubble = fizzBubbles.find((item) => item.age >= item.life);
  if (!bubble) return;
  bubble.x = x;
  bubble.y = y;
  bubble.z = z;
  bubble.rise = THREE.MathUtils.randFloat(0.45, 1.3);
  bubble.life = THREE.MathUtils.randFloat(0.45, 1.2);
  bubble.age = 0;
  bubble.wobblePhase = Math.random() * Math.PI * 2;
}

export function updateFizz(time, delta) {
  let anyAlive = false;
  for (let index = 0; index < FIZZ_COUNT; index += 1) {
    const bubble = fizzBubbles[index];
    const offset = index * 3;
    if (bubble.age < bubble.life) {
      bubble.age += delta;
      bubble.y += bubble.rise * delta;
      fizzPositions[offset] = bubble.x + Math.sin(time * 9 + bubble.wobblePhase) * 0.03;
      fizzPositions[offset + 1] = bubble.y;
      fizzPositions[offset + 2] = bubble.z + Math.cos(time * 7.5 + bubble.wobblePhase) * 0.03;
      anyAlive = true;
    } else {
      fizzPositions[offset + 1] = -999;
    }
  }
  fizzPoints.visible = anyAlive;
  if (anyAlive) fizzGeometry.getAttribute("position").needsUpdate = true;
}

const upVector = new THREE.Vector3(0, 1, 0);
const waveNormal = new THREE.Vector3();
const streamDirection = new THREE.Vector3();
const streamCanCenter = new THREE.Vector3();
const streamOutflow = new THREE.Vector3();
const streamControlA = new THREE.Vector3();
const streamControlB = new THREE.Vector3();
const streamTangent = new THREE.Vector3();
const streamSide = new THREE.Vector3();
const streamBinormal = new THREE.Vector3();
const streamReference = new THREE.Vector3();
export const streamCenters = Array.from({ length: STREAM_SEGMENTS + 1 }, () => new THREE.Vector3());
const streamCurve = new THREE.CubicBezierCurve3(
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
);

export function updateLiquidStream(from, to, can, time, flowAmount) {
  can.visual.getWorldPosition(streamCanCenter);
  streamOutflow.copy(from).sub(streamCanCenter).normalize();
  streamControlA.copy(from).addScaledVector(streamOutflow, reducedMotion ? 0.16 : 0.42);
  streamControlA.y -= reducedMotion ? 0.18 : 0.48;
  streamControlB.copy(to);
  streamControlB.y += reducedMotion ? 0.32 : 0.86;
  streamControlB.x += Math.sin(time * 5.2 + can.phase) * (reducedMotion ? 0.015 : 0.13);
  streamControlB.z += Math.cos(time * 4.7 + can.phase) * (reducedMotion ? 0.012 : 0.09);

  streamTangent.copy(streamControlA).sub(from).normalize();
  const mouthRadius = 0.2 * (0.12 + flowAmount * 0.88);
  liquidMouth.visible = true;
  liquidMouth.position
    .copy(from)
    .addScaledVector(streamOutflow, -mouthRadius * 0.55)
    .addScaledVector(streamTangent, mouthRadius * 0.45);
  liquidMouth.quaternion.setFromUnitVectors(upVector, streamTangent);
  liquidMouth.scale.set(mouthRadius * 1.25, mouthRadius * 1.75, mouthRadius * 1.25);

  streamCurve.v0.copy(from);
  streamCurve.v1.copy(streamControlA);
  streamCurve.v2.copy(streamControlB);
  streamCurve.v3.copy(to);

  for (let segment = 0; segment <= STREAM_SEGMENTS; segment += 1) {
    const t = segment / STREAM_SEGMENTS;
    streamCurve.getPoint(t, streamCenters[segment]);
    const envelope = Math.sin(t * Math.PI);
    streamCenters[segment].x +=
      Math.sin(time * 8.6 - t * 17.0 + can.phase) * envelope * (reducedMotion ? 0.008 : 0.055);
    streamCenters[segment].z +=
      Math.cos(time * 7.4 - t * 14.0 + can.phase) * envelope * (reducedMotion ? 0.006 : 0.04);
  }

  const positionAttribute = streamGeometry.getAttribute("position");
  const normalAttribute = streamGeometry.getAttribute("normal");

  for (let segment = 0; segment <= STREAM_SEGMENTS; segment += 1) {
    const t = segment / STREAM_SEGMENTS;
    const before = streamCenters[Math.max(0, segment - 1)];
    const after = streamCenters[Math.min(STREAM_SEGMENTS, segment + 1)];
    streamTangent.copy(after).sub(before).normalize();
    streamReference.set(0, Math.abs(streamTangent.y) > 0.92 ? 0 : 1, Math.abs(streamTangent.y) > 0.92 ? 1 : 0);
    streamSide.crossVectors(streamTangent, streamReference).normalize();
    streamBinormal.crossVectors(streamTangent, streamSide).normalize();

    const taper = 1 / Math.sqrt(1 + t * 3.4);
    const pulse = 1 + Math.sin(t * 32 - time * 26 + can.phase) * (0.05 + t * 0.16);
    const lobe = 1 + Math.sin(t * 13 + time * 5.5) * Math.sin(t * Math.PI) * 0.08;
    const breakup = t < 0.44 ? 1 : 0.6 + (Math.sin(t * 39 - time * 30) * 0.5 + 0.5) * 0.4;
    const radius = 0.2 * taper * pulse * lobe * breakup * (0.12 + flowAmount * 0.88);

    for (let side = 0; side < STREAM_SIDES; side += 1) {
      const angle = (side / STREAM_SIDES) * Math.PI * 2;
      const irregularity = 1 + Math.sin(angle * 3 + t * 24 - time * 9) * 0.08;
      const radialX = Math.cos(angle) * radius * irregularity;
      const radialY = Math.sin(angle) * radius * irregularity;
      const vertex = segment * STREAM_SIDES + side;
      const offset = vertex * 3;

      positionAttribute.array[offset] =
        streamCenters[segment].x + streamSide.x * radialX + streamBinormal.x * radialY;
      positionAttribute.array[offset + 1] =
        streamCenters[segment].y + streamSide.y * radialX + streamBinormal.y * radialY;
      positionAttribute.array[offset + 2] =
        streamCenters[segment].z + streamSide.z * radialX + streamBinormal.z * radialY;

      streamReference
        .copy(streamSide)
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(streamBinormal, Math.sin(angle))
        .normalize();
      normalAttribute.array[offset] = streamReference.x;
      normalAttribute.array[offset + 1] = streamReference.y;
      normalAttribute.array[offset + 2] = streamReference.z;
    }
  }

  positionAttribute.needsUpdate = true;
  normalAttribute.needsUpdate = true;
}

export function spawnDroplet(from, toward) {
  if (reducedMotion) return;
  const droplet = droplets.find((item) => !item.mesh.visible);
  if (!droplet) return;
  droplet.mesh.visible = true;
  droplet.mesh.position.copy(from);
  droplet.baseScale = THREE.MathUtils.randFloat(1, 1.45);
  droplet.type = "stream";
  droplet.velocity
    .copy(toward)
    .sub(from)
    .normalize()
    .multiplyScalar(THREE.MathUtils.randFloat(3.4, 4.8));
  droplet.velocity.x += THREE.MathUtils.randFloatSpread(0.7);
  droplet.velocity.z += THREE.MathUtils.randFloatSpread(0.5);
  droplet.age = 0;
}

export function spawnSplash(at) {
  if (reducedMotion) return;
  for (let index = 0; index < 2; index += 1) {
    const droplet = droplets.find((item) => !item.mesh.visible);
    if (!droplet) return;
    droplet.mesh.visible = true;
    droplet.mesh.position.copy(at);
    droplet.mesh.position.y += 0.04;
    droplet.baseScale = THREE.MathUtils.randFloat(0.8, 1.15);
    droplet.type = "splash";
    droplet.velocity.set(
      THREE.MathUtils.randFloatSpread(2.2),
      THREE.MathUtils.randFloat(1.7, 3.3),
      THREE.MathUtils.randFloatSpread(1.8),
    );
    droplet.age = 0;
  }
}

export function updateDroplets(time, delta) {
  for (const droplet of droplets) {
    if (!droplet.mesh.visible) continue;
    droplet.age += delta;
    droplet.velocity.y -= 8.2 * delta;
    droplet.mesh.position.addScaledVector(droplet.velocity, delta);
    streamDirection.copy(droplet.velocity).normalize();
    droplet.mesh.quaternion.setFromUnitVectors(upVector, streamDirection);
    const surfaceTension =
      1 + Math.sin(droplet.age * 22 + droplet.wobblePhase) * 0.1 * Math.exp(-droplet.age * 0.7);
    const radialScale = 1 / Math.sqrt(surfaceTension);
    droplet.mesh.scale.set(
      droplet.baseScale * radialScale,
      droplet.baseScale * surfaceTension,
      droplet.baseScale * radialScale,
    );
    const surface = sampleOcean(droplet.mesh.position.x, droplet.mesh.position.z, time, waveNormal).height;
    if ((droplet.age > 0.07 && droplet.mesh.position.y <= surface + 0.02) || droplet.age > 1.5) {
      droplet.mesh.visible = false;
    }
  }
}
