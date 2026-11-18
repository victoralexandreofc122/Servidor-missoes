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
    // ---- Fogo (v56 e v73/v74)
    fire: { steps: [[0, C('fire')], [60, proj(9600, 'fire', 0, 14, 4)], [345, imp(9600, 'fire', X + 4.4, Y, 2)]], shots: [40, 150, 300, 420, 700, 1100] },
    fire_endan: { steps: [[0, C('fire_endan')]], shots: [60, 200, 500, 800, 1200, 1600] },
    fire_kasumi: { steps: [[0, C('fire_kasumi', { tx: X + 4, ty: Y })], ...aviso(9601, 'fire_kasumi', X + 4, Y, 2.5, 1200)], shots: [300, 800, 1150, 1300, 1600, 2200] },
    fire_hibashiri: { steps: [[0, C('fire_hibashiri', { tx: X + 6, ty: Y })]], shots: [100, 300, 600, 900, 1300, 1800] },
    fire_2: { steps: [[0, C('fire_2')], ...[-0.44, -0.22, 0, 0.22, 0.44].map((a, i) => [100, proj(9610 + i, 'fire_2', a, 14, 5)] as Step),
      ...[-0.44, -0.22, 0, 0.22, 0.44].map((a, i) => [457, imp(9610 + i, 'fire_2', X + 0.4 + 5 * Math.cos(a), Y + 5 * Math.sin(a))] as Step)],
      shots: [60, 200, 400, 560, 800, 1100] },
    fire_ryuka: { steps: [[0, C('fire_ryuka', { tx: X + 6, ty: Y })]], shots: [80, 200, 380, 500, 800, 1300] },
    fire_haiseki: { steps: [[0, C('fire_haiseki')], ...aviso(9620, 'fire_haiseki', X + 2.5, Y, 2, 1000), ...aviso(9621, 'fire_haiseki', X - 2.5, Y, 2, 1000)],
      shots: [300, 700, 1000, 1150, 1400, 1900] },
    fire_lamina: { steps: [[0, C('fire_lamina')]], shots: [100, 400, 800, 2000, 4000, 5300] },
    fire_marca: { steps: [[0, C('fire_marca', { tx: X + 4, ty: Y })], [300, { type: 'combo', target: 'monster', id: 'alvo1', combo: 'marca', ms: 2000 }],
      [1500, { type: 'combo', target: 'monster', id: 'alvo1', combo: 'detonacao' }]], shots: [100, 250, 600, 1200, 1560, 1800] },
    fire_3: { steps: [[0, C('fire_3')]], shots: [80, 200, 400, 600, 900, 1400] },
    fire_hotan: { steps: [[0, C('fire_hotan')], [60, proj(9630, 'fire_hotan', 0, 12, 6)], [560, imp(9630, 'fire_hotan', X + 6.4, Y, 2)]], shots: [60, 300, 600, 700, 950, 1400] },
    fire_chao: { steps: [[0, C('fire_chao', { tx: X + 4, ty: Y })], ...zona(9640, 'fire_chao', 'fogo', X + 4, Y, 2.5, 3000)], shots: [100, 400, 1000, 2000, 2900, 3400] },
    fire_cometa: { steps: [[0, C('fire_cometa', { tx: X + 5, ty: Y })]], shots: [60, 200, 300, 450, 800, 1200] },
    fire_rugido: { steps: [[0, CS('fire_rugido', 500)], [500, C('fire_rugido', { tx: X + 7, ty: Y })]], shots: [300, 560, 700, 900, 1100, 1500] },
    fire_4: { steps: chuva('fire_4', 9650), shots: [300, 700, 860, 1100, 1500, 2600] },
    fire_coroa: { steps: [[0, CS('fire_coroa', 500)], [500, C('fire_coroa')]], shots: [300, 560, 750, 1000, 1400, 2000] },
    fire_coluna: { steps: [[0, C('fire_coluna', { tx: X + 4, ty: Y })], ...aviso(9660, 'fire_coluna', X + 4, Y, 2.5, 900)], shots: [300, 700, 950, 1150, 1500, 2200] },
    // ---- Cura (v74/v75): tx/ty = o aliado/alvo (o Lodo falso em X+4)
    heal: { steps: [[0, C('heal', { tx: X + 4, ty: Y })]], shots: [60, 200, 400, 700, 1000, 1500] },
    heal_bisturi: { steps: [[0, C('heal_bisturi')]], shots: [100, 300, 500, 1500, 3000, 5200] },
    heal_desintox: { steps: [[0, C('heal_desintox', { tx: X + 4, ty: Y })]], shots: [60, 200, 400, 700, 1000, 1400] },
    heal_palma: { steps: [[0, CS('heal_palma', 1200)], [1200, C('heal_palma', { tx: X + 4, ty: Y })]], shots: [300, 800, 1250, 1500, 1800, 2300] },
    heal_agulha: { steps: [[0, C('heal_agulha', { tx: X + 4, ty: Y })]], shots: [80, 200, 350, 500, 700, 1000] },
    heal_casca: { steps: [[0, C('heal_casca')]], shots: [100, 300, 700, 1500, 2700, 3200] },
    heal_disturbio: { steps: [[0, C('heal_disturbio', { tx: X + 4, ty: Y })]], shots: [60, 300, 700, 1200, 1700, 2100] },
    heal_2: { steps: [[0, C('heal_2', { tx: X + 3, ty: Y })]], shots: [60, 200, 350, 500, 800, 1300] },
    heal_banho: { steps: [[0, C('heal_banho', { tx: X + 4, ty: Y })]], shots: [100, 300, 500, 800, 1100, 1700] },
    heal_septica: { steps: [[0, C('heal_septica')], [80, proj(9700, 'heal_septica', 0, 14, 4)], [365, imp(9700, 'heal_septica', X + 4.4, Y)]], shots: [60, 200, 380, 500, 800, 1400] },
    heal_onda: { steps: [[0, C('heal_onda')]], shots: [100, 250, 450, 700, 1000, 1500] },
    heal_3: { steps: [[0, C('heal_3')], ...zona(9710, 'heal_3', 'cura', X, Y, 4, 3000)], shots: [200, 600, 1200, 2000, 2900, 3400] },
    heal_meridianos: { steps: [[0, C('heal_meridianos', { tx: X + 4, ty: Y })]], shots: [100, 300, 500, 700, 900, 1300] },
    heal_milagre: { steps: [[0, C('heal_milagre')], ...zona(9720, 'heal_milagre', 'cura', X, Y, 4, 1500)], shots: [100, 300, 500, 900, 1200, 1700] },
    heal_colosso: { steps: [[0, CS('heal_colosso', 600)], [600, C('heal_colosso', { tx: X + 2, ty: Y })]], shots: [300, 650, 800, 1000, 1300, 1900] },
    heal_4: { steps: [[0, CS('heal_4', 500)], [500, C('heal_4')]], shots: [300, 700, 1200, 2500, 4000, 6000] },
    // ---- Pedra (v79). '__ME__' vira o id do ninja (o golpe no escudo dele)
    stone: { steps: [[0, C('stone')], [1500, { type: 'hit', target: 'player', id: '__ME__', amount: 0, kind: 'damage', hp: 100, maxHp: 100, shielded: true }]],
      shots: [60, 200, 330, 520, 760, 1600] },
    stone_4: { steps: [[0, C('stone_4')], [1500, { type: 'hit', target: 'player', id: '__ME__', amount: 0, kind: 'damage', hp: 100, maxHp: 100, shielded: true }]],
      shots: [60, 200, 330, 520, 760, 1600] },
    stone_resposta: { steps: [[0, C('stone_resposta')], [800, { type: 'hit', target: 'player', id: '__ME__', amount: 0, kind: 'damage', hp: 100, maxHp: 100, shielded: true }]],
      shots: [60, 180, 500, 860, 950, 1250] },
    stone_couraca: { steps: [[0, C('stone_couraca')]], shots: [60, 200, 350, 1200, 2500, 3850] },
    stone_pilares: { steps: [[0, C('stone_pilares', { tx: X + 4, ty: Y })]], shots: [80, 200, 380, 520, 1200, 2050] },
    stone_rocha: { steps: [[0, C('stone_rocha')], [80, proj(9800, 'stone_rocha', 0, 13, 4)], [390, imp(9800, 'stone_rocha', X + 4.4, Y)]], shots: [60, 200, 330, 450, 650, 1000] },
    stone_cascalho: { steps: [[0, C('stone_cascalho')], ...[-0.25, 0, 0.25].map((a, i) => [100, proj(9810 + i, 'stone_cascalho', a, 13, 5)] as Step),
      ...[-0.25, 0, 0.25].map((a, i) => [485, imp(9810 + i, 'stone_cascalho', X + 0.4 + 5 * Math.cos(a), Y + 5 * Math.sin(a))] as Step)], shots: [60, 200, 380, 520, 750, 1100] },
    stone_punho: { steps: [[0, C('stone_punho')]], shots: [60, 160, 300, 450, 2500, 5200] },
    stone_pisao: { steps: [[0, C('stone_pisao')]], shots: [40, 120, 260, 450, 700, 1300] },
    stone_toupeira: { steps: [[0, C('stone_toupeira', { tx: X + 5, ty: Y })]], shots: [60, 160, 300, 460, 640, 1100] },
    stone_carga: { steps: [[0, CS('stone_carga', 300)], [300, C('stone_carga', { tx: X + 5, ty: Y })]], shots: [200, 380, 500, 680, 880, 1300] },
    stone_muralha: { steps: [[0, C('stone_muralha', { tx: X + 2.5, ty: Y })], [80, { type: 'barrier', id: 9820, kind: 'rocha', x: X + 2, y: Y - 1.5, w: 1, h: 3, hp: 60, ms: 2400 }],
      [2480, { type: 'barrier_end', id: 9820 }]], shots: [100, 260, 420, 600, 1500, 2600] },
    stone_2: { steps: [[0, C('stone_2', { tx: X + 4, ty: Y })], ...zona(9830, 'stone_2', 'lama', X + 4, Y, 3, 3000)], shots: [100, 260, 500, 1300, 2200, 2900] },
    stone_lancas: { steps: [[0, C('stone_lancas', { tx: X + 4, ty: Y })], ...aviso(9840, 'stone_lancas', X + 4, Y, 2.5, 900)], shots: [300, 700, 900, 1000, 1250, 1700] },
    stone_avalanche: { steps: chuva('stone_avalanche', 9850), shots: [300, 700, 860, 1100, 1500, 2600] },
    stone_golem: { steps: [[0, CS('stone_golem', 1200)], [1200, C('stone_golem')],
      [1260, { type: 'monster_spawned', monster: { id: 'golem1', type: 'golem', x: X + 1.5, y: Y, hp: 80, maxHp: 80 } }],
      [1300, { type: 'summon', id: 'golem1', ownerId: '__ME__', kind: 'golem', hp: 80, maxHp: 80, ms: 12000 }],
      [2600, { type: 'summon_punch', id: 'golem1', x: X + 1.5, y: Y, r: 1.5, fx: 1, fy: 0 }], [3600, { type: 'monster_died', id: 'golem1', killerId: '' }]],
      shots: [1300, 1500, 1800, 2200, 2780, 3700] },
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
      await p.evaluate((m: any) => { const D = (window as any).ninDebug; m.playerId = D.meId(); for (const k of Object.keys(m)) if (m[k] === '__ME__') m[k] = D.meId(); D.sim(m); }, ev.m);
    }
  }
  console.log(skill, k, 'fotos');
  await wait(1500 * SL);
}
await ctx.close();
await br.close();
await db.end();
