// Share cards: a picture of the room + a generic event title. Never contains chats, memories, name, location or IDs.
import { S } from '../core/state.js';
import { t, lang, isRTL, fmtDate } from '../i18n/index.js';
import { snapshot } from '../render/scene.js';
import { toast } from './components.js';

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
function wrap(ctx, text, maxW) {
  const cjk = lang() === 'zh'; const toks = cjk ? [...text] : text.split(/\s+/); const lines = []; let cur = '';
  for (const w of toks) { const tryL = cur ? cur + (cjk ? '' : ' ') + w : w; if (ctx.measureText(tryL).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryL; }
  if (cur) lines.push(cur); return lines;
}
export async function makeCard(moment) {
  const W = 1080, H = 1350; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const rtl = isRTL();
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  g.fillStyle = '#120f1c'; g.fillRect(0, 0, W, H);
  try { const im = await loadImg(moment.snap || snapshot()); const k = Math.max(W / im.width, 820 / im.height); const w = im.width * k, hh = im.height * k; g.save(); g.beginPath(); g.rect(0, 0, W, 880); g.clip(); g.drawImage(im, (W - w) / 2, (880 - hh) * 0.45, w, hh); g.restore(); } catch {}
  const grd = g.createLinearGradient(0, 560, 0, 900); grd.addColorStop(0, 'rgba(18,15,28,0)'); grd.addColorStop(1, '#120f1c'); g.fillStyle = grd; g.fillRect(0, 540, W, 360);
  g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = rtl ? 'right' : 'left'; const x = rtl ? W - 84 : 84;
  g.fillStyle = '#ffb46b'; g.font = `700 30px ${font}`; g.fillText(t('rarity.' + moment.rarity).toUpperCase(), x, 830);
  g.fillStyle = '#fff1dc'; g.font = `800 66px ${font}`; let y = 916; for (const l of wrap(g, t('ev.' + moment.ev + '.title'), W - 168).slice(0, 2)) { g.fillText(l, x, y); y += 76; }
  g.fillStyle = '#b9adc4'; g.font = `500 36px ${font}`; y += 8; for (const l of wrap(g, t('ev.' + moment.ev + '.body'), W - 168).slice(0, 4)) { g.fillText(l, x, y); y += 52; }
  g.fillStyle = 'rgba(255,241,220,.14)'; g.fillRect(84, H - 150, W - 168, 2);
  g.fillStyle = '#8b8099'; g.font = `600 30px ${font}`; g.fillText(fmtDate(moment.ts), x, H - 90); g.fillStyle = '#ffb46b'; g.textAlign = rtl ? 'left' : 'right'; g.font = `800 34px ${font}`; g.fillText('MAX', rtl ? 84 : W - 84, H - 90);
  g.fillStyle = '#8b8099'; g.font = `500 26px ${font}`; g.textAlign = rtl ? 'right' : 'left'; g.fillText(t('share.brand'), x, H - 48);
  return new Promise((r) => c.toBlob((b) => r(b), 'image/png'));
}
export async function shareMoment(moment) {
  try {
    const blob = await makeCard(moment); const file = new File([blob], 'max-moment.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: t('app.name'), text: t('share.text') }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'max-moment.png'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(t('share.saved'));
  } catch { toast(t('share.fail')); }
}
