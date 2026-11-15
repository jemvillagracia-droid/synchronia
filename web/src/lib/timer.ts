// System Timer: one countdown for the whole app. It stores when it ends (not a running count), so it stays exact
// across pages and survives a restart of the app. Alerts fire at the warning marks and when time runs out.
import { useSyncExternalStore } from 'react';
import { desktop } from './desktop';

export type TimerMode = 'idle' | 'running' | 'paused' | 'down';
export interface TimerState {
  mode: TimerMode; label: string; durationMs: number; endsAt: number | null; remainingMs: number;
  recharge: boolean; warned: number[]; muted: boolean;
}
export const WARN_AT = [5 * 60_000, 60_000];
const KEY = 'synchronia-timer';
const blank: TimerState = { mode: 'idle', label: '', durationMs: 25 * 60_000, endsAt: null, remainingMs: 25 * 60_000, recharge: false, warned: [], muted: false };

let state: TimerState = load();
const subs = new Set<() => void>();
type AlertKind = { kind: 'warning'; remainingMs: number } | { kind: 'down' };
const alertSubs = new Set<(a: AlertKind) => void>();

function load(): TimerState {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' ? { ...blank, ...s } : blank; } catch { return blank; }
}
function set(next: Partial<TimerState>) {
  state = { ...state, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable: the timer still runs */ }
  subs.forEach((f) => f());
}
export const remaining = (s: TimerState = state, now = Date.now()) => (s.mode === 'running' && s.endsAt ? Math.max(0, s.endsAt - now) : s.mode === 'down' ? 0 : s.remainingMs);

export const timer = {
  get: () => state,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  onAlert(f: (a: AlertKind) => void) { alertSubs.add(f); return () => { alertSubs.delete(f); }; },
  setDuration(ms: number, label = state.label) {
    const d = Math.max(1000, Math.min(ms, 24 * 3600_000));
    set({ mode: 'idle', durationMs: d, remainingMs: d, endsAt: null, label, recharge: false, warned: [] });
  },
  setLabel(label: string) { set({ label: label.slice(0, 120) }); },
  start() {
    const rem = state.mode === 'down' || state.mode === 'idle' && state.remainingMs <= 0 ? state.durationMs : state.remainingMs;
    set({ mode: 'running', endsAt: Date.now() + rem, remainingMs: rem, warned: WARN_AT.filter((w) => rem <= w) });
  },
  pause() { if (state.mode === 'running') set({ mode: 'paused', remainingMs: remaining(), endsAt: null }); },
  reset() { set({ mode: 'idle', remainingMs: state.durationMs, endsAt: null, warned: [], recharge: false }); },
  /** After "system down": a short break, shown as recharging. */
  recharge(ms = 5 * 60_000) { set({ mode: 'running', recharge: true, durationMs: ms, remainingMs: ms, endsAt: Date.now() + ms, warned: WARN_AT, label: 'Recharging' }); },
  toggleMute() { set({ muted: !state.muted }); },
};

/** Keeps checking the clock (a few times a second is enough for alerts; the display animates on its own). */
function tick() {
  if (state.mode !== 'running' || !state.endsAt) return;
  const rem = remaining();
  for (const w of WARN_AT) {
    if (rem <= w && rem > 0 && !state.warned.includes(w)) {
      set({ warned: [...state.warned, w] });
      alertSubs.forEach((f) => f({ kind: 'warning', remainingMs: w }));
      beep(2); notify(`${w / 60_000} minute${w === 60_000 ? '' : 's'} remaining`, state.label || 'System Timer');
    }
  }
  if (rem <= 0) {
    const wasRecharge = state.recharge;
    set({ mode: wasRecharge ? 'idle' : 'down', remainingMs: wasRecharge ? state.durationMs : 0, endsAt: null, recharge: false });
    if (wasRecharge) { beep(1); notify('Recharge complete', 'Systems restored. Ready to start again.'); }
    else { alertSubs.forEach((f) => f({ kind: 'down' })); beep(4); notify('SYSTEM DOWN — recharge required', `${state.label || 'Active time'} has run out.`); }
  }
}
if (typeof window !== 'undefined') window.setInterval(tick, 250);

function notify(title: string, body: string) {
  if (!document.hasFocus()) desktop?.notify?.(title, body).catch(() => {});
}

let audio: AudioContext | null = null;
function beep(n: number) {
  if (state.muted) return;
  try {
    audio ||= new AudioContext();
    for (let i = 0; i < n; i++) {
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime + i * 0.28);
      g.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + i * 0.28 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + i * 0.28 + 0.2);
      o.connect(g).connect(audio.destination); o.start(audio.currentTime + i * 0.28); o.stop(audio.currentTime + i * 0.28 + 0.22);
    }
  } catch { /* no audio device: silent */ }
}

export function useTimer() { return useSyncExternalStore(timer.subscribe, timer.get); }

/** Display: MM:SS:CC under 100 minutes (as on the original countdown displays), otherwise H:MM:SS. */
export function formatTime(ms: number) {
  const cs = Math.floor(ms / 10) % 100; const s = Math.floor(ms / 1000) % 60; const m = Math.floor(ms / 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  if (m < 100) return `${p(m)}:${p(s)}:${p(cs)}`;
  return `${Math.floor(m / 60)}:${p(m % 60)}:${p(s)}`;
}
/** Power mode lamp: STOP (stopped), SLOW (paused), NORMAL (running), RACING (final minute). */
export function powerMode(s: TimerState, rem: number) {
  if (s.mode === 'paused') return 'SLOW';
  if (s.mode !== 'running') return 'STOP';
  return rem <= 60_000 ? 'RACING' : 'NORMAL';
}
