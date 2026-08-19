import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import "./style.css";
import { mobile, reducedMotion, motionScale, CAN_Z, smoothStep, easeOutBack } from "./shared.js";
import { FLAVORS, DEFAULT_PALETTE } from "./flavors.js";
import { oceanUniforms, setPaletteUniform, createOcean, sampleOcean } from "./ocean.js";
import { playCanToss, playCanNudge, playBucketPour, playPalmRustle } from "./audio.js";
import { createPoolside, triggerPalmSway, updatePalmSway } from "./poolside.js";
import { initCanModule, createCan, applyFlavorToCan, preloadLabels, canLabelTextures } from "./can.js";
import { createBucket } from "./bucket.js";
import {
  initEffects,
  liquidStream,
  liquidMouth,
  streamMaterial,
  dropletMaterial,
  streamCenters,
  STREAM_SEGMENTS,
  updateLiquidStream,
  spawnDroplet,
  spawnSplash,
  spawnFizzBubble,
  updateDroplets,
  updateFizz,
} from "./effects.js";

const canvas = document.querySelector("#pool-canvas");
const initialDpr = Math.min(window.devicePixelRatio, mobile ? 1.0 : 1.4);

let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
  });
} catch (error) {
  console.error("WebGL initialization failed", error);
  canvas.hidden = true;
  throw error;
}

renderer.setPixelRatio(initialDpr);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.72;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(DEFAULT_PALETTE.fog).multiplyScalar(0.32).getHex(), 0.0055);

const camera = new THREE.PerspectiveCamera(
  mobile ? 55 : 46,
  window.innerWidth / window.innerHeight,
  0.1,
  900,
);
camera.position.set(0, mobile ? 2.55 : 2.85, mobile ? 10.2 : 13.2);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2.4, CAN_Z);
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 22;
controls.minPolarAngle = 1.56;
controls.maxPolarAngle = 1.56;
controls.zoomSpeed = 0.65;
controls.rotateSpeed = 0.28;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
controls.update();

createPoolside(scene, renderer);
createOcean(scene);

const clickTargets = [];
initCanModule({ renderer, scene, clickTargets });
const cans = [createCan(FLAVORS[0], [0, 0, CAN_Z], 2.1, -1)];
preloadLabels();
const bucket = createBucket(scene, clickTargets);
initEffects(scene);

const upVector = new THREE.Vector3(0, 1, 0);
const waveNormal = new THREE.Vector3();
const targetQuaternion = new THREE.Quaternion();
const identityQuaternion = new THREE.Quaternion();
const bucketScreenPoint = new THREE.Vector3();
const bucketScreenDirection = new THREE.Vector3();
const streamTop = new THREE.Vector3();
const streamBottom = new THREE.Vector3();
const scratchVector = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let currentPalette = DEFAULT_PALETTE;
let currentFlavorIndex = 0;
let activeFlavorId = FLAVORS[currentFlavorIndex].id;
let hoveredCan = null;
let hoveredBucket = false;
let flavorTransition = null;
let bucketScoop = null;
let animationTime = 0;
let pointerStart = null;
let fizzAccumulator = 0;

const CRT_CENTER_SCALE = 0.58;
const CRT_CURVE = 0.3;

function settlePalette(palette) {
  currentPalette = palette;
  setPaletteUniform("uFrom", palette);
  setPaletteUniform("uTo", palette);
  oceanUniforms.uFlavorProgress.value = 0;
  oceanUniforms.uImpactTime.value = -1;
  oceanUniforms.uFlavorOrigin.value.set(9999, 9999);
  scene.fog.color.setHex(palette.fog).multiplyScalar(0.32);
}

function selectNextFlavor(can) {
  if (!can) return;
  if (flavorTransition || bucketScoop) {
    playCanNudge();
    return;
  }

  playCanToss();

  const nextFlavorIndex = (currentFlavorIndex + 1) % FLAVORS.length;
  const flavor = FLAVORS[nextFlavorIndex];
  const impactX = can.home.x + can.tipDirection * (mobile ? 1.45 : 1.95);
  const impactZ = can.home.z + 0.42;
  const impact = new THREE.Vector3(impactX, 0, impactZ);

  setPaletteUniform("uFrom", currentPalette);
  setPaletteUniform("uTo", flavor.palette);
  oceanUniforms.uFlavorAccent.value.setHex(flavor.palette.accent);
  oceanUniforms.uFlavorOrigin.value.set(impactX, impactZ);
  oceanUniforms.uFlavorProgress.value = 0;
  oceanUniforms.uImpactTime.value = 0;

  streamMaterial.color.setHex(flavor.palette.accent);
  dropletMaterial.color.setHex(flavor.palette.shallow);
  dropletMaterial.emissive.setHex(flavor.palette.accent);

  flavorTransition = {
    can,
    flavor,
    nextFlavorIndex,
    impact,
    start: animationTime,
    flavorApplied: false,
    nextStreamDropAt: 0.86,
    nextSplashAt: 0.78,
    landingSplashSpawned: false,
  };
  activeFlavorId = flavor.id;
}

function updateCanTransforms(time, delta) {
  for (const can of cans) {
    const sample = sampleOcean(can.home.x, can.home.z, time, waveNormal);
    can.anchor.position.set(can.home.x, sample.height + can.scale * 0.78, can.home.z);
    targetQuaternion.setFromUnitVectors(upVector, sample.normal);
    can.anchor.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 5.5));

    const transitionTime = flavorTransition?.can === can ? time - flavorTransition.start : -1;
    let rise = 0;
    let tip = 0;
    let tabOpen = 0;
    let panelOpen = 0;
    let spin = 0;
    let springScale = 0;
    let lateralX = 0;
    let lateralZ = 0;
    let tumbleX = 0;

    if (transitionTime >= 0) {
      const anticipation = Math.sin(smoothStep(transitionTime / 0.22) * Math.PI);
      const launchT = THREE.MathUtils.clamp((transitionTime - 0.22) / 0.42, 0, 1);
      const launchProgress = easeOutBack(launchT);
      const fallProgress = smoothStep((transitionTime - 2.02) / 0.5);
      const airborneHeight = launchProgress * (1 - fallProgress) * (reducedMotion ? 0.34 : 2.65);
      const landingTime = Math.max(transitionTime - 2.52, 0);
      const submergeProgress = THREE.MathUtils.clamp(landingTime / 0.5, 0, 1);
      const submergeDip =
        -Math.sin(submergeProgress * Math.PI) * (reducedMotion ? 0.1 : 0.72);
      const reboundTime = Math.max(landingTime - 0.46, 0);
      const buoyancyBounce =
        Math.sin(reboundTime * 10.5) * Math.exp(-reboundTime * 6.2) *
        (reducedMotion ? 0.035 : 0.32);
      rise =
        -anticipation * (reducedMotion ? 0.05 : 0.2) +
        airborneHeight + submergeDip + buoyancyBounce;

      const spinProgress = THREE.MathUtils.clamp((transitionTime - 0.3) / 0.6, 0, 1);
      const spinSettle = Math.max(transitionTime - 0.9, 0);
      const spinTurns = 1 - Math.pow(1 - smoothStep(spinProgress), 4);
      const windUp = Math.sin(smoothStep(transitionTime / 0.3) * Math.PI) * 0.4;
      spin = reducedMotion
        ? Math.sin(spinTurns * Math.PI) * 0.28
        : spinTurns * Math.PI * 4 - windUp;

      const flightAmount = launchProgress * (1 - fallProgress);
      const airFactor = THREE.MathUtils.clamp(flightAmount, 0, 1);
      can.anchor.quaternion.slerp(identityQuaternion, airFactor);
      can.anchor.position.y -= sample.height * airFactor;
      const flightProgress = THREE.MathUtils.clamp((transitionTime - 0.05) / 2.47, 0, 1);
      const flightArc = Math.sin(flightProgress * Math.PI) * flightAmount;
      lateralX = -can.tipDirection * flightArc * (reducedMotion ? 0.07 : 0.58);
      lateralZ =
        -flightArc * (reducedMotion ? 0.035 : 0.28) +
        Math.sin(transitionTime * 4.6) * flightAmount * (reducedMotion ? 0.012 : 0.04);
      tumbleX =
        Math.sin(spinProgress * Math.PI) * (reducedMotion ? 0.035 : 0.22) +
        Math.sin(transitionTime * 7.8) * Math.exp(-transitionTime * 2.4) *
        (reducedMotion ? 0.012 : 0.05);

      const tipIn = smoothStep((transitionTime - 0.42) / 0.38);
      const tipOut = smoothStep((transitionTime - 1.92) / 0.72);
      const tipSpring =
        1 + Math.sin(Math.max(transitionTime - 0.42, 0) * 8.5) *
        Math.exp(-Math.max(transitionTime - 0.42, 0) * 3.1) * 0.16;
      tip = tipIn * (1 - tipOut) * tipSpring * (reducedMotion ? 0.28 : 1.18);
      tabOpen = smoothStep((transitionTime - 0.36) / 0.2) * (1 - smoothStep((transitionTime - 2.12) / 0.38));
      panelOpen =
        smoothStep((transitionTime - 0.46) / 0.22) *
        (1 - smoothStep((transitionTime - 2.12) / 0.38));

      const landingSquash = Math.max(-submergeDip, 0) * 0.22;
      const landingJelly = Math.sin(reboundTime * 9) * Math.exp(-reboundTime * 5) * 0.09;
      const settleBounce = Math.sin(spinSettle * 9) * Math.exp(-spinSettle * 4.5) * 0.07;
      springScale = reducedMotion
        ? 0
        : -anticipation * 0.13 - landingSquash + landingJelly + settleBounce;
    }

    const idleRoll = Math.sin(time * 0.42 * motionScale + can.phase) * (reducedMotion ? 0.008 : 0.026);
    can.visual.position.set(
      lateralX,
      rise + Math.sin(time * 0.55 * motionScale + can.phase) * 0.035,
      lateralZ,
    );
    can.visual.rotation.x = tumbleX;
    can.visual.rotation.z = -can.tipDirection * tip + idleRoll;
    can.visual.rotation.y = spin;
    can.body.rotation.y = Math.PI + Math.sin(time * 0.16 * motionScale + can.phase) * 0.055;
    can.tabPivot.rotation.x = tabOpen * 0.85;
    can.openingPivot.rotation.x = panelOpen * 1.85;
    can.opening.visible = panelOpen > 0.02;

    const hoverTarget = hoveredCan === can ? 1 : 0;
    can.hoverAmount = THREE.MathUtils.damp(can.hoverAmount, hoverTarget, 8, delta);
    const selectedScale = activeFlavorId === can.flavor.id ? 0.045 : 0;
    const scale = can.scale * (1 + can.hoverAmount * 0.065 + selectedScale);
    can.visual.scale.set(
      scale * (1 - springScale * 0.45),
      scale * (1 + springScale),
      scale * (1 - springScale * 0.45),
    );
  }
}

function updateFlavorTransition(time, delta) {
  if (!flavorTransition) {
    liquidStream.visible = false;
    liquidMouth.visible = false;
    updateDroplets(time, delta);
    updateFizz(time, delta);
    return;
  }

  const transitionTime = time - flavorTransition.start;
  const { can, flavor, impact } = flavorTransition;

  if (transitionTime >= 0.42 && !flavorTransition.flavorApplied) {
    applyFlavorToCan(can, flavor);
    flavorTransition.flavorApplied = true;
  }

  const progress = THREE.MathUtils.clamp((transitionTime - 0.52) / 2.1, 0, 1);
  oceanUniforms.uFlavorProgress.value = progress;
  oceanUniforms.uImpactTime.value = transitionTime;

  const impactSurface = sampleOcean(impact.x, impact.z, time, waveNormal).height;
  streamBottom.set(impact.x, impactSurface + 0.08, impact.z);

  const pouring = transitionTime >= 0.58 && transitionTime <= 2.06;
  if (pouring) {
    can.spout.getWorldPosition(streamTop);
    streamBottom.x += Math.sin(time * 8.5) * 0.045;
    streamBottom.z += Math.cos(time * 7.2) * 0.035;
    liquidStream.visible = true;
    liquidStream.position.set(0, 0, 0);
    liquidStream.quaternion.identity();
    liquidStream.scale.set(1, 1, 1);
    const flowIn = smoothStep((transitionTime - 0.58) / 0.18);
    const flowOut = 1 - smoothStep((transitionTime - 1.62) / 0.44);
    updateLiquidStream(streamTop, streamBottom, can, time, flowOut);
    streamMaterial.opacity = flowIn * flowOut * 0.82;

    if (transitionTime >= flavorTransition.nextStreamDropAt) {
      spawnDroplet(streamCenters[THREE.MathUtils.randInt(12, STREAM_SEGMENTS - 3)], streamBottom);
      flavorTransition.nextStreamDropAt = transitionTime + THREE.MathUtils.randFloat(0.07, 0.16);
    }
    if (transitionTime >= flavorTransition.nextSplashAt) {
      spawnSplash(streamBottom);
      flavorTransition.nextSplashAt = transitionTime + THREE.MathUtils.randFloat(0.12, 0.24);
    }
  } else {
    liquidStream.visible = false;
    liquidMouth.visible = false;
  }

  if (!reducedMotion && transitionTime >= 0.7 && transitionTime <= 3.1) {
    const fizzStrength = pouring
      ? 1
      : Math.max(0, 1 - (transitionTime - 2.06) / 1.0);
    fizzAccumulator += delta * (mobile ? 50 : 110) * fizzStrength;
    while (fizzAccumulator >= 1) {
      fizzAccumulator -= 1;
      if (pouring && Math.random() < 0.3) {
        const center = streamCenters[THREE.MathUtils.randInt(4, STREAM_SEGMENTS)];
        spawnFizzBubble(
          center.x + THREE.MathUtils.randFloatSpread(0.14),
          center.y,
          center.z + THREE.MathUtils.randFloatSpread(0.14),
        );
      } else {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() ** 0.6 * 0.55;
        spawnFizzBubble(
          impact.x + Math.cos(angle) * radius,
          impactSurface + THREE.MathUtils.randFloat(-0.12, 0.04),
          impact.z + Math.sin(angle) * radius,
        );
      }
    }
  }

  updateDroplets(time, delta);
  updateFizz(time, delta);

  if (transitionTime >= 2.5 && !flavorTransition.landingSplashSpawned) {
    const landingSurface = sampleOcean(can.home.x, can.home.z, time, waveNormal).height;
    scratchVector.set(can.home.x, landingSurface, can.home.z);
    spawnSplash(scratchVector);
    flavorTransition.landingSplashSpawned = true;
  }

  if (transitionTime >= 3.42) {
    currentFlavorIndex = flavorTransition.nextFlavorIndex;
    settlePalette(flavor.palette);
    flavorTransition = null;
    liquidStream.visible = false;
    liquidMouth.visible = false;
  }
}

function triggerBucketScoop() {
  if (flavorTransition || bucketScoop) return;
  playBucketPour();
  setPaletteUniform("uFrom", currentPalette);
  setPaletteUniform("uTo", DEFAULT_PALETTE);
  oceanUniforms.uFlavorAccent.value.setHex(DEFAULT_PALETTE.accent);
  oceanUniforms.uFlavorOrigin.value.set(bucket.anchor.position.x - 0.9, bucket.anchor.position.z + 0.3);
  oceanUniforms.uFlavorProgress.value = 0;
  oceanUniforms.uImpactTime.value = 0;
  dropletMaterial.color.setHex(currentPalette.shallow);
  dropletMaterial.emissive.setHex(currentPalette.accent);
  bucketScoop = { start: animationTime };
  activeFlavorId = null;
}

function updateBucket(time, delta) {
  let bucketX;
  let bucketZ;

  if (mobile) {
    const aspect = window.innerWidth / window.innerHeight;
    mapScreenThroughCrt(0.96, -0.8, aspect, bucketScreenPoint);
    bucketScreenPoint.z = 0;
    camera.updateMatrixWorld();
    bucketScreenPoint.unproject(camera);
    bucketScreenDirection.copy(bucketScreenPoint).sub(camera.position).normalize();
    const distanceToWater = -camera.position.y / bucketScreenDirection.y;
    bucketX = camera.position.x + bucketScreenDirection.x * distanceToWater;
    bucketZ = camera.position.z + bucketScreenDirection.z * distanceToWater;
  } else {
    const driftScale = reducedMotion ? 0.3 : 1;
    bucketX =
      bucket.home.x + (Math.sin(time * 0.11 + 1.3) * 0.8 + Math.sin(time * 0.047) * 0.5) * driftScale;
    bucketZ =
      bucket.home.z + (Math.cos(time * 0.083) * 0.9 + Math.sin(time * 0.061 + 2.1) * 0.5) * driftScale;
  }

  const sample = sampleOcean(bucketX, bucketZ, time, waveNormal);
  bucket.anchor.position.set(bucketX, sample.height - bucket.scale * 0.5, bucketZ);
  targetQuaternion.setFromUnitVectors(upVector, sample.normal);
  bucket.anchor.quaternion.slerp(targetQuaternion, 1 - Math.exp(-delta * 5.5));

  let dip = 0;
  let tilt = 0;
  let settleBounce = 0;
  const scoopTime = bucketScoop ? time - bucketScoop.start : -1;

  if (scoopTime >= 0) {
    const dipIn = smoothStep(scoopTime / 0.5) * (1 - smoothStep((scoopTime - 0.55) / 0.5));
    dip = -dipIn * (reducedMotion ? 0.15 : 0.45);
    tilt = dipIn * (reducedMotion ? 0.3 : 1.0);

    oceanUniforms.uFlavorProgress.value = THREE.MathUtils.clamp((scoopTime - 0.35) / 1.6, 0, 1);
    oceanUniforms.uImpactTime.value = scoopTime;

    const settle = Math.max(scoopTime - 1.05, 0);
    settleBounce = Math.sin(settle * 10) * Math.exp(-settle * 5) * (reducedMotion ? 0.02 : 0.1);

    if (scoopTime >= 2.2) {
      settlePalette(DEFAULT_PALETTE);
      bucketScoop = null;
    }
  }

  const hoverTarget = hoveredBucket && !bucketScoop ? 1 : 0;
  bucket.hoverAmount = THREE.MathUtils.damp(bucket.hoverAmount, hoverTarget, 8, delta);
  bucket.visual.position.y = dip + Math.sin(time * 0.6 * motionScale + 2.4) * 0.04;
  bucket.visual.rotation.z = 0.18 + tilt + settleBounce + Math.sin(time * 0.5 * motionScale + 1.2) * 0.03;
  bucket.visual.scale.setScalar(bucket.scale * (1 + bucket.hoverAmount * 0.06));
  bucket.handlePivot.rotation.x =
    2.6 + Math.sin(time * 1.7 * motionScale) * (0.08 + Math.abs(tilt) * 0.2);
}

function mapScreenThroughCrt(screenX, screenY, aspect, target) {
  const radiusSquared = (screenX * aspect) ** 2 + screenY ** 2;
  const distortion = smoothStep(radiusSquared * CRT_CURVE);
  const crtScale = CRT_CENTER_SCALE + distortion * (1 - CRT_CENTER_SCALE);
  target.x = screenX * crtScale;
  target.y = screenY * crtScale;
  return target;
}

function canFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const screenX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const screenY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const aspect = rect.width / rect.height;
  mapScreenThroughCrt(screenX, screenY, aspect, pointer);
  raycaster.setFromCamera(pointer, camera);
  const intersection = raycaster.intersectObjects(clickTargets, false)[0];
  if (!intersection) return null;
  if (intersection.object.userData.bucket) return { bucket: true };
  const can = cans.find((item) => item.flavor.id === intersection.object.userData.flavorId);
  return can ? { can } : null;
}

function handlePointerMove(event) {
  const picked = canFromPointer(event);
  hoveredCan = picked?.can ?? null;
  hoveredBucket = Boolean(picked?.bucket);
  canvas.style.cursor = picked ? "pointer" : "grab";
}

function handlePointerDown(event) {
  pointerStart = { x: event.clientX, y: event.clientY };
}

function handlePointerUp(event) {
  if (!pointerStart) return;
  const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (distance > 7) return;
  const picked = canFromPointer(event);
  if (picked?.bucket) triggerBucketScoop();
  else if (picked?.can) selectNextFlavor(picked.can);
  else {
    triggerPalmSway();
    playPalmRustle();
  }
}

canvas.addEventListener("pointermove", handlePointerMove, { passive: true });
canvas.addEventListener("pointerdown", handlePointerDown, { passive: true });
canvas.addEventListener("pointerup", handlePointerUp, { passive: true });
canvas.addEventListener("pointerleave", () => {
  hoveredCan = null;
  hoveredBucket = false;
  pointerStart = null;
  canvas.style.cursor = "grab";
});

const startTime = performance.now();
let previousTime = startTime;
let frameCount = 0;
let fpsWindowStart = performance.now();
let lowFpsWindows = 0;
let currentDpr = initialDpr;
let disposed = false;

const crtPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    varying vec2 vUv;

    vec2 zoom(vec2 uv, float amount) {
      return (uv - 0.5) * amount + 0.5;
    }

    vec3 readTex(vec2 uv) {
      float edge = (1.0 - smoothstep(0.495, 0.502, abs(uv.x - 0.5)))
        * (1.0 - smoothstep(0.495, 0.502, abs(uv.y - 0.5)));
      return texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb * edge;
    }

    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float aspect = uResolution.x / uResolution.y;
      p.x *= aspect;
      float radius = length(p);

      float distortion = smoothstep(0.0, 1.0, min(radius * radius * ${CRT_CURVE.toFixed(2)}, 1.0));
      vec2 uv = zoom(vUv, ${CRT_CENTER_SCALE.toFixed(2)} + distortion * ${(1 - CRT_CENTER_SCALE).toFixed(2)});

      float fringe = smoothstep(0.35, 1.75, radius);
      vec2 channelOffset = vec2((0.65 + fringe * 2.15) / uResolution.x, 0.0);
      vec3 color = vec3(
        readTex(uv + channelOffset).r,
        readTex(uv).g,
        readTex(uv - channelOffset).b
      );

      vec2 vignettePoint = vUv * 2.0 - 1.0;
      vignettePoint.x *= max(aspect, 1.0);
      float portrait = 1.0 - step(1.0, aspect);
      float vignetteStart = mix(1.25, 0.55, portrait);
      float vignetteEnd = mix(2.9, 1.75, portrait);
      float vignette = 1.0 - smoothstep(vignetteStart, vignetteEnd, dot(vignettePoint, vignettePoint));
      color *= mix(1.0, vignette, 0.88);

      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
});

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(crtPass);
composer.addPass(new OutputPass());

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = window.innerWidth < 768 ? 55 : 46;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setSize(window.innerWidth, window.innerHeight);
  crtPass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
}

function updateFps(now) {
  frameCount += 1;
  const elapsed = now - fpsWindowStart;
  if (elapsed < 1000) return;

  const fps = Math.round((frameCount * 1000) / elapsed);
  if (fps < 40 && currentDpr > 0.7) {
    lowFpsWindows += 1;
  } else {
    lowFpsWindows = 0;
  }

  if (lowFpsWindows >= 3) {
    currentDpr = Math.max(0.7, currentDpr - 0.15);
    renderer.setPixelRatio(currentDpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setPixelRatio(currentDpr);
    composer.setSize(window.innerWidth, window.innerHeight);
    lowFpsWindows = 0;
  }

  frameCount = 0;
  fpsWindowStart = now;
}

function render(now) {
  if (disposed) return;
  animationTime = (now - startTime) / 1000;
  const delta = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  oceanUniforms.uTime.value = animationTime;
  updateCanTransforms(animationTime, delta);
  updateBucket(animationTime, delta);
  updatePalmSway(animationTime, delta);
  updateFlavorTransition(animationTime, delta);
  controls.update();
  composer.render();
  updateFps(now);
  requestAnimationFrame(render);
}

function dispose() {
  disposed = true;
  controls.dispose();
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => {
      materials.add(material);
      if (material.map) textures.add(material.map);
    });
  });
  canLabelTextures.forEach((texture) => textures.add(texture));
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  renderer.dispose();
}

window.addEventListener("resize", resize, { passive: true });
window.addEventListener("pagehide", dispose, { once: true });
requestAnimationFrame(render);
