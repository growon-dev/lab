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
  source.playbackRate.value = 0.8 + Math.random() * 0.4;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(gain);
  source.start(start);
  source.stop(start + duration);
  return { source, gain };
}

// 캔 뚜껑이 찢어지는 짧은 파열음 + 탄산이 빠지는 긴 쉭 소리
export function playCanOpen() {
  ensureContext();
  const now = context.currentTime;

  const crack = noiseVoice(now, 0.2);
  const crackFilter = context.createBiquadFilter();
  crackFilter.type = "highpass";
  crackFilter.frequency.value = 2600;
  crack.gain.gain.setValueAtTime(0.0001, now);
  crack.gain.gain.exponentialRampToValueAtTime(0.9, now + 0.004);
  crack.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  crack.gain.connect(crackFilter).connect(master);

  const fizz = noiseVoice(now + 0.02, 1.5);
  const fizzFilter = context.createBiquadFilter();
  fizzFilter.type = "bandpass";
  fizzFilter.Q.value = 0.9;
  fizzFilter.frequency.setValueAtTime(5200, now + 0.02);
  fizzFilter.frequency.exponentialRampToValueAtTime(2400, now + 1.4);
  fizz.gain.gain.setValueAtTime(0.0001, now + 0.02);
  fizz.gain.gain.exponentialRampToValueAtTime(0.22, now + 0.07);
  fizz.gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
  fizz.gain.connect(fizzFilter).connect(master);
}

// 물방울 하나. 주파수가 위로 튀어 올라가는 게 물소리로 들리는 핵심
function bubble(start, base) {
  const osc = context.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(base, start);
  osc.frequency.exponentialRampToValueAtTime(base * 2.4, start + 0.055);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.16, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + 0.1);
}

// 양동이로 물을 퍼내 쏟는 소리: 굵은 물줄기 + 흩어지는 물방울
export function playPour(duration = 1.8) {
  ensureContext();
  const now = context.currentTime;

  const stream = noiseVoice(now, duration + 0.4);
  const streamFilter = context.createBiquadFilter();
  streamFilter.type = "bandpass";
  streamFilter.Q.value = 0.7;
  streamFilter.frequency.setValueAtTime(700, now);
  streamFilter.frequency.exponentialRampToValueAtTime(1900, now + duration * 0.45);
  streamFilter.frequency.exponentialRampToValueAtTime(600, now + duration);
  stream.gain.gain.setValueAtTime(0.0001, now);
  stream.gain.gain.exponentialRampToValueAtTime(0.3, now + 0.18);
  stream.gain.gain.setValueAtTime(0.3, now + duration * 0.6);
  stream.gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.35);
  stream.gain.connect(streamFilter).connect(master);

  const count = Math.round(duration * 12);
  for (let i = 0; i < count; i += 1) {
    bubble(now + 0.1 + (i / count) * duration, 380 + Math.random() * 900);
  }
}

export function setMuted(muted) {
  if (master) master.gain.value = muted ? 0 : 0.5;
}
