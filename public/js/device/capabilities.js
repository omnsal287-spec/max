// Capabilities: each one maps to something MAX really uses. Standalone-first: only `advanced` needs an optional bridge.
// "enabled" is the user's choice; "os" is what the device actually allows; "effective" is what MAX can really do right now.
import { S, R, commit, emit } from '../core/state.js';
import * as bridge from './bridge.js';
import { refreshSun } from '../brain/time.js';

export const CAP_IDS = ['memory', 'sound', 'notifications', 'device', 'location', 'voice', 'haptics', 'advanced'];
export const NEEDS_OS_PROMPT = { notifications: true, location: true, voice: true };
const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
let notifSupported = () => 'Notification' in window && ('serviceWorker' in navigator || true);

export function supported(id) {
  switch (id) {
    case 'memory': case 'sound': return true;
    case 'notifications': return 'Notification' in window && (window.isSecureContext !== false);
    case 'device': return !!(navigator.getBattery) || !!(navigator.connection) || true; // online/offline state always exists
    case 'location': return 'geolocation' in navigator;
    case 'voice': return !!SR() && !!navigator.mediaDevices?.getUserMedia;
    case 'haptics': return 'vibrate' in navigator;
    case 'advanced': return true;
  }
  return false;
}
/** what the device currently allows: granted | denied | prompt | unsupported | na */
export async function osState(id) {
  if (!supported(id)) return 'unsupported';
  try {
    if (id === 'notifications') return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    if (id === 'location' && navigator.permissions) { const p = await navigator.permissions.query({ name: 'geolocation' }); return p.state; }
    if (id === 'voice' && navigator.permissions) { const p = await navigator.permissions.query({ name: 'microphone' }); return p.state; }
  } catch {}
  if (id === 'location' || id === 'voice') return S.user.osState[id] || 'prompt';
  return 'na';
}
export async function capState(id) {
  const enabled = !!S.user.caps[id]; const os = await osState(id); const sup = supported(id);
  let status = enabled ? 'enabled' : 'disabled'; let effective = enabled;
  if (!sup) { status = 'unsupported'; effective = false; }
  else if (os === 'denied') { status = 'denied'; effective = false; }
  else if (id === 'advanced' && enabled) { const up = await bridge.available(); if (!up) { status = 'adv'; effective = false; } }
  else if (id === 'device' && enabled && !navigator.getBattery && !navigator.connection) effective = true;
  else if (id === 'notifications' && enabled && os !== 'granted') { status = 'disabled'; effective = false; }
  else if (id === 'location' && enabled && !S.user.location) { effective = false; }
  return { id, enabled, os, supported: sup, status, effective };
}
export async function allStates() { const out = {}; for (const id of CAP_IDS) out[id] = await capState(id); return out; }
export const isOn = (id) => !!S.user.caps[id]; // synchronous intent (used in hot paths)

async function requestOS(id) {
  if (id === 'notifications') { const r = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); return r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'prompt'; }
  if (id === 'location') return new Promise((res) => {
    navigator.geolocation.getCurrentPosition((p) => { commit('user', (u) => { u.location = { lat: Math.round(p.coords.latitude * 10) / 10, lon: Math.round(p.coords.longitude * 10) / 10 }; }, 'location'); refreshSun.force = true; refreshSun(); res('granted'); }, (e) => res(e.code === 1 ? 'denied' : 'failed'), { maximumAge: 3600000, timeout: 12000, enableHighAccuracy: false });
  });
  if (id === 'voice') { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); return 'granted'; } catch (e) { return e && e.name === 'NotAllowedError' ? 'denied' : 'failed'; } }
  return 'granted';
}
/** returns {ok, reason: 'denied'|'unsupported'|'failed'|'adv'|null} */
export async function setCap(id, on) {
  if (!on) {
    commit('user', (u) => { u.caps[id] = false; if (id === 'location') u.location = null; }, 'caps'); if (id === 'location') { refreshSun.force = true; refreshSun(); }
    if (id === 'device') stopDevice(); emit('caps:changed', { id, on: false }); return { ok: true };
  }
  if (!supported(id)) return { ok: false, reason: 'unsupported' };
  let os = 'granted';
  if (NEEDS_OS_PROMPT[id]) os = await requestOS(id);
  if (os === 'denied' || os === 'failed') { commit('user', (u) => { u.caps[id] = false; u.osState[id] = os; }, 'caps'); emit('caps:changed', { id, on: false }); return { ok: false, reason: os === 'denied' ? 'denied' : 'failed' }; }
  commit('user', (u) => { u.caps[id] = true; u.osState[id] = 'granted'; }, 'caps');
  if (id === 'device') startDevice(); if (id === 'notifications') (await import('./notify.js')).syncPrefs();
  emit('caps:changed', { id, on: true });
  if (id === 'advanced' && !(await bridge.available())) return { ok: true, reason: 'adv' };
  return { ok: true };
}
/** Re-detect the real OS permission state. If the device revoked something, MAX switches it off and says so. */
export async function refreshAll() {
  for (const id of ['notifications', 'location', 'voice']) {
    const os = await osState(id);
    if (S.user.caps[id] && (os === 'denied' || (id === 'notifications' && os === 'prompt'))) { commit('user', (u) => { u.caps[id] = false; u.osState[id] = os; }, 'caps'); emit('caps:revoked', { id }); }
    else if (S.user.osState[id] !== os && os !== 'na') commit('user', (u) => { u.osState[id] = os; }, 'caps');
  }
  if (S.user.caps.haptics && !supported('haptics')) commit('user', (u) => { u.caps.haptics = false; }, 'caps');
  emit('caps:refreshed', {});
}
export function watchPermissions() {
  refreshAll(); document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll(); }); window.addEventListener('focus', refreshAll);
  if (navigator.permissions) for (const name of ['notifications', 'geolocation', 'microphone']) navigator.permissions.query({ name }).then((p) => { p.onchange = refreshAll; }).catch(() => {});
}

// ---------------- haptics ----------------
export function haptic(p = 10) { if (S.user.caps.haptics && 'vibrate' in navigator && !R.reduceMotion) { try { navigator.vibrate(p); } catch {} } }

// ---------------- device information (battery + connection) ----------------
let batt = null;
export async function startDevice() {
  if (!S.user.caps.device) return;
  if (navigator.getBattery) { try { batt = await navigator.getBattery(); const upd = () => { const was = R.battery; R.battery = { level: batt.level, charging: batt.charging }; emit('device:battery', { was, now: R.battery }); }; ['levelchange', 'chargingchange'].forEach((e) => batt.addEventListener(e, upd)); upd(); } catch {} }
  const c = navigator.connection; if (c) R.connection = { type: c.effectiveType, saveData: !!c.saveData };
}
export function stopDevice() { R.battery = null; R.connection = null; }
/** only a coarse hint may go to the AI, and only with the capability on */
export function deviceHint() { if (!S.user.caps.device || !R.battery) return undefined; return { batteryLow: R.battery.level < 0.2 && !R.battery.charging, charging: R.battery.charging }; }

// ---------------- voice input ----------------
const SRLANG = { en: 'en-US', ar: 'ar-SA', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', fr: 'fr-FR' };
let rec = null;
export function listenOnce(lang, onInterim) {
  return new Promise((res, rej) => {
    const C = SR(); if (!C) return rej(new Error('unsupported')); stopListening();
    rec = new C(); rec.lang = SRLANG[lang] || 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false; let final = '';
    rec.onresult = (e) => { let s = ''; for (const r of e.results) { s += r[0].transcript; if (r.isFinal) final = s; } onInterim && onInterim(s); if (e.results[e.results.length - 1].isFinal) final = s; };
    rec.onerror = (e) => rej(new Error(e.error || 'error')); rec.onend = () => { rec = null; res(final); };
    try { rec.start(); } catch (e) { rej(e); }
  });
}
export function stopListening() { try { rec && rec.stop(); } catch {} rec = null; }
