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
  const duration = 0.66;
  const gain = noiseVoice(start, duration);
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 4.2;
  band.frequency.setValueAtTime(460, start);
  band.frequency.exponentialRampToValueAtTime(2700, start + 0.3);
  band.frequency.exponentialRampToValueAtTime(720, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.36, start + 0.17);
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

function glugRun(start, end, topPitch) {
  const bed = noiseVoice(start, end - start + 0.32);
  const bedFilter = context.createBiquadFilter();
  bedFilter.type = "bandpass";
  bedFilter.Q.value = 1.1;
  bedFilter.frequency.setValueAtTime(900, start);
  bedFilter.frequency.exponentialRampToValueAtTime(1500, end);
  bed.gain.setValueAtTime(0.0001, start);
  bed.gain.exponentialRampToValueAtTime(0.08, start + 0.12);
  bed.gain.exponentialRampToValueAtTime(0.0001, end + 0.3);
  bed.connect(bedFilter).connect(master);

  let at = start;
  let pitch = topPitch;
  while (at < end) {
    glug(at, pitch);
    at += 0.082 + Math.random() * 0.05;
    pitch *= 0.958;
  }
}

export function playCanToss() {
  ensureContext();
  const now = context.currentTime;
  whoosh(now + 0.26);
  glugRun(now + 0.58, now + 1.96, 310);
}

export function playBucketPour() {
  ensureContext();
  const now = context.currentTime;
  glugRun(now + 0.32, now + 1.9, 230);
}
