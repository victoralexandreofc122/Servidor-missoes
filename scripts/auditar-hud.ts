/*
 * v66: auditoria do HUD pelo guia de UI, UX e HUD (docs/ui/estrutura-ui-ux-hud.md, seção 11). Abre o jogo no navegador
 * automático em 4 telas (celular deitado, celular pequeno, computador e ultrawide 21:9) e mede:
 *   - área de toque de cada controle (o dedo a 22 px do centro ainda acerta?): mínimo 44 x 44 px no toque;
 *   - zona do polegar de cada controle (verde, amarela, vermelha);
 *   - quanto da tela o HUD intercepta (teste de espremer os olhos);
 *   - contraste do texto (mínimo 4,5:1) e texto abaixo de 12 px;
 *   - v67: daltonismo: a tela do celular na Floresta como a veem quem tem deuteranopia, protanopia e tritanopia
 *     (matrizes de Machado, Oliveira e Fernandes, 2009, severidade total), para conferir que nada depende só da cor.
 * Precisa do servidor local rodando (npm run dev) e de uma conta de admin no banco local. O token é feito aqui com o
 * JWT_SECRET do ambiente e nunca é impresso.
 *
 * Uso: npx tsx scripts/auditar-hud.ts <pasta de saída> [rótulo]
 *   AUDIT_USER (padrão rin), AUDIT_URL (padrão http://localhost:3000), AUDIT_DB_URL (padrão DATABASE_URL)
 */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import pg from 'pg';
import { makeTokenIssuer } from '../src/auth/issueToken.js';
const OUT = process.argv[2] ?? '.';
const TAG = process.argv[3] ?? 'hud';
const URL_ = process.env.AUDIT_URL ?? 'http://localhost:3000';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const issue = makeTokenIssuer({ secret: process.env.JWT_SECRET!, ...(process.env.JWT_ISSUER ? { issuer: process.env.JWT_ISSUER } : {}), ...(process.env.JWT_AUDIENCE ? { audience: process.env.JWT_AUDIENCE } : {}) });
const db = new pg.Client({ connectionString: process.env.AUDIT_DB_URL ?? process.env.DATABASE_URL });
await db.connect();
const id = (await db.query(`SELECT id FROM game.players WHERE username = $1`, [process.env.AUDIT_USER ?? 'rin'])).rows[0].id;
const br = await chromium.launch();
const VIEWS = [
  { name: 'celular', w: 844, h: 390, touch: true },
  { name: 'celular-pequeno', w: 667, h: 375, touch: true },
  { name: 'pc', w: 1366, h: 768, touch: false },
  { name: 'ultrawide', w: 2560, h: 1080, touch: false },
];
const report: any = {};
for (const v of VIEWS) {
  const { token } = await issue(id);
  const ctx = await br.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, hasTouch: v.touch, isMobile: v.touch });
  await ctx.addInitScript('window.__name = (f) => f');
  await ctx.addInitScript(`localStorage.setItem('nin.token', ${JSON.stringify(token)})`);
  const p = await ctx.newPage();
  p.on('pageerror', (e: Error) => console.log('ERRO:', e.message));
  await p.goto(URL_);
  await wait(4500);
  for (const sel of ['text=Entendi', 'text=Fechar (já entendi)', 'text=Guardar']) { try { await p.click(sel, { timeout: 800 }); } catch {} }
  if (v.name === 'celular') {
    await p.fill('#chat-input', '/admin ir map_1 40 40'); await p.press('#chat-input', 'Enter'); await wait(2000);
    await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  }
  await wait(800);
  await p.screenshot({ path: `${OUT}/${TAG}_${v.name}.png` });
  report[v.name] = await p.evaluate(({ w, h, touch }) => {
    const vis = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !(el as HTMLElement).closest('[hidden]') && Number(cs.opacity) > 0.05; };
    const label = (el: Element) => (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName) + (el.getAttribute('aria-label') ? ` (${el.getAttribute('aria-label')})` : '');
    const ctrls = [...document.querySelectorAll('#hud button, #hud input, #hud select, #hud [role=button]')].filter(vis);
    const small = ctrls.map((el) => { const r = el.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      // área de toque efetiva: o dedo a 22 px do centro (para os 4 lados) ainda acerta o controle?
      const hits = (x: number, y: number) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
      const okW = r.width >= 44 || (hits(cx - 21, cy) && hits(cx + 21, cy));
      const okH = r.height >= 44 || (hits(cx, cy - 21) && hits(cx, cy + 21));
      return { el: label(el), w: okW ? Math.max(44, Math.round(r.width)) : Math.round(r.width), h: okH ? Math.max(44, Math.round(r.height)) : Math.round(r.height), cx: Math.round(cx), cy: Math.round(cy) }; });
    const zone = (cx: number, cy: number) => { const d = Math.min(Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy)) / h; return d < 0.6 ? 'verde' : d < 0.95 ? 'amarela' : 'vermelha'; };
    const zoned = small.map((s) => ({ ...s, zona: zone(s.cx, s.cy) }));
    // cobertura: amostra numa grade
    let covered = 0, total = 0;
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) { total++; const e = document.elementFromPoint(x, y); if (e && e.id !== 'game' && e !== document.body && e.id !== 'hud' && !e.classList.contains('hurt')) covered++; }
    // contraste do texto
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
    const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const bgOf = (el: Element | null): number[] | null => { while (el) { const c = parse(getComputedStyle(el).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c; el = el.parentElement; } return null; };
    const lowContrast: any[] = [];
    const smallText: any[] = [];
    for (const el of [...document.querySelectorAll('#hud *')].filter(vis)) {
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join('');
      if (!txt) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) smallText.push({ el: label(el), txt: txt.slice(0, 24), fs });
      const fg = parse(cs.color); const bg = bgOf(el);
      const shadow = cs.textShadow !== 'none';
      if (!bg) { if (!shadow) lowContrast.push({ el: label(el), txt: txt.slice(0, 24), why: 'sem fundo nem sombra (sobre o mapa)' }); continue; }
      const a = lum(fg), b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 4.5) lowContrast.push({ el: label(el), txt: txt.slice(0, 24), ratio: +ratio.toFixed(2) });
    }
    return { controles: zoned.length, abaixoDe44: touch ? zoned.filter((s) => s.w < 44 || s.h < 44) : [], zonas: zoned, cobertura: +(100 * covered / total).toFixed(1), contrasteBaixo: lowContrast, textoPequeno: smallText };
  }, { w: v.w, h: v.h, touch: v.touch });
  await ctx.close();
}
// v67 (checklist do guia: daltonismo): a mesma tela com o filtro de cada tipo, aplicado à página inteira (o canvas também).
const CVD: Record<string, string> = {
  deuteranopia: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
  protanopia: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
  tritanopia: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0',
};
{
  const { token } = await issue(id);
  const ctx = await br.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await ctx.addInitScript('window.__name = (f) => f');
  await ctx.addInitScript(`localStorage.setItem('nin.token', ${JSON.stringify(token)})`);
  const p = await ctx.newPage();
  await p.goto(URL_);
  await wait(4500);
  for (const sel of ['text=Entendi', 'text=Fechar (já entendi)', 'text=Guardar', 'text=Continuar']) { try { await p.click(sel, { timeout: 800 }); } catch {} }
  await p.fill('#chat-input', '/admin ir map_2 50 50'); await p.press('#chat-input', 'Enter'); await wait(2500);
  await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  for (const sel of ['text=Guardar', 'text=Entendi']) { try { await p.click(sel, { timeout: 800 }); } catch {} }
  await wait(800);
  await p.screenshot({ path: `${OUT}/${TAG}_daltonismo_normal.png` });
  for (const [kind, matrix] of Object.entries(CVD)) {
    await p.evaluate(({ kind, matrix }) => {
      document.getElementById('cvd-svg')?.remove();
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.id = 'cvd-svg';
      svg.setAttribute('style', 'position:absolute;width:0;height:0');
      svg.innerHTML = `<filter id="cvd-${kind}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${matrix}"/></filter>`;
      document.body.append(svg);
      document.documentElement.style.filter = `url(#cvd-${kind})`;
    }, { kind, matrix });
    await wait(300);
    await p.screenshot({ path: `${OUT}/${TAG}_daltonismo_${kind}.png` });
  }
  await ctx.close();
}

const fs = await import('node:fs');
fs.writeFileSync(`${OUT}/${TAG}_auditoria.json`, JSON.stringify(report, null, 1));
for (const [k, r] of Object.entries<any>(report)) console.log(k, 'controles', r.controles, 'abaixo44', r.abaixoDe44.length, 'cobertura%', r.cobertura, 'contraste<4.5', r.contrasteBaixo.length, 'texto<12px', r.textoPequeno.length);
await br.close(); await db.end(); process.exit(0);
