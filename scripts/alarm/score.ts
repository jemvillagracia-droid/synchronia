// SYNCHRONIA alarm music — "Operation Sortie", an original battle march written for this app.
// Regenerate the sound files with:  node scripts/alarm/render.cjs   (writes web/public/sounds/*.flac)
// It is composed here note by note and synthesised in the browser's audio engine (no recordings, no samples),
// in the spirit of a tense anime battle cue: a march at 138 BPM in D minor with brass fanfare, low brass stabs,
// timpani, snare, bass ostinato, cymbals and string tremolo. The loop is rendered once with its echo tail folded
// back onto its start, so it repeats with no gap or click.

type Ctx = BaseAudioContext;
const BPM = 138;
const BEAT = 60 / BPM;
const BARS = 8;
export const LOOP_SECONDS = BARS * 4 * BEAT;
const SR = 44100;
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

// ── Score (beats from the start of the loop; MIDI note numbers) ──
// Chords: Dm | Bb | C | A | Dm | Gm | Bb | A
const CHORDS: number[][] = [[50, 57, 62, 65], [46, 58, 62, 65], [48, 55, 60, 64], [45, 57, 61, 64], [50, 57, 62, 65], [43, 55, 58, 62], [46, 58, 62, 65], [45, 57, 61, 64]];
const ROOTS = [38, 34, 36, 33, 38, 31, 34, 33];
// Lead fanfare: [beat, length in beats, note]
const LEAD: [number, number, number][] = [
  [0, 0.75, 69], [0.75, 0.25, 74], [1, 0.5, 74], [1.5, 0.5, 76], [2, 1.5, 77], [3.5, 0.5, 76],
  [4, 0.75, 74], [4.75, 0.25, 77], [5, 1, 82], [6, 0.5, 81], [6.5, 0.5, 79], [7, 1, 77],
  [8, 0.75, 76], [8.75, 0.25, 79], [9, 0.5, 79], [9.5, 0.5, 81], [10, 1, 79], [11, 0.5, 76], [11.5, 0.5, 72],
  [12, 1.5, 73], [13.5, 0.5, 76], [14, 2, 81],
  [16, 0.75, 81], [16.75, 0.25, 77], [17, 0.5, 74], [17.5, 0.5, 77], [18, 1, 81], [19, 1, 86],
  [20, 0.75, 82], [20.75, 0.25, 81], [21, 1, 79], [22, 1, 74], [23, 1, 79],
  [24, 0.5, 77], [24.5, 0.5, 79], [25, 0.5, 81], [25.5, 0.5, 82], [26, 1, 84], [27, 0.5, 82], [27.5, 0.5, 81],
  [28, 2, 81], [30, 0.5, 79], [30.5, 0.5, 76], [31, 0.5, 73], [31.5, 0.5, 76],
];
// Low brass stabs within each bar: [beat, length]
const STABS: [number, number][] = [[0, 0.5], [0.75, 0.25], [1.5, 0.5], [2.5, 0.25], [3, 0.75]];

// ── Instruments ──
function noiseBuffer(ctx: Ctx, seconds: number) {
  const b = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
  return b;
}

interface Bus { dry: AudioNode; wet: AudioNode; noise: AudioBuffer }

function panTo(ctx: Ctx, node: AudioNode, pan: number, bus: Bus, wet = 0.25) {
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  node.connect(p); p.connect(bus.dry);
  const s = ctx.createGain(); s.gain.value = wet; p.connect(s); s.connect(bus.wet);
}

/** A brass voice: three detuned saws through a filter that opens on the attack (the "blat" of brass). */
function brass(ctx: Ctx, bus: Bus, t: number, dur: number, midi: number, vel: number, pan = 0, bright = 1) {
  const f = mtof(midi);
  const out = ctx.createGain();
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 2.2;
  const top = Math.min(9000, f * 9 * bright); const sus = Math.min(6000, f * 4.2 * bright);
  filt.frequency.setValueAtTime(f * 1.2, t);
  filt.frequency.exponentialRampToValueAtTime(top, t + 0.045);
  filt.frequency.exponentialRampToValueAtTime(sus, t + 0.2);
  filt.frequency.setValueAtTime(sus, t + dur);
  filt.frequency.exponentialRampToValueAtTime(f, t + dur + 0.12);
  const g = out.gain;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(vel, t + 0.025);
  g.exponentialRampToValueAtTime(vel * 0.72, t + 0.16);
  g.setValueAtTime(vel * 0.72, t + dur);
  g.exponentialRampToValueAtTime(0.0001, t + dur + 0.14);
  for (const cents of [-8, 0, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
    if (dur > 0.6) { // a little vibrato on held notes
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.3; const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + Math.min(dur, 0.6));
      lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.2);
    }
    o.connect(filt); o.start(t); o.stop(t + dur + 0.2);
  }
  filt.connect(out);
  panTo(ctx, out, pan, bus, 0.3);
}

function bass(ctx: Ctx, bus: Bus, t: number, dur: number, midi: number, vel: number) {
  const f = mtof(midi);
  const out = ctx.createGain();
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.setValueAtTime(1400, t); filt.frequency.exponentialRampToValueAtTime(380, t + dur); filt.Q.value = 1;
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vel, t + 0.01); out.gain.exponentialRampToValueAtTime(vel * 0.5, t + dur * 0.8); out.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
  const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = f;
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2; const sg = ctx.createGain(); sg.gain.value = 0.9;
  saw.connect(filt); sub.connect(sg); sg.connect(out); filt.connect(out);
  for (const o of [saw, sub]) { o.start(t); o.stop(t + dur + 0.08); }
  panTo(ctx, out, 0, bus, 0.05);
}

function timpani(ctx: Ctx, bus: Bus, t: number, midi: number, vel: number) {
  const f = mtof(midi);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vel, t + 0.006); out.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  for (const [mult, amp] of [[1, 1], [1.5, 0.35], [1.98, 0.2]] as const) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * mult * 1.35, t); o.frequency.exponentialRampToValueAtTime(f * mult, t + 0.06);
    const g = ctx.createGain(); g.gain.value = amp; o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.7);
  }
  const n = ctx.createBufferSource(); n.buffer = bus.noise; const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 420;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(vel * 0.9, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  n.connect(nf); nf.connect(ng); ng.connect(out); n.start(t, Math.random() * 2); n.stop(t + 0.15);
  panTo(ctx, out, -0.15, bus, 0.35);
}

function snare(ctx: Ctx, bus: Bus, t: number, vel: number) {
  const out = ctx.createGain();
  const n = ctx.createBufferSource(); n.buffer = bus.noise;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
  const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 3800; bp.gain.value = 6;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  n.connect(hp); hp.connect(bp); bp.connect(ng); ng.connect(out); n.start(t, (t * 7.31) % 2); n.stop(t + 0.18);
  const body = ctx.createOscillator(); body.type = 'triangle'; body.frequency.setValueAtTime(230, t); body.frequency.exponentialRampToValueAtTime(170, t + 0.05);
  const bg = ctx.createGain(); bg.gain.setValueAtTime(vel * 0.8, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  body.connect(bg); bg.connect(out); body.start(t); body.stop(t + 0.1);
  panTo(ctx, out, 0.18, bus, 0.22);
}

function cymbal(ctx: Ctx, bus: Bus, t: number, vel: number) {
  const n = ctx.createBufferSource(); n.buffer = bus.noise;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  n.connect(hp); hp.connect(g); n.start(t, (t * 3.17) % 1); n.stop(t + 2.5);
  panTo(ctx, g, 0.35, bus, 0.3);
}

function strings(ctx: Ctx, bus: Bus, t: number, dur: number, notes: number[], vel: number) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vel, t + 0.12); out.gain.setValueAtTime(vel, t + dur - 0.05); out.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
  const trem = ctx.createGain(); trem.gain.value = 0.7; // bowed tremolo
  const lfo = ctx.createOscillator(); lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(trem.gain); lfo.start(t); lfo.stop(t + dur + 0.25);
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 3200;
  for (const m of notes) for (const c of [-6, 5]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = c;
    o.connect(filt); o.start(t); o.stop(t + dur + 0.25);
  }
  filt.connect(trem); trem.connect(out);
  panTo(ctx, out, -0.3, bus, 0.45);
}

function impulse(ctx: Ctx, seconds = 2.2) {
  const len = Math.ceil(seconds * ctx.sampleRate); const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let seed = 777 + c * 91;
    for (let i = 0; i < len; i++) { seed = (seed * 48271) % 2147483647; d[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / len) ** 3.2; }
  }
  return b;
}

function makeBus(ctx: Ctx): { bus: Bus; master: GainNode } {
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.008; comp.release.value = 0.18; comp.knee.value = 8;
  const dry = ctx.createGain(); dry.gain.value = 0.55;
  const verb = ctx.createConvolver(); verb.buffer = impulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  dry.connect(comp); wet.connect(verb); verb.connect(comp); comp.connect(master); master.connect(ctx.destination);
  return { bus: { dry, wet, noise: noiseBuffer(ctx, 4) }, master };
}

/** Writes the whole march into a context, starting at `t0`. */
function score(ctx: Ctx, bus: Bus, t0: number) {
  const at = (beat: number) => t0 + beat * BEAT;
  for (let bar = 0; bar < BARS; bar++) {
    const b0 = bar * 4; const chord = CHORDS[bar]; const root = ROOTS[bar];
    // low brass stabs (trombones/horns) on the chord
    for (const [s, l] of STABS) for (const [i, m] of chord.entries()) brass(ctx, bus, at(b0 + s), l * BEAT * 0.9, m - (i === 0 ? 0 : 12), 0.055, (i - 1.5) * 0.25, 0.8);
    // bass: driving eighths with octave leaps
    for (let e = 0; e < 8; e++) bass(ctx, bus, at(b0 + e / 2), BEAT * 0.42, root + ([0, 0, 12, 0, 0, 12, 7, 12][e]), e % 2 ? 0.16 : 0.22);
    // timpani on the strong beats, a roll into the phrase ends
    timpani(ctx, bus, at(b0), root - 12 + 12, 0.55);
    timpani(ctx, bus, at(b0 + 2), root + 7 - 12 + 12, 0.4);
    if (bar === 3 || bar === 7) for (let r = 0; r < 8; r++) timpani(ctx, bus, at(b0 + 3 + r / 8), root + 7, 0.12 + r * 0.04);
    // snare: march pattern with accents on 2 and 4, a roll at the phrase ends
    for (let s16 = 0; s16 < 16; s16++) {
      const beat = s16 / 4; const accent = s16 === 4 || s16 === 12;
      const pattern = [1, 0, 0.35, 0.3, 1, 0, 0.35, 0, 0.5, 0.3, 0.35, 0.3, 1, 0, 0.4, 0.45];
      const roll = (bar === 3 || bar === 7) && beat >= 3;
      const v = roll ? 0.18 + (beat - 3) * 0.3 : pattern[s16] * (accent ? 0.42 : 0.2);
      if (v > 0) snare(ctx, bus, at(b0 + beat), v);
      if (roll) snare(ctx, bus, at(b0 + beat + 0.125), v * 0.8);
    }
    // string tremolo pad, an octave above the chord
    strings(ctx, bus, at(b0), 4 * BEAT, chord.slice(1).map((m) => m + 12), 0.03);
  }
  // fanfare: lead brass with a softer octave below
  for (const [b, l, m] of LEAD) {
    brass(ctx, bus, at(b), l * BEAT * 0.92, m, 0.15, 0.1, 1.15);
    brass(ctx, bus, at(b), l * BEAT * 0.92, m - 12, 0.07, -0.1, 0.9);
  }
  cymbal(ctx, bus, at(0), 0.14);
  cymbal(ctx, bus, at(16), 0.12);
}

function normalise(b: AudioBuffer, peak = 0.89) {
  let max = 0;
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i])); }
  if (!max) return b;
  const k = peak / max;
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
  return b;
}

/** Renders the seamless loop (the echo tail after the last bar is added back onto the first bar). */
export async function renderBattleLoop(): Promise<AudioBuffer> {
  const loopLen = Math.round(LOOP_SECONDS * SR); const tail = Math.round(3 * SR);
  const ctx = new OfflineAudioContext(2, loopLen + tail, SR);
  const { bus } = makeBus(ctx);
  score(ctx, bus, 0);
  const full = await ctx.startRendering();
  const out = new AudioBuffer({ numberOfChannels: 2, length: loopLen, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const src = full.getChannelData(c); const dst = out.getChannelData(c);
    dst.set(src.subarray(0, loopLen));
    for (let i = 0; i < tail; i++) dst[i] += src[loopLen + i];
  }
  return normalise(out);
}

/** A short warning call: one bar of brass on A with a snare roll and timpani. */
export async function renderWarning(): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.round(3.2 * SR), SR);
  const { bus } = makeBus(ctx);
  const at = (b: number) => 0.02 + b * BEAT;
  for (let r = 0; r < 12; r++) snare(ctx, bus, at(r / 6), 0.12 + r * 0.025);
  for (const [b, l] of [[2, 0.5], [2.75, 0.25], [3, 1.5]] as [number, number][]) for (const m of [57, 61, 64, 69]) brass(ctx, bus, at(b), l * BEAT, m, 0.11, 0, 1.1);
  timpani(ctx, bus, at(2), 33, 0.6); timpani(ctx, bus, at(3), 33, 0.7); cymbal(ctx, bus, at(3), 0.12);
  return normalise(await ctx.startRendering(), 0.8);
}

/** Systems restored: a rising D-major resolution. */
export async function renderRestored(): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.round(3.4 * SR), SR);
  const { bus } = makeBus(ctx);
  const at = (b: number) => 0.02 + b * BEAT;
  for (const [b, l, m] of [[0, 0.5, 69], [0.5, 0.5, 74], [1, 0.5, 78], [1.5, 2.5, 81]] as [number, number, number][]) brass(ctx, bus, at(b), l * BEAT, m, 0.13, 0, 1.1);
  for (const m of [50, 57, 62, 66]) brass(ctx, bus, at(1.5), 2.5 * BEAT, m, 0.06, 0, 0.8);
  timpani(ctx, bus, at(1.5), 38, 0.5); cymbal(ctx, bus, at(1.5), 0.08);
  return normalise(await ctx.startRendering(), 0.75);
}
