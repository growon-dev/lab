import * as THREE from "three";
import { mobile, motionScale, CAN_Z } from "./shared.js";
import { DEFAULT_PALETTE } from "./flavors.js";

const WAVES = [
  { dir: [1, 0.12], amp: 0.68, len: 40, speed: 0.76, chop: 0.3, phase: 0 },
  { dir: [0.82, 0.57], amp: 0.36, len: 24, speed: 0.86, chop: 0.28, phase: 1.7 },
  { dir: [-0.28, 1], amp: 0.23, len: 17, speed: 0.92, chop: 0.26, phase: 4 },
  { dir: [0.28, -1], amp: 0.14, len: 10, speed: 0.98, chop: 0.24, phase: 2.4 },
  { dir: [-0.92, -0.24], amp: 0.085, len: 6.2, speed: 1.08, chop: 0.22, phase: 5.3 },
  { dir: [0.62, -0.78], amp: 0.052, len: 3.8, speed: 1.2, chop: 0.2, phase: 0.9 },
  { dir: [-0.58, 0.82], amp: 0.032, len: 2.25, speed: 1.32, chop: 0.18, phase: 3.1 },
];

const AMP_SCALE = 0.3;

const waveRuntime = WAVES.map(({ dir, amp, len, speed, phase }) => {
  const length = Math.hypot(dir[0], dir[1]);
  const k = (Math.PI * 2) / len;
  return {
    x: dir[0] / length,
    y: dir[1] / length,
    amp: amp * AMP_SCALE,
    k,
    c: Math.sqrt(9.81 / k) * speed,
    phase,
  };
});

const glslFloat = (n) => (Number.isInteger(n) ? `${n}.0` : `${n}`);
const waveCalls = WAVES.map(
  ({ dir, amp, len, speed, chop, phase }) =>
    `applyWave(displaced, slope, flowingOrigin, vec2(${glslFloat(dir[0])}, ${glslFloat(dir[1])}), ${glslFloat(amp)}, ${glslFloat(len)}, ${glslFloat(speed)}, ${glslFloat(chop)}, ${glslFloat(phase)});`,
).join("\n    ");

const oceanVertexShader = `
  uniform float uTime;
  uniform float uMotion;
  uniform vec2 uFlavorOrigin;
  uniform float uFlavorProgress;
  uniform float uImpactTime;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vWaveHeight;
  varying float vWaveSlope;
  varying float vDistance;
  varying float vRippleEnergy;

  const float PI = 3.141592653589793;

  float ripplePacket(
    float distanceFromImpact,
    float delay,
    float speed,
    float amplitude,
    float phase
  ) {
    float age = max(uImpactTime - delay, 0.0);
    float activation = smoothstep(delay, delay + 0.08, uImpactTime);
    float radius = 0.8 + age * speed;
    float delta = distanceFromImpact - radius;
    float envelope = exp(-pow(delta * 0.165, 2.0));
    float decay = exp(-age * 0.58);
    return sin(delta * 0.72 + phase) * envelope * activation * decay * amplitude;
  }

  void applyWave(
    inout vec3 displaced,
    inout vec2 slope,
    vec2 origin,
    vec2 direction,
    float amplitude,
    float wavelength,
    float speed,
    float chop,
    float phase
  ) {
    amplitude *= ${glslFloat(AMP_SCALE)};
    vec2 dir = normalize(direction);
    float k = 2.0 * PI / wavelength;
    float c = sqrt(9.81 / k) * speed;
    float f = k * (dot(dir, origin) - c * uTime * uMotion) + phase;
    float sinF = sin(f);
    float cosF = cos(f);

    displaced.x += dir.x * amplitude * chop * cosF;
    displaced.y += dir.y * amplitude * chop * cosF;
    displaced.z += amplitude * sinF;
    slope += dir * amplitude * k * cosF;
  }

  void main() {
    vec2 origin = position.xy;
    float slowTime = uTime * uMotion;
    vec2 warp = vec2(
      sin(origin.y * 0.038 + slowTime * 0.07) + sin(origin.x * 0.019 - slowTime * 0.045),
      cos(origin.x * 0.031 - slowTime * 0.055) + cos(origin.y * 0.017 + slowTime * 0.035)
    ) * 1.45;
    vec2 flowingOrigin = origin + warp;
    vec3 displaced = position;
    vec2 slope = vec2(0.0);

    ${waveCalls}

    vRippleEnergy = 0.0;
    if (uImpactTime >= 0.0) {
      vec2 flatWorld = vec2(displaced.x, -displaced.y);
      vec2 impactVectorA = flatWorld - uFlavorOrigin;
      vec2 impactVectorB = flatWorld - (uFlavorOrigin + vec2(0.58, -0.34));
      vec2 impactVectorC = flatWorld - (uFlavorOrigin + vec2(-0.42, 0.48));
      float radialWarp =
        sin(flatWorld.x * 0.18 + uTime * 0.31) * 0.48 +
        cos(flatWorld.y * 0.15 - uTime * 0.24) * 0.39 +
        sin((flatWorld.x + flatWorld.y) * 0.07) * 0.31;
      float distanceA = length(impactVectorA) + radialWarp;
      float distanceB = length(impactVectorB) + radialWarp * 0.72;
      float distanceC = length(impactVectorC) - radialWarp * 0.54;
      float sampleStep = 0.24;

      float rippleA = ripplePacket(distanceA, 0.48, 8.6, 0.34, 0.0);
      float rippleB = ripplePacket(distanceB, 0.91, 7.7, 0.19, 1.35);
      float rippleC = ripplePacket(distanceC, 1.37, 6.9, 0.11, 2.45);
      float contact =
        smoothstep(0.46, 0.58, uImpactTime) *
        (1.0 - smoothstep(1.94, 2.22, uImpactTime));
      float dimple = -exp(-distanceA * distanceA * 0.19) * contact * 0.15;
      displaced.z += rippleA + rippleB + rippleC + dimple;

      float derivativeA = (
        ripplePacket(distanceA + sampleStep, 0.48, 8.6, 0.34, 0.0) -
        ripplePacket(max(distanceA - sampleStep, 0.0), 0.48, 8.6, 0.34, 0.0)
      ) / (sampleStep * 2.0);
      float derivativeB = (
        ripplePacket(distanceB + sampleStep, 0.91, 7.7, 0.19, 1.35) -
        ripplePacket(max(distanceB - sampleStep, 0.0), 0.91, 7.7, 0.19, 1.35)
      ) / (sampleStep * 2.0);
      float derivativeC = (
        ripplePacket(distanceC + sampleStep, 1.37, 6.9, 0.11, 2.45) -
        ripplePacket(max(distanceC - sampleStep, 0.0), 1.37, 6.9, 0.11, 2.45)
      ) / (sampleStep * 2.0);
      float dimpleDerivative =
        0.38 * distanceA * exp(-distanceA * distanceA * 0.19) * contact * 0.15;
      vec2 rippleSlope =
        normalize(impactVectorA + vec2(0.0001)) * (derivativeA + dimpleDerivative) +
        normalize(impactVectorB + vec2(0.0001)) * derivativeB +
        normalize(impactVectorC + vec2(0.0001)) * derivativeC;
      slope.x += rippleSlope.x;
      slope.y -= rippleSlope.y;

      float rippleAngle = atan(impactVectorA.y, impactVectorA.x);
      float arcBreakup = 0.68 + 0.32 * sin(rippleAngle * 4.7 + distanceA * 0.12 + uTime * 0.28);
      vRippleEnergy = clamp(length(rippleSlope) * 4.8 * arcBreakup, 0.0, 1.0);
    }

    vec3 localNormal = normalize(vec3(-slope.x, -slope.y, 1.0));
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);

    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    vWaveHeight = worldPosition.y;
    vWaveSlope = length(slope);
    vDistance = distance(cameraPosition, worldPosition.xyz);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const oceanFragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uMotion;
  uniform vec3 uSunDirection;
  uniform vec2 uFlavorOrigin;
  uniform float uFlavorProgress;
  uniform float uImpactTime;
  uniform vec3 uFromDeep;
  uniform vec3 uFromMid;
  uniform vec3 uFromShallow;
  uniform vec3 uFromFoam;
  uniform vec3 uFromFog;
  uniform vec3 uToDeep;
  uniform vec3 uToMid;
  uniform vec3 uToShallow;
  uniform vec3 uToFoam;
  uniform vec3 uToFog;
  uniform vec3 uFlavorAccent;
  uniform vec2 uCanPos;
  uniform float uCanRadius;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vWaveHeight;
  varying float vWaveSlope;
  varying float vDistance;
  varying float vRippleEnergy;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
    #ifdef MOBILE
    for (int i = 0; i < 2; i++) {
    #else
    for (int i = 0; i < 3; i++) {
    #endif
      value += amplitude * noise(p);
      p = rotation * p * 2.04 + 9.7;
      amplitude *= 0.5;
    }
    return value;
  }

  float rippleDerivative(
    float distanceFromImpact,
    float delay,
    float speed,
    float amplitude,
    float phase
  ) {
    float age = max(uImpactTime - delay, 0.0);
    float activation = smoothstep(delay, delay + 0.08, uImpactTime);
    float radius = 0.8 + age * speed;
    float delta = distanceFromImpact - radius;
    float envelope = exp(-pow(delta * 0.165, 2.0));
    float decay = exp(-age * 0.58);
    float carrier = delta * 0.72 + phase;
    return (
      0.72 * cos(carrier) -
      2.0 * 0.165 * 0.165 * delta * sin(carrier)
    ) * envelope * activation * decay * amplitude;
  }

  float causticWeb(vec2 uv, float t) {
    vec2 p = mod(uv, 6.283185) - 250.0;
    vec2 i = p;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 3; n++) {
      float phase = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(phase - i.x) + sin(phase + i.y), sin(phase - i.y) + cos(phase + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + phase) / inten), p.y / (cos(i.y + phase) / inten)));
    }
    c /= 3.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
  }

  vec3 skyColor(vec3 direction) {
    float h = normalize(direction).y;
    vec3 zenith = vec3(0.003, 0.009, 0.032);
    vec3 horizon = vec3(0.03, 0.085, 0.235);
    vec3 below = vec3(0.008, 0.022, 0.055);
    vec3 sky = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
    sky = mix(below, sky, smoothstep(-0.08, 0.05, h));
    float sunAmount = max(dot(normalize(direction), normalize(uSunDirection)), 0.0);
    sky += vec3(0.8, 0.88, 1.0) * pow(sunAmount, 360.0) * 0.6;
    return sky;
  }

  vec3 poolReflection(vec3 origin, vec3 dir) {
    dir.y = max(dir.y, 0.015);
    float tHit = 1e9;
    if (abs(dir.x) > 1e-4) tHit = min(tHit, ((dir.x > 0.0 ? 27.4 : -27.4) - origin.x) / dir.x);
    if (abs(dir.z) > 1e-4) tHit = min(tHit, ((dir.z > 0.0 ? 27.4 : -27.4) - origin.z) / dir.z);
    float hitY = origin.y + tHit * dir.y;
    if (hitY < 0.16) {
      float coping = smoothstep(-0.08, 0.03, hitY);
      vec3 wall = mix(vec3(0.22, 0.36, 0.5), vec3(0.78, 0.86, 0.96), coping);
      wall *= 0.8 + 0.2 * exp(-tHit * 0.03);
      return wall;
    }
    return skyColor(dir);
  }

  void main() {
    float transitionEase = uFlavorProgress * uFlavorProgress * (3.0 - 2.0 * uFlavorProgress);
    float colorRadius = mix(-8.0, 220.0, pow(transitionEase, 1.55));
    float flavorDistance = distance(vWorldPosition.xz, uFlavorOrigin);
    float boundaryNoise = (noise(vWorldPosition.xz * 0.055 + uTime * 0.018) - 0.5) * 13.0;
    float organicRadius = colorRadius + boundaryNoise;
    float flavorMask = 1.0 - smoothstep(organicRadius, organicRadius + 10.0, flavorDistance);

    vec3 deepWater = mix(uFromDeep, uToDeep, flavorMask);
    vec3 midWater = mix(uFromMid, uToMid, flavorMask);
    vec3 shallowLight = mix(uFromShallow, uToShallow, flavorMask);
    vec3 foamColor = mix(uFromFoam, uToFoam, flavorMask);
    vec3 fogColor = mix(uFromFog, uToFog, flavorMask);

    float plumeNoise = 0.5;
    float underwaterPlume = 0.0;
    if (uFlavorProgress > 0.015 && uFlavorProgress < 1.0) {
      vec2 plumeCoordinate =
        (vWorldPosition.xz - uFlavorOrigin) * 0.105 +
        vec2(uTime * 0.018, -uTime * 0.012);
      plumeNoise = fbm(plumeCoordinate);
      float plumeProgress = smoothstep(0.0, 0.78, uFlavorProgress);
      float plumeRadius = mix(1.0, 68.0, plumeProgress);
      float plumeEdge = plumeRadius * (0.48 + plumeNoise * 0.72);
      underwaterPlume = 1.0 - smoothstep(plumeEdge, plumeEdge + 5.5, flavorDistance);
      underwaterPlume *= smoothstep(0.015, 0.12, uFlavorProgress);
      underwaterPlume *= 1.0 - smoothstep(0.82, 1.0, uFlavorProgress);
    }

    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float detailFade = 1.0 - smoothstep(30.0, 170.0, vDistance);
    vec2 flow = vWorldPosition.xz * 0.29;
    flow += vec2(uTime * 0.052 * uMotion, -uTime * 0.031 * uMotion);
    float detail = fbm(flow);
    float detailX = fbm(flow + vec2(0.045, 0.0)) - detail;
    float detailZ = fbm(flow + vec2(0.0, 0.045)) - detail;
    #ifndef MOBILE
    if (detailFade > 0.0) {
      vec2 flow2 = vWorldPosition.xz * 1.35;
      flow2 += vec2(-uTime * 0.071 * uMotion, uTime * 0.048 * uMotion);
      float detail2 = noise(flow2);
      detailX += (noise(flow2 + vec2(0.06, 0.0)) - detail2) * 0.55 * detailFade;
      detailZ += (noise(flow2 + vec2(0.0, 0.06)) - detail2) * 0.55 * detailFade;
    }
    #endif
    vec3 microNormal = normalize(vec3(-detailX * 5.2, 0.55, -detailZ * 5.2));
    vec3 normal = normalize(mix(vWorldNormal, microNormal, 0.12 + 0.24 * detailFade));

    float fragmentRippleEnergy = 0.0;
    if (uImpactTime >= 0.0) {
      vec2 impactVectorA = vWorldPosition.xz - uFlavorOrigin;
      vec2 impactVectorB = vWorldPosition.xz - (uFlavorOrigin + vec2(0.58, -0.34));
      vec2 impactVectorC = vWorldPosition.xz - (uFlavorOrigin + vec2(-0.42, 0.48));
      float rippleWarp =
        sin(vWorldPosition.x * 0.18 + uTime * 0.31) * 0.48 +
        cos(vWorldPosition.z * 0.15 - uTime * 0.24) * 0.39 +
        sin((vWorldPosition.x + vWorldPosition.z) * 0.07) * 0.31;
      float distanceA = length(impactVectorA) + rippleWarp;
      float distanceB = length(impactVectorB) + rippleWarp * 0.72;
      float distanceC = length(impactVectorC) - rippleWarp * 0.54;
      vec2 fragmentRippleSlope =
        normalize(impactVectorA + vec2(0.0001)) * rippleDerivative(distanceA, 0.48, 8.6, 0.34, 0.0) +
        normalize(impactVectorB + vec2(0.0001)) * rippleDerivative(distanceB, 0.91, 7.7, 0.19, 1.35) +
        normalize(impactVectorC + vec2(0.0001)) * rippleDerivative(distanceC, 1.37, 6.9, 0.11, 2.45);
      float rippleBreakup = 0.66 + noise(
        vWorldPosition.xz * 0.115 + vec2(uTime * 0.025, -uTime * 0.018)
      ) * 0.34;
      fragmentRippleSlope *= rippleBreakup;
      normal = normalize(
        normal + vec3(-fragmentRippleSlope.x * 1.75, 0.0, -fragmentRippleSlope.y * 1.75)
      );
      fragmentRippleEnergy = clamp(length(fragmentRippleSlope) * 5.2, 0.0, 1.0);
    }

    float ndv = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = 0.02 + 0.68 * pow(1.0 - ndv, 5.0);
    vec3 reflected = poolReflection(vWorldPosition, reflect(-viewDirection, normal));

    float depthPattern = fbm(vWorldPosition.xz * 0.019 + vec2(-0.1, uTime * 0.008 * uMotion));
    vec3 bodyColor = mix(deepWater, midWater, 0.24 + depthPattern * 0.34);
    bodyColor = mix(bodyColor, shallowLight, pow(max(normal.y, 0.0), 4.0) * 0.16);

    vec2 floorUv = vWorldPosition.xz + normal.xz * 0.55;
    vec2 tileId = floor(floorUv * 2.0);
    vec2 tileCell = abs(fract(floorUv * 2.0) - 0.5);
    float grout = smoothstep(0.40, 0.465, max(tileCell.x, tileCell.y));
    float tileTone = hash(tileId);
    float caustic = clamp(causticWeb(floorUv * 0.85, uTime * 0.55 * uMotion), 0.0, 1.4);
    float floorVis = (1.0 - fresnel) * (1.0 - smoothstep(30.0, 85.0, vDistance));
    vec3 tileColor = mix(midWater, shallowLight, 0.3 + tileTone * 0.3);
    tileColor += foamColor * caustic * 1.7;
    tileColor = mix(tileColor, deepWater, grout * 0.55);
    vec2 lampP = abs(floorUv);
    float lampDist = min(distance(lampP, vec2(13.7, 27.4)), distance(lampP, vec2(27.4, 13.7)));
    vec3 lampColor = vec3(0.30, 0.80, 0.96);
    float lampHot = exp(-lampDist * lampDist * 0.09);
    float lampSpread = exp(-lampDist * 0.14);
    tileColor += lampColor * (lampHot * 2.4 + lampSpread * (0.4 + caustic * 0.9));
    bodyColor = mix(bodyColor, tileColor, floorVis * 0.85);

    vec3 halfVector = normalize(uSunDirection + viewDirection);
    float ndh = max(dot(normal, halfVector), 0.0);
    #ifdef MOBILE
    float sparkle = 0.4;
    #else
    float sparkle = smoothstep(0.55, 1.0, noise(vWorldPosition.xz * 5.5 + uTime * 0.6 * uMotion));
    #endif
    float specular = pow(ndh, 620.0) * (2.4 + sparkle * 9.0);
    specular += pow(ndh, 90.0) * 0.35;
    specular += pow(ndh, 24.0) * 0.05;
    vec3 sunGlitter = vec3(0.75, 0.85, 1.0) * specular * (0.4 + detail * 0.8);

    float backLight = pow(max(dot(viewDirection, -uSunDirection), 0.0), 2.0);
    float crestGlow = smoothstep(0.15, 1.1, vWaveHeight) * backLight;
    vec3 scatter = shallowLight * (backLight * 0.22 + crestGlow * 0.5) * (1.0 - ndv);

    vec2 foamFlow = vWorldPosition.xz * vec2(0.085, 0.23);
    foamFlow += vec2(-uTime * 0.038, uTime * 0.021) * uMotion;
    float foamNoise = fbm(foamFlow);
    float foamLace = noise(foamFlow * 2.7 + vec2(uTime * 0.05 * uMotion, 0.0));
    float crest = smoothstep(0.34, 0.82, vWaveHeight + vWaveSlope * 0.22);
    float broken = smoothstep(0.58, 0.84, foamNoise + foamLace * 0.35 - 0.18);
    float foam = crest * broken * 0.62;
    foam += smoothstep(0.80, 0.94, foamNoise * 0.7 + foamLace * 0.45) * smoothstep(0.22, 0.55, vWaveSlope) * 0.10;
    foam *= 1.0 - smoothstep(120.0, 260.0, vDistance);

    float foamMask = clamp(foam, 0.0, 0.85);
    vec3 water = mix(bodyColor + scatter, reflected, fresnel * (1.0 - foamMask * 0.7));
    water += sunGlitter * (1.0 - foamMask);
    float foamLight = 0.72 + 0.38 * max(dot(normal, uSunDirection), 0.0);
    water = mix(water, foamColor * foamLight, foamMask);
    float rippleSheen = max(vRippleEnergy, fragmentRippleEnergy) * (0.06 + fresnel * 0.18);
    water = mix(water, reflected, clamp(rippleSheen, 0.0, 0.18));

    vec3 submergedDye = mix(uToDeep, uFlavorAccent, 0.38);
    water = mix(
      water,
      submergedDye,
      underwaterPlume * (1.0 - fresnel) * (0.28 + plumeNoise * 0.2)
    );

    float fogFactor = 1.0 - exp(-0.0055 * 0.0055 * vDistance * vDistance);
    fogFactor = clamp(fogFactor, 0.0, 0.86);
    water = mix(water, fogColor, fogFactor);

    float canDist = distance(vWorldPosition.xz, uCanPos);
    float canNear = 1.0 - smoothstep(uCanRadius - 0.2, uCanRadius + 1.35, canDist);
    float waterAlpha = 1.0 - canNear * canNear * 0.42;
    water *= 1.0 - (1.0 - smoothstep(uCanRadius, uCanRadius + 0.22, canDist)) * 0.15;

    gl_FragColor = vec4(water, waterAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function paletteColor(palette, key) {
  return new THREE.Color(palette[key]);
}

export const oceanUniforms = {
  uTime: { value: 0 },
  uMotion: { value: motionScale },
  uSunDirection: { value: new THREE.Vector3(26, 42, 54).normalize() },
  uFlavorOrigin: { value: new THREE.Vector2(9999, 9999) },
  uFlavorProgress: { value: 0 },
  uImpactTime: { value: -1 },
  uFromDeep: { value: paletteColor(DEFAULT_PALETTE, "deep") },
  uFromMid: { value: paletteColor(DEFAULT_PALETTE, "mid") },
  uFromShallow: { value: paletteColor(DEFAULT_PALETTE, "shallow") },
  uFromFoam: { value: paletteColor(DEFAULT_PALETTE, "foam") },
  uFromFog: { value: paletteColor(DEFAULT_PALETTE, "fog").multiplyScalar(0.32) },
  uToDeep: { value: paletteColor(DEFAULT_PALETTE, "deep") },
  uToMid: { value: paletteColor(DEFAULT_PALETTE, "mid") },
  uToShallow: { value: paletteColor(DEFAULT_PALETTE, "shallow") },
  uToFoam: { value: paletteColor(DEFAULT_PALETTE, "foam") },
  uToFog: { value: paletteColor(DEFAULT_PALETTE, "fog").multiplyScalar(0.32) },
  uFlavorAccent: { value: paletteColor(DEFAULT_PALETTE, "accent") },
  uCanPos: { value: new THREE.Vector2(0, CAN_Z) },
  uCanRadius: { value: mobile ? 1.06 : 1.15 },
};

export function setPaletteUniform(prefix, palette) {
  oceanUniforms[`${prefix}Deep`].value.setHex(palette.deep);
  oceanUniforms[`${prefix}Mid`].value.setHex(palette.mid);
  oceanUniforms[`${prefix}Shallow`].value.setHex(palette.shallow);
  oceanUniforms[`${prefix}Foam`].value.setHex(palette.foam);
  oceanUniforms[`${prefix}Fog`].value.setHex(palette.fog).multiplyScalar(0.32);
}

export function createOcean(scene) {
  const segments = mobile ? 128 : 224;
  const geometry = new THREE.PlaneGeometry(56, 56, segments, segments);
  const material = new THREE.ShaderMaterial({
    vertexShader: oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    uniforms: oceanUniforms,
    side: THREE.FrontSide,
    fog: false,
    transparent: true,
    defines: mobile ? { MOBILE: 1 } : {},
  });
  const ocean = new THREE.Mesh(geometry, material);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.65;
  scene.add(ocean);
}

function warpOceanCoordinate(localX, localY, time) {
  const slowTime = time * motionScale;
  return {
    x:
      localX +
      (Math.sin(localY * 0.038 + slowTime * 0.07) +
        Math.sin(localX * 0.019 - slowTime * 0.045)) *
        1.45,
    y:
      localY +
      (Math.cos(localX * 0.031 - slowTime * 0.055) +
        Math.cos(localY * 0.017 + slowTime * 0.035)) *
        1.45,
  };
}

export function sampleOcean(worldX, worldZ, time, targetNormal = new THREE.Vector3()) {
  const warped = warpOceanCoordinate(worldX, -worldZ, time);
  let height = -0.65;
  let slopeX = 0;
  let slopeY = 0;

  for (const wave of waveRuntime) {
    const phase = wave.k * (wave.x * warped.x + wave.y * warped.y - wave.c * time * motionScale) + wave.phase;
    const cosPhase = Math.cos(phase);
    height += wave.amp * Math.sin(phase);
    slopeX += wave.x * wave.amp * wave.k * cosPhase;
    slopeY += wave.y * wave.amp * wave.k * cosPhase;
  }

  targetNormal.set(-slopeX, 1, slopeY).normalize();
  return { height, normal: targetNormal };
}
