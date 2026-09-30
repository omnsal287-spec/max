// Verifies that every string key used in code exists in English, and that every language pack has the same keys as English.
// Usage: node tools/i18n-check.mjs
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../public/js/', import.meta.url).pathname;
const en = (await import(root + 'i18n/en.js')).default;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
const used = new Set(), usedSay = new Set(), problems = [];
for (const f of walk(root)) {
  if (f.includes('/i18n/')) continue; const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*['"`]([a-zA-Z0-9_.]+)['"`]/g)) used.add(m[1]);
  for (const m of src.matchAll(/\b(?:say|sayLine|sayCat|out)\(\s*['"`]([a-z_]+)['"`]/g)) usedSay.add(m[1]);
  for (const m of src.matchAll(/'((?:arrive|back|tap|hold|drop|idle|chat|tut)_[a-z_]+|lamp_on|lamp_off|window_open|window_close|radio_on|radio_off|sleepy_go|play_ball|memory_saved|ask_name|bat_low|bat_charge|offline|hit|break|wake|plant|broken_later)'/g)) usedSay.add(m[1]);
}
const EV = ['stone', 'scribble', 'seed', 'visitor', 'midnight', 'button', 'mugnew', 'aurora'], CAPS = ['memory', 'sound', 'notifications', 'device', 'location', 'voice', 'haptics', 'advanced'];
const dyn = [];
for (const e of EV) for (const k of ['title', 'body', 'notif', 'line']) dyn.push(`ev.${e}.${k}`);
for (const c of CAPS) { dyn.push(`cap.${c}.name`, `cap.${c}.desc`, `cap.${c}.note`, `cap.${c}.can1`, `can.${c}`, `cannot.${c}`); }
for (const c of ['notifications', 'location', 'voice']) dyn.push('explain.' + c);
for (const k of ['lamp', 'window', 'radio', 'ball']) dyn.push('tray.' + k);
for (const k of ['calm', 'content', 'playful', 'excited', 'sleepy', 'grumpy', 'curious', 'cozy', 'uneasy']) dyn.push('mood.' + k);
for (const k of ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night']) dyn.push('phase.' + k);
for (const k of ['auto', 'low', 'medium', 'high']) dyn.push('perf.' + k, 'perf.' + k + '.d');
for (const k of ['ball', 'mug', 'book', 'block1', 'block2', 'vase', 'radio', 'lamp', 'window', 'plant', 'cushion', 'button']) dyn.push('obj.' + k);
for (const k of ['granted', 'denied', 'prompt', 'unsupported', 'na']) dyn.push('os.' + k);
for (const k of ['user', 'pref', 'relationship', 'room', 'event', 'digest']) dyn.push('cat.' + k);
for (const k of ['online', 'local', 'unknown']) dyn.push('adv.ai.' + k);
for (const k of ['uncommon', 'rare', 'shared']) dyn.push('rarity.' + k);
for (const i of [0, 1, 2, 3]) dyn.push('rel.' + i);
for (const i of [1, 2, 3, 4, 5]) dyn.push('chat.s' + i);
for (const k of ['vibrate', 'toast', 'torch']) dyn.push('adv.confirm.' + k === 'adv.confirm.vibrate' ? 'adv.vibrate' : 'adv.' + k);
dyn.push('adv.confirm.torch');
for (const k of ['loud', 'rough', 'rain', 'dark', 'mess']) dyn.push('dis.' + k);
for (const k of ['temperament', 'curiosity', 'sociability', 'humor', 'energy', 'patience']) dyn.push(`trait.${k}.hi`, `trait.${k}.lo`);
for (const k of ['playful', 'comfy', 'independent']) dyn.push('evo.' + k);
for (const k of ['memk.name', 'memk.like', 'memk.dislike', 'memk.met', 'memk.broke', 'memk.fixed', 'memk.first', 'memk.event', 'memk.digest']) dyn.push(k);
dyn.push('reset.mem.d');
const missingEn = [...new Set([...used, ...dyn])].filter((k) => !k.endsWith('.') && k !== 'chat.s' && !(k in en.ui)); if (missingEn.length) problems.push('en.ui missing: ' + missingEn.join(', '));
const missingSay = [...usedSay].filter((k) => !(k in en.say)); if (missingSay.length) problems.push('en.say missing: ' + missingSay.join(', '));
for (const code of ['ar', 'zh', 'hi', 'es', 'fr']) {
  const p = join(root, 'i18n', code + '.js'); if (!existsSync(p)) { problems.push(code + ': file missing'); continue; }
  const L = (await import(p)).default;
  const mu = Object.keys(en.ui).filter((k) => !(k in L.ui)), xu = Object.keys(L.ui).filter((k) => !(k in en.ui)); const ms = Object.keys(en.say).filter((k) => !(k in L.say)), xs = Object.keys(L.say).filter((k) => !(k in en.say));
  if (mu.length) problems.push(`${code}.ui missing ${mu.length}: ${mu.slice(0, 12).join(', ')}`); if (xu.length) problems.push(`${code}.ui extra: ${xu.join(', ')}`);
  if (ms.length) problems.push(`${code}.say missing: ${ms.join(', ')}`); if (xs.length) problems.push(`${code}.say extra: ${xs.join(', ')}`);
  for (const k of Object.keys(en.intents)) if (!L.intents?.[k]?.length) problems.push(`${code}.intents.${k} missing`);
  for (const k of Object.keys(en.extract)) if (!L.extract?.[k]?.length) problems.push(`${code}.extract.${k} missing`);
  // placeholders must match
  for (const [k, v] of Object.entries(en.ui)) { const a = (v.match(/\{\w+\}/g) || []).sort().join(), b = ((L.ui[k] || '').match(/\{\w+\}/g) || []).sort().join(); if (L.ui[k] && a !== b) problems.push(`${code}.ui.${k} placeholders differ (${a} vs ${b})`); }
}
console.log(problems.length ? problems.join('\n') : 'i18n OK'); console.log(`(${Object.keys(en.ui).length} ui keys, ${Object.keys(en.say).length} say pools)`); process.exit(problems.length ? 1 : 0);
