/*
 * Confere as animações desenhadas DENTRO do jogo: simula as mensagens do servidor de cada jutsu (cast, projectile,
 * impact, ground...) e fotografa os momentos certos, com o relógio do jogo 5x mais lento para pegar cada quadro.
 *
 *   bash scripts/ambiente-local.sh                     # uma vez por sessão: banco, servidor e o ninja 'rin'
 *   set -a && . /var/tmp/jogo.env && set +a
 *   npx tsx arte/jutsus-vfx/capturar.ts <pasta de saída> [jutsu,jutsu,...]
 *   python3 arte/jutsus-vfx/folha.py <pasta de saída>  # junta as fotos de cada jutsu numa folha (folha_<jutsu>.png)
 *
 * Para um jutsu novo: acrescente o plano dele em PLANOS (abaixo). `steps` = [ms, mensagem]; `shots` = os ms das fotos.
 * Os tempos são do jogo (já vezes 5 na hora de esperar). X, Y = onde o ninja está; há dois alvos falsos (Lodos) em
 * (X+4, Y) e (X+6, Y+2), para os jutsus que procuram alvo (Lança Saltadora, Correntes de Raio...).
 * SÓ VISUAL: nada disso passa pelo servidor; para ver a regra de verdade, teste com um ninja da classe no jogo.
 */
import { createRequire } from 'node:module';
import pg from 'pg';
import { makeTokenIssuer } from '../../src/auth/issueToken.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2];
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
if (!OUT) throw new Error('uso: npx tsx arte/jutsus-vfx/capturar.ts <pasta de saída> [jutsu,jutsu,...]');
const SL = 5;   // o relógio do jogo anda 5x mais devagar
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Step = [number, Record<string, unknown>];
type Plan = { steps: Step[]; shots: number[] };

/** Os planos de cada jutsu, a partir de onde o ninja está (X, Y). Copie o da mesma forma para um jutsu novo. */
function PLANOS(X: number, Y: number): Record<string, Plan> {
  const C = (skill: string, extra = {}) => ({ type: 'cast', skill, x: X, y: Y, fx: 1, fy: 0, ...extra });   // lançou
  const CS = (skill: string, ms: number) => ({ type: 'cast_start', skill, ms });                               // selos
  const proj = (id: number, skill: string, a: number, speed: number, range: number) =>
    ({ type: 'projectile', id, skill, x: X + 0.4, y: Y, fx: Math.cos(a), fy: Math.sin(a), speed, range });
  const imp = (id: number, skill: string, x: number, y: number, r = 0) => ({ type: 'impact', id, skill, x, y, r });
  const aviso = (id: number, skill: string, x: number, y: number, r: number, ms: number): Step[] =>
    [[0, { type: 'ground', id, kind: 'aviso', x, y, r, ms, skill }], [ms, { type: 'ground_end', id }]];
  const zona = (id: number, skill: string, kind: string, x: number, y: number, r: number, ms: number, follow = false): Step[] =>
    [[0, { type: 'ground', id, kind, x, y, r, ms, skill, ...(follow ? { follow: '__ME__' } : {}) }], [ms, { type: 'ground_end', id }]];
  const chuva = (skill: string, base: number): Step[] => [[0, { ...C(skill, { tx: X + 4, ty: Y }) }],
    ...[[0, 0], [-1, -0.8], [1, -0.6], [-0.7, 0.9], [0.9, 0.8]].flatMap(([dx, dy], i) => aviso(base + i, skill, X + 4 + dx!, Y + dy!, 1.3, 800 + i * 250))];
  return {
    // ---- forma "linha" (vai até o fim da linha; tx/ty = onde acabou)
    lightning_corrente: { steps: [[0, C('lightning_corrente', { tx: X + 6, ty: Y })]], shots: [50, 140, 250, 380, 520, 900] },
    // ---- avanço / recuo (o servidor move o ninja; a animação vai de X até o destino)
    lightning_impulso: { steps: [[0, C('lightning_impulso')]], shots: [30, 100, 160, 250, 360, 520] },
    lightning_3: { steps: [[0, CS('lightning_3', 500)], [500, C('lightning_3', { tx: X + 5, ty: Y })]], shots: [300, 560, 640, 740, 900, 1150] },
    lightning_risco: { steps: [[0, C('lightning_risco', { tx: X + 7, ty: Y })]], shots: [40, 110, 170, 250, 380, 520, 800] },
    // ---- projétil (o quadro voa com a mensagem projectile e estoura no impact)
    lightning_shuriken: { steps: [[0, C('lightning_shuriken')], [80, proj(9900, 'lightning_shuriken', 0, 16, 3.6)], [305, imp(9900, 'lightning_shuriken', X + 4, Y)]],
      shots: [40, 120, 200, 330, 450, 600] },
    lightning_2: { steps: [[0, C('lightning_2')], ...[-0.44, -0.22, 0, 0.22, 0.44].map((a, i) => [200, proj(9910 + i, 'lightning_2', a, 16, 5)] as Step),
      ...[-0.44, -0.22, 0, 0.22, 0.44].map((a, i) => [512, imp(9910 + i, 'lightning_2', X + 0.4 + 5 * Math.cos(a), Y + 5 * Math.sin(a))] as Step)],
      shots: [40, 120, 230, 380, 560, 800] },
    // ---- em volta de quem lançou
    lightning_fluxo: { steps: [[0, C('lightning_fluxo')]], shots: [40, 110, 220, 380, 560, 800] },
    lightning_armadura: { steps: [[0, CS('lightning_armadura', 500)], [500, C('lightning_armadura')]], shots: [300, 560, 700, 820, 2000, 5600] },
    // ---- buff no Básico (fica na mão durante o buff)
    lightning_maos: { steps: [[0, C('lightning_maos')]], shots: [50, 150, 300, 1000, 3000, 5100] },
    // ---- 1º uso marca, 2º volta
    lightning_volta: { steps: [[0, C('lightning_volta')], [1500, C('lightning_volta', { x: X + 4, y: Y })]], shots: [150, 900, 1540, 1620, 1780, 2100] },
    // ---- alvos (procura quem está na linha/perto)
    lightning_raio: { steps: [[0, C('lightning_raio', { tx: X + 4, ty: Y })]], shots: [40, 130, 260, 420, 560, 800] },
    lightning_correntes: { steps: [[0, C('lightning_correntes', { tx: X + 6, ty: Y })]], shots: [60, 160, 280, 500, 1000, 1800] },
    // ---- faixa larga
    lightning_rugido: { steps: [[0, CS('lightning_rugido', 500)], [500, C('lightning_rugido', { tx: X + 7, ty: Y })]], shots: [200, 420, 560, 700, 900, 1200] },
    // ---- zona no chão e avisos (o desenho vem da mensagem ground)
    lightning_rede: { steps: [[0, C('lightning_rede', { tx: X + 4, ty: Y })], ...zona(9920, 'lightning_rede', 'raio', X + 4, Y, 2.5, 3000)], shots: [300, 1500] },
    lightning_4: { steps: [[0, C('lightning_4', { tx: X + 4, ty: Y })], ...aviso(9930, 'lightning_4', X + 4, Y, 3.5, 1000)], shots: [300, 750, 930, 1120, 1350, 1900] },
    lightning_ceu: { steps: chuva('lightning_ceu', 9940), shots: [300, 700, 860, 1100, 1500, 2600] },
    // ---- exemplos de Cura (zona que anda com quem lançou)
    heal_santuario: { steps: [[0, CS('heal_santuario', 500)], [500, C('heal_santuario')], ...zona(9820, 'heal_santuario', 'cura', X, Y, 2.5, 5000, true).map(([t, m]) => [t + 500, m] as Step)],
      shots: [620, 820, 1100, 2000, 3300, 5500] },
  };
}

const issue = makeTokenIssuer({ secret: process.env.JWT_SECRET! });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const id = (await db.query(`SELECT id FROM game.players WHERE username = 'rin'`)).rows[0]?.id;
if (!id) throw new Error("o ninja 'rin' não existe: rode bash scripts/ambiente-local.sh");
const br = await chromium.launch();
const { token } = await issue(id);
const ctx = await br.newContext({ viewport: { width: 1100, height: 620 }, deviceScaleFactor: 2 });
await ctx.addInitScript('window.__name = (f) => f');
await ctx.addInitScript(`(() => { const SLOW = ${1 / SL}; const real = performance.now.bind(performance); let base = null;
  performance.now = () => { const r = real(); if (base === null) return r; return base + (r - base) * SLOW; };
  window.__slow = () => { base = real(); };
  const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf(() => cb(performance.now())); })();`);
await ctx.addInitScript(`localStorage.setItem('nin.token', ${JSON.stringify(token)}); localStorage.setItem('nin.debug','1');`);
const p = await ctx.newPage();
p.on('pageerror', (e: Error) => console.log('ERRO no jogo:', e.message));
await p.goto(`http://localhost:${process.env.PORT ?? 3000}`);
await wait(4500);
for (const sel of ['text=Entendi', 'text=Fechar (já entendi)', 'text=Guardar']) { try { await p.click(sel, { timeout: 800 }); } catch { /* sem aviso */ } }
await p.fill('#chat-input', '/admin ir academy_interior 13 5.5');   // Academia: chão liso, de dia
await p.press('#chat-input', 'Enter');
await wait(3000);
await p.evaluate(() => (document.activeElement as HTMLElement)?.blur());
await p.evaluate(() => document.querySelectorAll('body > :not(#game)').forEach((e) => { (e as HTMLElement).style.visibility = 'hidden'; }));
const [X, Y] = await p.evaluate(() => (window as any).ninDebug.drawn());
await p.evaluate(([x, y]) => {   // dois alvos falsos (só no desenho)
  const D = (window as any).ninDebug;
  D.sim({ type: 'monster_spawned', monster: { id: 'alvo1', type: 'slime', x: x + 4, y, hp: 50, maxHp: 50 } });
  D.sim({ type: 'monster_spawned', monster: { id: 'alvo2', type: 'slime', x: x + 6, y: y + 2, hp: 50, maxHp: 50 } });
}, [X, Y]);
await p.evaluate(() => (window as any).__slow());
for (const [skill, plan] of Object.entries(PLANOS(X, Y))) {
  if (ONLY && !ONLY.includes(skill)) continue;
  const t0 = Date.now();
  const timeline = [...plan.steps.map(([t, m]) => ({ t, m, shot: false })), ...plan.shots.map((t) => ({ t, m: null, shot: true }))].sort((a, b) => a.t - b.t);
  let k = 0;
  for (const ev of timeline) {
    const dt = ev.t * SL - (Date.now() - t0);
    if (dt > 0) await wait(dt);
    if (ev.shot) {
      const [sx, sy] = await p.evaluate(() => { const D = (window as any).ninDebug; return D.screenOf(D.meId()); });
      await p.screenshot({ path: `${OUT}/${skill}_${++k}.png`, clip: { x: Math.max(0, sx - 200), y: Math.max(0, sy - 230), width: 760, height: 400 } });
    } else {
      await p.evaluate((m: any) => { const D = (window as any).ninDebug; m.playerId = D.meId(); if (m.follow === '__ME__') m.follow = D.meId(); D.sim(m); }, ev.m);
    }
  }
  console.log(skill, k, 'fotos');
  await wait(1500 * SL);
}
await ctx.close();
await br.close();
await db.end();
