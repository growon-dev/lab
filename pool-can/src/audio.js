let context = null;
let noiseBuffer = null;
let master = null;

function ensureContext() {
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)();
    const frames = context.sampleRate * 2;
    noiseBuffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) samples[i] = Math.random() * 2 - 1;
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
  }
  if (context.state === "suspended") context.resume();
  return context;
}

function noiseVoice(start, duration) {
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  source.playbackRate.value = 0.85 + Math.random() * 0.3;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(gain);
  source.start(start);
  source.stop(start + duration);
  return gain;
}

function whoosh(start) {
  const duration = 0.42;
  const gain = noiseVoice(start, duration);
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 4.2;
  band.frequency.setValueAtTime(460, start);
  band.frequency.exponentialRampToValueAtTime(2700, start + 0.19);
  band.frequency.exponentialRampToValueAtTime(720, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.36, start + 0.11);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(band).connect(master);
}

function glug(start, base) {
  const osc = context.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(base, start);
  osc.frequency.exponentialRampToValueAtTime(base * 1.6, start + 0.08);
  const body = context.createGain();
  body.gain.setValueAtTime(0.0001, start);
  body.gain.exponentialRampToValueAtTime(0.32, start + 0.01);
  body.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
  osc.connect(body).connect(master);
  osc.start(start);
  osc.stop(start + 0.15);

  const splutter = noiseVoice(start, 0.1);
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 2.4;
  band.frequency.value = base * 5.5;
  splutter.gain.setValueAtTime(0.0001, start);
  splutter.gain.exponentialRampToValueAtTime(0.09, start + 0.008);
  splutter.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
  splutter.connect(band).connect(master);
}

function streamBed(start, end, peak) {
  const bed = noiseVoice(start, end - start + 0.32);
  const bedFilter = context.createBiquadFilter();
  bedFilter.type = "bandpass";
  bedFilter.Q.value = 1.1;
  bedFilter.frequency.setValueAtTime(900, start);
  bedFilter.frequency.exponentialRampToValueAtTime(1500, end);
  bed.gain.setValueAtTime(0.0001, start);
  bed.gain.exponentialRampToValueAtTime(peak, start + 0.12);
  bed.gain.exponentialRampToValueAtTime(0.0001, end + 0.3);
  bed.connect(bedFilter).connect(master);
}

function glugRun(start, end, topPitch) {
  streamBed(start, end, 0.08);
  let at = start;
  let pitch = topPitch;
  while (at < end) {
    glug(at, pitch);
    at += 0.155 + Math.random() * 0.07;
    pitch *= 0.935;
  }
}

export function playWhoosh() {
  ensureContext();
  whoosh(context.currentTime);
}

export function playCanToss() {
  ensureContext();
  glugRun(context.currentTime + 0.72, context.currentTime + 2.0, 310);
}

function leafGrain(start, decay) {
  const gain = noiseVoice(start, 0.06);
  const high = context.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 2800 + Math.random() * 4200;
  const peak = (0.05 + Math.random() * 0.08) * decay;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.02 + Math.random() * 0.03);
  gain.connect(high).connect(master);
}

export function playPalmRustle() {
  ensureContext();
  const now = context.currentTime;
  const duration = 1.9;

  const bed = noiseVoice(now, duration + 0.25);
  const high = context.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 1800;
  const shape = context.createBiquadFilter();
  shape.type = "bandpass";
  shape.Q.value = 0.55;
  shape.frequency.setValueAtTime(4400, now);
  shape.frequency.exponentialRampToValueAtTime(2500, now + duration);
  bed.gain.setValueAtTime(0.0001, now);
  bed.gain.exponentialRampToValueAtTime(0.13, now + 0.1);
  bed.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.2);
  bed.connect(high).connect(shape).connect(master);

  let at = 0;
  while (at < duration) {
    leafGrain(now + at, Math.exp(-at * 1.5));
    at += 0.012 + Math.random() * 0.055;
  }
}

export function playBucketPour() {
  ensureContext();
  const now = context.currentTime;
  streamBed(now + 0.32, now + 1.9, 0.26);
}
