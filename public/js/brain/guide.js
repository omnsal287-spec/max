// The first ten minutes: no checklist, no tutorial overlay. A few quiet nudges, each shown once, and only if the
// user hasn't already discovered the thing on their own.
import { S, R, commit, listen } from '../core/state.js';
import { MX, sayLine, sayText, setAct } from './maxctl.js';
import { t, say } from '../i18n/index.js';
import * as memory from './memory.js';
import { focusOn } from '../render/scene.js';
import { world } from '../render/world.js';

let showHint = () => {}; let hideHint = () => {};
export function bindHints(show, hide) { showHint = show; hideHint = hide; }
const done = () => S.user.tutorial.done;
const mark = (k) => commit('user', (u) => { u.tutorial.done[k] = true; }, 'guide');
let acc = 0, saveAcc = 0, lastTapT = 0, objT = 0;

export function startGuide(justEntered) {
  listen('ui:firstTap', () => { if (!done().tap) { mark('tap'); hideHint('tap'); lastTapT = S.user.tutorial.t; } });
  listen('ui:objectInteract', ({ id } = {}) => { if (['lamp', 'radio', 'window'].includes(id) && !done().lamp) mark('lamp'); if (!done().obj) { mark('obj'); hideHint('move'); R.hintObj = null; objT = S.user.tutorial.t; } });
  listen('ui:hold', () => { if (!done().hold) { mark('hold'); hideHint('hold'); } });
  listen('ui:chatOpened', () => { mark('chat'); R.pulseChat = false; hideHint('talk'); });
  listen('memory:changed', ({ added }) => { if (added && ['chat', 'manual', 'ai'].includes(added.source) && !done().memHint && memory.enabled()) { mark('memHint'); setTimeout(() => { showHint('hint.notebook', 'notebook', 9000); R.notebookDot = true; }, 1800); } });
  if (justEntered && !done().tap) { MX.lookMode = 'user'; MX.lookHold = 4; setTimeout(() => { if (!done().tap) showHint('hint.tap', 'tap', 22000); }, 1800); }
}
const BEATS = [
  { k: 'move', at: 0, after: () => done().tap && S.user.tutorial.t - lastTapT > 25 && !done().obj, run() { showHint('hint.move', 'move', 14000); R.hintObj = 'ball'; setTimeout(() => (R.hintObj = null), 14000); } },
  { k: 'pers', at: 0, after: () => done().obj && S.user.tutorial.t - objT > 45, run() { const f = S.max.personality.favorite; sayLine('tut_pers', { thing: t('obj.' + f) }, { emotion: 'happy' }); } },
  { k: 'talk', at: 240, after: () => !done().chat, run() { sayLine('tut_talk', null, { emotion: 'curious' }); R.pulseChat = true; setTimeout(() => showHint('hint.talk', 'talk', 9000), 2500); } },
  { k: 'room', at: 330, after: () => !done().lamp, run() { showHint('hint.objects', 'room', 9000); mark('lamp'); } },
  { k: 'window', at: 420, after: () => true, run() { sayLine('tut_window', null, { emotion: 'curious' }); MX.lookMode = 'window'; MX.lookHold = 6; focusOn({ x: world.L.win.x + world.L.win.w / 2, y: world.L.win.y + world.L.win.h * 0.6, z: 1.3 }); setTimeout(() => focusOn(null), 4200); setTimeout(() => showHint('hint.window', 'win', 7000), 1500); } },
  { k: 'name', at: 480, after: () => memory.enabled() && !memory.userName(), run() { sayLine('ask_name', null, { emotion: 'curious' }); R.pulseChat = !done().chat; } },
  { k: 'hold', at: 540, after: () => !done().hold, run() { showHint('hint.hold', 'hold', 9000); } },
  { k: 'after', at: 600, after: () => true, run() { sayLine('tut_after', null, { emotion: 'calm' }); } },
];
/** dt seconds of foreground time; call every frame */
export function updateGuide(dt) {
  if (R.chatOpen || R.dialogOpen) return; if (performance.now() - R.lastInput > 90000) return; // only count time the user is actually here
  acc += dt; S.user.tutorial.t += dt; saveAcc += dt; if (saveAcc > 15) { saveAcc = 0; commit('user', () => {}, 'guide'); }
  if (acc < 1) return; acc = 0; const T = S.user.tutorial.t; if (T > 1500) return;
  if (MX.speech || MX.held || MX.air || S.max.sleep.asleep) return;
  for (const b of BEATS) { if (done()[b.k]) continue; if (T >= b.at && b.after()) { mark(b.k); b.run(); break; } }
}
