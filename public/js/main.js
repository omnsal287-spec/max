// MAX boot + main loop. Everything here works offline; AI and device features are optional layers.
import { S, R, load, commit, saveNow, listen, emit } from './core/state.js';
import * as storage from './core/storage.js';
import { detect, setLang, t, onLang, say, lang } from './i18n/index.js';
import { dayKey } from './util.js';
import { initPerf, monitor } from './core/perf.js';
import { initScene, resize, render, setQuality, scene } from './render/scene.js';
import { world } from './render/world.js';
import { update as updateFx } from './render/fx.js';
import { updateWorld } from './render/world.js';
import { updateTime, weatherNow, currentHour, lookAt } from './brain/time.js';
import { initMax, updateMax, MX, sayLine, persistMax } from './brain/maxctl.js';
import { initInput, updateInput } from './brain/interactions.js';
import * as life from './brain/life.js';
import * as events from './brain/events.js';
import * as memory from './brain/memory.js';
import { startGuide, updateGuide, bindHints } from './brain/guide.js';
import * as audio from './audio.js';
import * as notify from './device/notify.js';
import { watchPermissions, refreshAll, startDevice } from './device/capabilities.js';
import { startHealth } from './ai/client.js';
import { applyAppearance } from './ui/appearance.js';
import { showSplash, runOnboarding } from './ui/onboarding.js';
import { initHud, updateBubble, showHint, hideHint } from './ui/hud.js';
import { initChat, openChat } from './ui/chat.js';
import { openNotebook } from './ui/notebook.js';
import { openSettings } from './ui/settings.js';
import { initMomentCards } from './ui/momentCard.js';
import { initInstall, maybeSuggest } from './ui/install.js';
import { toast } from './ui/components.js';
import { chooseLang } from './ui/langsheet.js';

let last = 0, acc1 = 0, lastRender = 0, bgTimer = 0, running = false;

async function boot() {
  const stored = storage.ls.get('lang'); try { await setLang(stored || detect()); } catch { await setLang('en'); }
  R.lastInput = performance.now(); R.hidden = document.hidden;
  const splash = showSplash(); const t0 = performance.now();
  const { fresh } = await load(stored || detect());
  // language: honour a manual choice, otherwise follow the device
  const want = S.user.langAuto ? detect() : S.user.lang; if (want !== lang()) await setLang(want); commit('user', (u) => { u.lang = lang(); }, 'lang');
  applyAppearance(); matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyAppearance);
  await memory.loadMemories();
  initPerf(() => { if (scene.canvas) setQuality(); });
  const canvas = document.getElementById('room'); initScene(canvas); initMax(); initInput(canvas);
  audio.wire(); initChat(); initMomentCards(); initInstall(); bindHints(showHint, hideHint);
  hooks();
  R.weather = weatherNow(); updateTime(0);
  // persisted-state sanity: sun times need location if enabled
  await new Promise((r) => setTimeout(r, Math.max(0, 900 - (performance.now() - t0)))); // let the splash breathe, never longer
  running = true; requestAnimationFrame(loop);
  registerSW(); // early: so the shell is cached even if the first session ends during onboarding
  splash.done();
  const first = !S.user.onboarded;
  if (first) await runOnboarding();
  enterRoom(first);
  window.__maxReady = true;
  if (new URLSearchParams(location.search).has('dev') || storage.ls.get('dev')) window.__max = { S, R, MX, world, events, life, memory, scene, audio, openChat, openSettings, openNotebook, emit };
}

function enterRoom(first) {
  initHud({ onTalk: openChat, onNotebook: openNotebook, onSettings: () => openSettings() });
  const r = life.onEnter(first); saveNow();
  if (!first && r.line) setTimeout(() => { if (!S.max.sleep.asleep && !document.hidden) sayLine(r.line, null, { emotion: 'happy' }); }, 1800);
  startGuide(first);
  events.startSharedPolling(); startHealth(); watchPermissions(); if (S.user.caps.device) startDevice(); if (S.user.caps.notifications) notify.syncPrefs();
  if (!first) { const tt = lookAt(currentHour()).night > 0.6; /* returning users just land in the room */ }
  setInterval(() => { if (!document.hidden) maybeSuggest(); }, 30000);
  audio.applyVolumes();
}

function hooks() {
  addEventListener('resize', () => resize());
  document.addEventListener('visibilitychange', () => {
    R.hidden = document.hidden;
    if (document.hidden) { life.onLeave(); saveNow(); audio.suspend(true); clearInterval(bgTimer); bgTimer = setInterval(() => life.backgroundBeat(), 5 * 60000); }
    else { clearInterval(bgTimer); audio.suspend(false); last = 0; if (S.user.onboarded && window.__maxReady) { R.userPresent = false; R.lastInput = performance.now(); const r = life.onEnter(false); if (r.line) setTimeout(() => { if (!S.max.sleep.asleep) sayLine(r.line, null, { emotion: 'happy' }); }, 1500); events.pollShared(); } }
  });
  addEventListener('pagehide', () => { life.onLeave(); saveNow(); });
  addEventListener('online', () => { R.online = true; });
  addEventListener('offline', () => { R.online = false; toast(t('toast.offline')); });
  listen('ai:status', ({ status, prev }) => { if (status === 'local' && prev === 'online') toast(t('toast.ai.down')); else if (status === 'online' && prev === 'local') toast(t('toast.ai.back')); });
  listen('caps:revoked', ({ id }) => toast(t('caps.rev')));
  listen('room:broke', ({ id }) => memory.add({ cat: 'room', tk: 'memk.broke', tp: { item: t('obj.' + id) }, importance: 2, source: 'auto', dedupeKey: 'broke:' + id + ':' + dayKey() }));
  onLang(() => { document.title = t('app.name') + ' — ' + t('app.tagline'); document.querySelector('meta[name=description]')?.setAttribute('content', t('app.tagline')); });
  document.title = t('app.name') + ' — ' + t('app.tagline');
}

function loop(ts) {
  requestAnimationFrame(loop); if (!running || document.hidden) return;
  const q = R.quality; if (q && q.fps === 30 && ts - lastRender < 29) return; lastRender = ts;
  const raw = last ? (ts - last) / 1000 : 0.016; last = ts; const dt = Math.min(0.05, raw);
  monitor(raw);
  try {
    updateTime(dt); updateInput(dt); updateMax(dt); updateWorld(dt); updateFx(dt);
    if (S.user.onboarded && window.__maxReady) { life.heartbeat(dt); updateGuide(dt); }
    render(dt, ts / 1000); updateBubble();
  } catch (e) { if (!loop.err) { loop.err = true; console.error('frame error', e); } }
  acc1 += dt; if (acc1 > 1) { acc1 = 0; R.weather = weatherNow(); try { const look = scene.look; if (look) { audio.setAmbience(look, R.weather, S.room.window.open); } } catch {} }
  audio.tickAmbience(dt);
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { const reg = await navigator.serviceWorker.register('/sw.js'); notify.setRegistration(reg); navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'open-notebook') openNotebook('moments'); }); } catch { /* sandboxed preview or blocked: MAX runs without offline caching */ }
}
boot().catch((e) => { console.error(e); document.body.append(Object.assign(document.createElement('pre'), { textContent: 'MAX could not start: ' + e.message, style: 'color:#fff;padding:20px;white-space:pre-wrap' })); });
