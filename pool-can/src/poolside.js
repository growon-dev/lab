import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CAN_Z } from "./shared.js";

const skyDomeMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vDir;
    void main() {
      float h = normalize(vDir).y;
      vec3 zenith = vec3(0.003, 0.009, 0.032);
      vec3 horizon = vec3(0.016, 0.042, 0.13);
      vec3 below = vec3(0.005, 0.012, 0.034);
      vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
      col = mix(below, col, smoothstep(-0.08, 0.05, h));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

const palmSways = [];
let stringLightRig = null;

export function triggerPalmSway() {
  for (const sway of palmSways) sway.energy = 1;
}

export function updatePalmSway(time, delta) {
  for (const sway of palmSways) {
    if (sway.energy === 0) continue;
    sway.energy *= Math.exp(-delta * 1.1);
    if (sway.energy < 0.004) {
      sway.energy = 0;
      sway.palm.rotation.z = 0;
      sway.crown.rotation.set(0, 0, 0);
      for (const h of sway.holders) {
        h.holder.rotation.x = h.baseX;
        h.holder.rotation.z = h.baseZ;
      }
      continue;
    }
    const wave = sway.energy * Math.sin(time * 3.4 + sway.phase);
    sway.palm.rotation.z = wave * 0.022;
    sway.crown.rotation.z = wave * 0.1;
    sway.crown.rotation.x = sway.energy * Math.sin(time * 2.6 + sway.phase + 1.3) * 0.05;
    sway.holders.forEach((h, i) => {
      h.holder.rotation.x = h.baseX + sway.energy * Math.sin(time * 9 + i * 1.7 + sway.phase) * 0.1;
      h.holder.rotation.z = h.baseZ + sway.energy * Math.sin(time * 7 + i * 2.3) * 0.08;
    });
  }
  const rig = stringLightRig;
  if (rig && palmSways.length > 0) {
    const energy = palmSways[0].energy;
    if (energy > 0 || rig.active) {
      rig.active = energy > 0;
      const haloPosition = rig.haloGeometry.attributes.position;
      rig.bulbPoints.forEach(({ point }, i) => {
        const swingA = energy * Math.sin(time * 4.3 + point.x * 0.8 + i * 0.35) * 0.5;
        const swingB = energy * Math.sin(time * 3.6 + point.z * 0.7 + i * 0.55) * 0.4;
        const x = point.x + Math.sin(swingA) * rig.drop;
        const y = point.y - Math.cos(swingA) * rig.drop;
        const z = point.z + Math.sin(swingB) * rig.drop;
        rig.bulbMesh.setMatrixAt(i, rig.matrix.makeTranslation(x, y, z));
        haloPosition.setXYZ(i, x, y, z);
      });
      rig.bulbMesh.instanceMatrix.needsUpdate = true;
      haloPosition.needsUpdate = true;
    }
  }
}

export function createPoolside(scene, renderer) {
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(460, 32, 16), skyDomeMaterial);
  scene.add(skyDome);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(30, 16, 8), skyDomeMaterial));
  scene.environment = pmremGenerator.fromScene(envScene).texture;
  pmremGenerator.dispose();

  scene.add(new THREE.HemisphereLight(0x8fb3d9, 0x0a1420, 0.55));
  const keyLight = new THREE.DirectionalLight(0xcfe0ff, 1.6);
  keyLight.position.set(26, 42, 54);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x3a5a8c, 0.7);
  fillLight.position.set(-12, 10, 8);
  scene.add(fillLight);

  const poolside = new THREE.Group();
  scene.add(poolside);

  const starCount = 420;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const azimuth = Math.random() * Math.PI * 2;
    const altitude = Math.asin(Math.random() * 0.92 + 0.06);
    starPositions[i * 3] = Math.cos(altitude) * Math.cos(azimuth) * 430;
    starPositions[i * 3 + 1] = Math.sin(altitude) * 430;
    starPositions[i * 3 + 2] = Math.cos(altitude) * Math.sin(azimuth) * 430;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  poolside.add(new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xeef4ff, size: 3, sizeAttenuation: false,
      transparent: true, opacity: 1, depthWrite: false,
    }),
  ));

  const tileTexture = (() => {
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = tileCanvas.height = 256;
    const context = tileCanvas.getContext("2d");
    context.fillStyle = "#0c2135";
    context.fillRect(0, 0, 256, 256);
    const cells = 8;
    const size = 256 / cells;
    for (let row = 0; row < cells; row += 1) {
      for (let col = 0; col < cells; col += 1) {
        const tone = 150 + Math.floor(Math.random() * 55);
        context.fillStyle = `rgb(${tone - 80}, ${tone - 25}, ${tone})`;
        context.fillRect(col * size + 1.5, row * size + 1.5, size - 3, size - 3);
      }
    }
    const texture = new THREE.CanvasTexture(tileCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  })();

  const POOL_HALF = 27;
  const WALL_HEIGHT = 4.2;
  tileTexture.repeat.set(POOL_HALF * 2 / (8 * 0.45), WALL_HEIGHT / (8 * 0.45));
  const wallMaterial = new THREE.MeshStandardMaterial({
    map: tileTexture,
    roughness: 0.55,
    emissive: 0x16303f,
    emissiveMap: tileTexture,
    emissiveIntensity: 0.55,
  });
  const copingMaterial = new THREE.MeshStandardMaterial({
    color: 0xdde8f2,
    roughness: 0.5,
    emissive: 0x33455c,
  });
  const wallGeometry = new THREE.BoxGeometry(POOL_HALF * 2 + 1.6, WALL_HEIGHT, 0.8);
  const copingGeometry = new THREE.BoxGeometry(POOL_HALF * 2 + 2.4, 0.16, 1.3);
  for (let side = 0; side < 4; side += 1) {
    const holder = new THREE.Group();
    holder.rotation.y = side * Math.PI * 0.5;
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(0, -WALL_HEIGHT / 2, -POOL_HALF - 0.4);
    holder.add(wall);
    const coping = new THREE.Mesh(copingGeometry, copingMaterial);
    coping.position.set(0, 0.08, -POOL_HALF - 0.55);
    holder.add(coping);
    poolside.add(holder);
  }

  const deckShape = new THREE.Shape();
  deckShape.moveTo(-140, -140);
  deckShape.lineTo(140, -140);
  deckShape.lineTo(140, 140);
  deckShape.lineTo(-140, 140);
  const deckHole = new THREE.Path();
  const H = POOL_HALF + 0.9;
  deckHole.moveTo(-H, -H);
  deckHole.lineTo(H, -H);
  deckHole.lineTo(H, H);
  deckHole.lineTo(-H, H);
  deckShape.holes.push(deckHole);
  const deckGeometry = new THREE.ShapeGeometry(deckShape);
  {
    const positions = deckGeometry.attributes.position;
    const colors = new Float32Array(positions.count * 4).fill(1);
    for (let i = 0; i < positions.count; i += 1) {
      const r = Math.max(Math.abs(positions.getX(i)), Math.abs(positions.getY(i)));
      colors[i * 4 + 3] = THREE.MathUtils.clamp(1 - (r - H) / (110 - H), 0, 1);
    }
    deckGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  }
  const deck = new THREE.Mesh(
    deckGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x0d1930, roughness: 1,
      transparent: true, vertexColors: true, depthWrite: false,
    }),
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.16;
  poolside.add(deck);

  const trunkTexture = (() => {
    const trunkCanvas = document.createElement("canvas");
    trunkCanvas.width = 128;
    trunkCanvas.height = 256;
    const context = trunkCanvas.getContext("2d");
    context.fillStyle = "#877b69";
    context.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 60; i += 1) {
      const dark = Math.random() < 0.55;
      context.fillStyle = dark
        ? `rgba(45, 38, 30, ${0.12 + Math.random() * 0.18})`
        : `rgba(215, 205, 185, ${0.08 + Math.random() * 0.12})`;
      context.beginPath();
      context.ellipse(
        Math.random() * 128, Math.random() * 256,
        4 + Math.random() * 14, 8 + Math.random() * 26, 0, 0, Math.PI * 2,
      );
      context.fill();
    }
    for (let i = 0; i < 300; i += 1) {
      const shade = 95 + Math.random() * 105;
      context.strokeStyle = `rgba(${shade}, ${shade - 12}, ${shade - 30}, 0.45)`;
      const x = Math.random() * 128;
      const y = Math.random() * 256;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (Math.random() - 0.5) * 5, y + 14 + Math.random() * 40);
      context.stroke();
    }
    for (let y = 14; y < 256; y += 48 + Math.random() * 26) {
      const slope = (Math.random() - 0.5) * 10;
      context.save();
      context.translate(64, y);
      context.rotate(slope * 0.01);
      context.fillStyle = "rgba(40, 33, 25, 0.65)";
      context.fillRect(-70, 0, 140, 3 + Math.random() * 4);
      context.fillStyle = "rgba(228, 219, 200, 0.3)";
      context.fillRect(-70, 6, 140, 2);
      context.restore();
    }
    const texture = new THREE.CanvasTexture(trunkCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  })();
  const trunkMaterial = new THREE.MeshStandardMaterial({
    map: trunkTexture, bumpMap: trunkTexture, bumpScale: 0.9,
    roughness: 0.95,
    emissive: 0x1c150d, emissiveIntensity: 0.35,
  });
  const frondTexture = (() => {
    const frondCanvas = document.createElement("canvas");
    frondCanvas.width = 64;
    frondCanvas.height = 32;
    const context = frondCanvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 0, 32);
    gradient.addColorStop(0, "#6e6e6e");
    gradient.addColorStop(0.5, "#f4f4f4");
    gradient.addColorStop(1, "#6e6e6e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 32);
    context.fillStyle = "rgba(255, 255, 244, 0.85)";
    context.fillRect(0, 15, 64, 2);
    const texture = new THREE.CanvasTexture(frondCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  const frondMaterials = [
    { color: 0x77b13f, emissive: 0x1a2a0c },
    { color: 0x639633, emissive: 0x16240a },
    { color: 0x93953d, emissive: 0x21220a },
    { color: 0xa3843c, emissive: 0x241d08 },
  ].map(({ color, emissive }) => new THREE.MeshStandardMaterial({
    map: frondTexture, color, roughness: 0.85, side: THREE.DoubleSide,
    emissive, emissiveIntensity: 0.6,
  }));
  const coconutMaterial = new THREE.MeshStandardMaterial({
    color: 0x7f8b42, roughness: 0.8,
  });
  const coconutGeometry = new THREE.SphereGeometry(0.17, 10, 8);

  const leafletBase = new THREE.PlaneGeometry(1, 1, 4, 1);
  {
    leafletBase.translate(0.5, 0, 0);
    const p = leafletBase.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      p.setY(i, p.getY(i) * (1 - x * 0.85));
      p.setZ(i, 0.36 * x * x);
    }
  }

  const FROND_LENGTH = 3.4;
  const FROND_DROOP = 2.0;
  function buildFrondGeometry() {
    const parts = [];
    const rachis = new THREE.CatmullRomCurve3(
      [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const s = t * 0.94;
        return new THREE.Vector3(0, FROND_LENGTH * s, FROND_DROOP * s * s);
      }),
    );
    const rachisGeometry = new THREE.TubeGeometry(rachis, 12, 0.025, 5, false);
    {
      const position = rachisGeometry.attributes.position;
      const uv = rachisGeometry.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) {
        uv.setY(i, 0.02);
        const t = uv.getX(i);
        const s = t * 0.94;
        const cx = 0;
        const cy = FROND_LENGTH * s;
        const cz = FROND_DROOP * s * s;
        const shrink = 1 - t * 0.7;
        position.setXYZ(
          i,
          cx + (position.getX(i) - cx) * shrink,
          cy + (position.getY(i) - cy) * shrink,
          cz + (position.getZ(i) - cz) * shrink,
        );
      }
    }
    parts.push(rachisGeometry);
    const PAIRS = 32;
    for (let i = 0; i < PAIRS; i += 1) {
      const t = 0.06 + (i / (PAIRS - 1)) * 0.92;
      const length = 1.2 * Math.max(0.22, Math.sin(Math.PI * Math.pow(t, 0.75)) ** 0.7);
      const width = 0.11 * (1 - t * 0.35);
      const tilt = Math.atan2(2 * FROND_DROOP * t, FROND_LENGTH);
      const lift = 0.42 - t * 0.36;
      const sweep = 0.55 + t * 0.42;
      for (const side of [1, -1]) {
        const leaflet = leafletBase.clone();
        leaflet.scale(length, width, length);
        leaflet.rotateZ((side > 0 ? sweep : Math.PI - sweep) + (Math.random() - 0.5) * 0.1);
        leaflet.rotateY(side * (lift + (Math.random() - 0.5) * 0.14));
        leaflet.rotateX(tilt);
        leaflet.translate(0, FROND_LENGTH * t, FROND_DROOP * t * t);
        parts.push(leaflet);
      }
    }
    return mergeGeometries(parts, false);
  }
  const frondGeometry = buildFrondGeometry();

  function buildTrunkGeometry(spine) {
    const parts = [];
    const SEGMENTS = 18;
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    const radiusAt = (t) => 0.3 - t * 0.13 + (t < 0.12 ? (0.12 - t) * 1.4 : 0);
    for (let k = 0; k < SEGMENTS; k += 1) {
      const t0 = k / SEGMENTS;
      const t1 = (k + 1) / SEGMENTS;
      spine.getPointAt(t0, from);
      spine.getPointAt(t1, to);
      const segment = new THREE.CylinderGeometry(
        radiusAt(t1), radiusAt(t0), from.distanceTo(to) * 1.04, 12, 1, true,
      );
      quaternion.setFromUnitVectors(up, tangent.copy(to).sub(from).normalize());
      segment.applyQuaternion(quaternion);
      const mid = from.clone().lerp(to, 0.5);
      segment.translate(mid.x, mid.y, mid.z);
      parts.push(segment);
    }
    const merged = mergeGeometries(parts, false);
    const position = merged.attributes.position;
    const normal = merged.attributes.normal;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const bump =
        Math.sin(y * 8.7) * 0.011 +
        Math.sin(y * 3.1 + x * 15.7 + z * 21.3) * 0.013;
      position.setXYZ(
        i,
        x + normal.getX(i) * bump,
        y + normal.getY(i) * bump,
        z + normal.getZ(i) * bump,
      );
    }
    return merged;
  }

  function createPalm() {
    const palm = new THREE.Group();
    const spine = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.3, 2.4, 0.1),
      new THREE.Vector3(1.0, 4.9, 0.25),
      new THREE.Vector3(1.9, 6.9, 0.4),
    ]);
    palm.add(new THREE.Mesh(buildTrunkGeometry(spine), trunkMaterial));
    const crown = new THREE.Group();
    crown.position.set(1.9, 6.9, 0.4);
    const holders = [];
    for (let i = 0; i < 18; i += 1) {
      const holder = new THREE.Group();
      holder.rotation.order = "YXZ";
      holder.rotation.y = (i / 18) * Math.PI * 2 + ((i * 3) % 5) * 0.11;
      holder.rotation.x = 0.42 + ((i * 5) % 6) * 0.36;
      holder.rotation.z = ((i * 7) % 5 - 2) * 0.07;
      const age = Math.min(3, Math.floor((holder.rotation.x - 0.4) / 0.5));
      const frond = new THREE.Mesh(frondGeometry, frondMaterials[age]);
      frond.scale.setScalar(0.95 + ((i * 7) % 6) * 0.09);
      holder.add(frond);
      crown.add(holder);
      holders.push({ holder, baseX: holder.rotation.x, baseZ: holder.rotation.z });
    }
    for (const [cx, cz] of [[0.2, 0.16], [-0.18, 0.05], [0.02, -0.2]]) {
      const coconut = new THREE.Mesh(coconutGeometry, coconutMaterial);
      coconut.position.set(cx, -0.1, cz);
      crown.add(coconut);
    }
    palm.add(crown);
    palmSways.push({ palm, crown, holders, energy: 0, phase: palmSways.length * 1.9 });
    return palm;
  }

  const palmDefs = [
    [2, -33, 2.8, 1.45],
    [13, -30, 0.6, 1.05],
    [-16, -31, -0.9, 0.9],
    [31, 7, 1.7, 1.1],
    [-31, 16, -2.2, 0.95],
  ];
  const yAxis = new THREE.Vector3(0, 1, 0);
  const stringAnchors = [];
  for (const [px, pz, rotY, palmScale] of palmDefs) {
    const palm = createPalm();
    palm.position.set(px, 0.16, pz);
    palm.rotation.y = rotY;
    palm.scale.setScalar(palmScale);
    poolside.add(palm);
    stringAnchors.push(
      new THREE.Vector3(1.9, 6.1, 0.4)
        .multiplyScalar(palmScale)
        .applyAxisAngle(yAxis, rotY)
        .add(new THREE.Vector3(px, 0.16, pz)),
    );
  }

  const warmGlowTexture = (() => {
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 64;
    const context = glowCanvas.getContext("2d");
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 244, 214, 1.0)");
    gradient.addColorStop(0.12, "rgba(255, 214, 150, 0.55)");
    gradient.addColorStop(0.4, "rgba(255, 170, 90, 0.16)");
    gradient.addColorStop(1, "rgba(255, 150, 70, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(glowCanvas);
  })();
  {
    const spans = [[2, 0], [0, 1], [1, 3], [2, 4]];
    const wireParts = [];
    const bulbPoints = [];
    for (const [a, b] of spans) {
      const from = stringAnchors[a];
      const to = stringAnchors[b];
      const length = from.distanceTo(to);
      const mid = from.clone().lerp(to, 0.5);
      mid.y -= length * 0.13;
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      wireParts.push(new THREE.TubeGeometry(curve, 28, 0.02, 4, false));
      const bulbCount = Math.round(length / 2.1);
      for (let i = 1; i < bulbCount; i += 1) {
        const t = i / bulbCount;
        const point = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t);
        bulbPoints.push({ point, angle: Math.atan2(-tangent.z, tangent.x) });
      }
    }
    poolside.add(new THREE.Mesh(
      mergeGeometries(wireParts, false),
      new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: 0.95 }),
    ));
    const bulbTexture = (() => {
      const bulbCanvas = document.createElement("canvas");
      bulbCanvas.width = bulbCanvas.height = 64;
      const context = bulbCanvas.getContext("2d");
      const gradient = context.createLinearGradient(0, 0, 0, 64);
      gradient.addColorStop(0, "#7a4e22");
      gradient.addColorStop(0.4, "#ffd9a0");
      gradient.addColorStop(0.58, "#fff4da");
      gradient.addColorStop(1, "#ffc27c");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 40; i += 1) {
        context.fillStyle = `rgba(255, 255, 255, ${0.05 + Math.random() * 0.09})`;
        context.beginPath();
        context.arc(Math.random() * 64, 18 + Math.random() * 46, 1 + Math.random() * 4, 0, Math.PI * 2);
        context.fill();
      }
      const texture = new THREE.CanvasTexture(bulbCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    })();
    const BULB_DROP = 0.22;
    const stringBulbGeometry = new THREE.SphereGeometry(0.095, 12, 10);
    const bulbMesh = new THREE.InstancedMesh(
      stringBulbGeometry,
      new THREE.MeshBasicMaterial({ map: bulbTexture, toneMapped: false }),
      bulbPoints.length,
    );
    const socketGeometry = (() => {
      const cup = new THREE.CylinderGeometry(0.052, 0.068, 0.13, 8);
      cup.translate(0, -0.1, 0);
      return mergeGeometries([new THREE.BoxGeometry(0.17, 0.085, 0.085), cup], false);
    })();
    const socketMesh = new THREE.InstancedMesh(
      socketGeometry,
      new THREE.MeshStandardMaterial({ color: 0x0d0a08, roughness: 0.95 }),
      bulbPoints.length,
    );
    const instanceMatrix = new THREE.Matrix4();
    const haloPositions = new Float32Array(bulbPoints.length * 3);
    bulbPoints.forEach(({ point, angle }, i) => {
      bulbMesh.setMatrixAt(i, instanceMatrix.makeTranslation(point.x, point.y - BULB_DROP, point.z));
      socketMesh.setMatrixAt(i, instanceMatrix.makeRotationY(angle).setPosition(point.x, point.y, point.z));
      haloPositions.set([point.x, point.y - BULB_DROP, point.z], i * 3);
    });
    poolside.add(bulbMesh, socketMesh);
    const haloGeometry = new THREE.BufferGeometry();
    haloGeometry.setAttribute("position", new THREE.BufferAttribute(haloPositions, 3));
    poolside.add(new THREE.Points(haloGeometry, new THREE.PointsMaterial({
      map: warmGlowTexture, color: 0xffc98a, size: 1.9,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    stringLightRig = {
      bulbMesh, haloGeometry, bulbPoints,
      drop: BULB_DROP, matrix: new THREE.Matrix4(), active: false,
    };
    for (const [a, b] of spans) {
      const mid = stringAnchors[a].clone().lerp(stringAnchors[b], 0.5);
      mid.y += 1.2;
      const warmLight = new THREE.PointLight(0xffb46e, 55, 30, 2);
      warmLight.position.copy(mid);
      poolside.add(warmLight);
    }
  }

  const poolGlow = new THREE.PointLight(0x3fd2e6, 10, 12, 2);
  poolGlow.position.set(0, 0.3, CAN_Z);
  poolside.add(poolGlow);
}
