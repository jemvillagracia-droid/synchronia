// Plays the System Timer's alarm sounds: the original battle march "Operation Sortie" (scripts/alarm/score.ts,
// rendered to lossless files so it loops sample-exactly), a short warning call and a "systems restored" cue.
const BASE = `${import.meta.env.BASE_URL}sounds/`;
const FILES = { loop: 'battle-loop.flac', warning: 'warning.flac', restored: 'restored.flac' } as const;
type Cue = keyof typeof FILES;

let ctx: AudioContext | null = null;
const buffers: Partial<Record<Cue, Promise<AudioBuffer>>> = {};
let playing: { src: AudioBufferSourceNode; gain: GainNode; stopTimer: number } | null = null;
const listeners = new Set<(on: boolean) => void>();
const emit = () => listeners.forEach((f) => f(!!playing));

function audio() {
  ctx ||= new AudioContext({ latencyHint: 'playback' });
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
function load(cue: Cue) {
  return (buffers[cue] ||= fetch(BASE + FILES[cue]).then((r) => { if (!r.ok) throw new Error(`Sound ${FILES[cue]} missing`); return r.arrayBuffer(); })
    .then((b) => audio().decodeAudioData(b))
    .catch((e) => { delete buffers[cue]; throw e; }));
}
/** Perceptual volume: 0–100 → gain (quieter steps at the low end). */
const gainOf = (v: number) => Math.max(0.0001, (Math.max(0, Math.min(100, v)) / 100) ** 2);

export const onAlarmChange = (f: (on: boolean) => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const alarmPlaying = () => !!playing;

/** Decodes the sounds ahead of time (when the browser is idle) so an alarm starts instantly. */
export function prepareAlarm() {
  const go = () => { for (const c of Object.keys(FILES) as Cue[]) void load(c).catch(() => {}); };
  const w = window as Window & { requestIdleCallback?: (f: () => void) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(go); else window.setTimeout(go, 1500);
}

/** The battle march, looping seamlessly until stopAlarm() — or `maxSeconds`, as a safety stop. */
export async function playBattleLoop(volume = 70, maxSeconds = 300) {
  stopAlarm(0.05);
  try {
    const a = audio(); const buf = await load('loop');
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = 0; src.loopEnd = buf.duration;
    const gain = a.createGain(); const t = a.currentTime;
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(gainOf(volume), t + 0.05);
    src.connect(gain); gain.connect(a.destination); src.start(t);
    playing = { src, gain, stopTimer: window.setTimeout(() => stopAlarm(), maxSeconds * 1000) };
    emit();
    return true;
  } catch { return false; }
}

/** Fades the march out. */
export function stopAlarm(fade = 0.6) {
  if (!playing || !ctx) return;
  const { src, gain, stopTimer } = playing; playing = null; window.clearTimeout(stopTimer);
  const t = ctx.currentTime; const f = Math.max(0.02, fade);
  gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t); gain.gain.exponentialRampToValueAtTime(0.0001, t + f);
  try { src.stop(t + f + 0.02); } catch { /* already stopped */ }
  emit();
}

export async function playCue(cue: 'warning' | 'restored', volume = 70) {
  try {
    const a = audio(); const buf = await load(cue);
    const src = a.createBufferSource(); src.buffer = buf; const g = a.createGain(); g.gain.value = gainOf(volume);
    src.connect(g); g.connect(a.destination); src.start();
    return true;
  } catch { return false; }
}
