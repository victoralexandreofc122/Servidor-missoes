import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADMIN_HELP, parseAdminCommand } from '../src/realtime/admin.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { ITEM_BY_CODE } from '../src/realtime/items.js';
import { JUTSU_BY_CODE } from '../src/realtime/jutsus.js';
import { blocked } from '../src/realtime/movement.js';
import { PvpStats, moveName, rate, reportText, toClassRows } from '../src/realtime/pvpStats.js';
import { readdirSync, readFileSync } from 'node:fs';
import { loadPublicFiles } from '../src/web/staticFiles.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * v19: painel do admin (mensagem própria e catálogo), os comandos em português (os nomes antigos continuam valendo) e os
 * números do PvP por classe e por golpe (/admin pvp).
 */

const TYPES = ['slime', 'dummy', 'lodo_escuro', 'rei_lodo'];
const MAPS = ['map_1', 'map_2', 'caverna_lodo'];
const parse = (text: string) => parseAdminCommand(text, TYPES, MAPS);
const FOREST = REALTIME.maps.map_2;

function config(pvp = false): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      pvp,
      monsters: { ...REALTIME.combat.monsters, count: 0, attackDamage: 0 },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}
const session = (world: any, id: string) => world.sessions.get(id);

function openRow(len: number): { x: number; y: number } {
  const free = (x: number, y: number) => !blocked(x, y, FOREST.walls) && !blocked(x, y - 0.5, FOREST.walls) && !blocked(x, y + 0.5, FOREST.walls);
  for (let y = 22; y < 90; y += 1) {
    for (let x = 8; x < 90 - len; x += 1) {
      let ok = true;
      for (let k = 0; k <= len && ok; k += 0.25) ok = free(x + k, y);
      if (ok) return { x, y };
    }
  }
  throw new Error('sem trecho livre');
}

describe('comandos de admin em português', () => {
  it('os nomes novos dão os mesmos comandos de antes (e os antigos continuam valendo)', () => {
    const same: [string, string][] = [
      ['/admin nivel Kaito 25', '/admin level Kaito 25'],
      ['/admin invocar slime 3', '/admin spawn slime 3'],
      ['/admin darjutsu Kaito fire_2 4', '/admin givejutsu Kaito fire_2 4'],
      ['/admin daritem Kaito kunai 2', '/admin giveitem Kaito kunai 2'],
      ['/admin ryo Kaito 500', '/admin giveryo Kaito 500'],
      ['/admin darryo Kaito 500', '/admin giveryo Kaito 500'],
      ['/admin zerarpontos Kaito', '/admin resetstats Kaito'],
      ['/admin fimdejogo pvp ligar', '/admin endgame pvp on'],
      ['/admin fimdejogo vilas desligar', '/admin endgame vilas off'],
      ['/admin renegado Kaito sim', '/admin renegado Kaito on'],
      ['/admin renegado Kaito nao', '/admin renegado Kaito off'],
      ['/admin ajuda', '/admin help'],
    ];
    for (const [pt, old] of same) assert.deepEqual(parse(pt), parse(old), pt);
    assert.deepEqual(parse('/admin nivel Kaito 25'), { ok: true, command: { cmd: 'level', username: 'Kaito', level: 25 } });
    assert.deepEqual(parse('/admin NÍVEL Kaito 25'), parse('/admin nivel Kaito 25'), 'com acento e maiúscula');
    assert.deepEqual(parse('/admin fimdejogo akatsuki auto'), { ok: true, command: { cmd: 'endgame', module: 'akatsuki', mode: 'auto' } });
  });

  it('pvp [dias]: 7 por padrão, de 1 a 90', () => {
    assert.deepEqual(parse('/admin pvp'), { ok: true, command: { cmd: 'pvp', days: 7 } });
    assert.deepEqual(parse('/admin pvp 30'), { ok: true, command: { cmd: 'pvp', days: 30 } });
    for (const bad of ['/admin pvp 0', '/admin pvp 91', '/admin pvp muitos', '/admin pvp 7 8']) assert.equal(parse(bad).ok, false, bad);
  });

  it('o uso e a ajuda mostram os nomes em português; a auditoria guarda o nome interno de antes', () => {
    const r = parse('/admin nivel Kaito 99') as { ok: false; command: string; text: string };
    assert.deepEqual([r.ok, r.command], [false, 'level']);
    assert.match(r.text, /^Uso: \/admin nivel/);
    assert.match((parse('/admin invocar dragao') as { text: string }).text, /^Uso: \/admin invocar/);
    assert.match((parse('/admin fimdejogo pvp talvez') as { text: string }).text, /ligar\|desligar\|auto/);
    assert.match((parse('/admin renegado Kaito talvez') as { text: string }).text, /sim\|nao/);
    for (const name of ['nivel', 'invocar', 'darjutsu', 'daritem', 'ryo', 'zerarpontos', 'pvp', 'fimdejogo', 'painel 🛡️']) assert.ok(ADMIN_HELP.includes(name), name);
    for (const old of ['level <', 'spawn <', 'givejutsu', 'giveitem', 'resetstats', 'endgame <']) assert.equal(ADMIN_HELP.includes(old), false, old);
  });
});

describe('painel do admin', () => {
  function world() {
    const w = setupWorld(config());
    const v = w.connect('victor');
    const k = w.connect('kaito');
    session(w.world, v.id).isAdmin = true;
    return { w, v, k };
  }

  it('o painel manda o comando sem o "/admin": vale igual ao chat e não gasta o ritmo do chat', () => {
    const { w, v } = world();
    placeIn(w.world, v.id, 'map_2', openRow(6).x, openRow(6).y);
    v.send({ type: 'admin', command: 'invocar slime 2' });
    assert.match(v.conn.last('notice').text, /2x slime invocado/);
    assert.equal(w.world.monsterList().filter((m) => m.type === 'slime').length, 2);
    v.send({ type: 'chat', message: 'oi' });
    assert.equal(v.conn.of('error').length, 0, 'o chat continua livre');
  });

  it('quem não é admin: "Comando desconhecido" e nenhum catálogo', () => {
    const { w, k } = world();
    const before = w.world.monsterList().length;
    k.send({ type: 'admin', command: 'invocar slime 2' });
    assert.equal(k.conn.last('notice').text, 'Comando desconhecido.');
    assert.equal(w.world.monsterList().length, before);
    k.send({ type: 'admin_catalog' });
    assert.equal(k.conn.of('admin_catalog').length, 0);
  });

  it('ritmo próprio: 5 seguidos e depois "calma"', () => {
    const { v } = world();
    for (let i = 0; i < 6; i++) v.send({ type: 'admin', command: 'hora dia' });
    assert.equal(v.conn.last('notice').text, 'Admin: calma, um comando de cada vez.');
    assert.equal(v.conn.of('notice').filter((n: any) => /calma/.test(n.text)).length, 1);
  });

  it('catálogo: ninjas online, monstros com nome (o Rei Lodo é chefe), mapas e vilas', () => {
    const { v } = world();
    v.send({ type: 'admin_catalog' });
    const c = v.conn.last('admin_catalog');
    assert.deepEqual(c.players.map((p: any) => p.username), ['kaito', 'victor']);
    assert.deepEqual(c.monsters.find((m: any) => m.code === 'rei_lodo'), { code: 'rei_lodo', name: 'Rei Lodo (chefe)' });
    assert.ok(c.maps.some((m: any) => m.id === 'caverna_lodo' && m.name === 'Caverna do Lodo'));
    assert.deepEqual(c.villages.map((x: any) => x.code), ['chama', 'mare', 'vento', 'rocha']);
  });
});

describe('números do PvP (por classe e por golpe)', () => {
  it('PvpStats: dano e acertos por golpe, vitórias e derrotas por classe, % de vitória', () => {
    const p = new PvpStats(0);
    p.hit('lightning', 'lightning', 30);
    p.hit('lightning', 'lightning', 20);
    p.hit('efeito:queimadura', 'fire', 4);
    p.hit('attack', 'fire', 0);                                     // escudo comeu tudo: não conta
    p.kill('lightning', 'lightning', 'fire', 'arena');
    p.kill('efeito:queimadura', 'fire', 'lightning', 'conflito');
    p.kill('attack', 'lightning', 'fire', 'aberto');
    const r = p.report(5 * 60_000);
    assert.equal(r.minutes, 5);
    assert.deepEqual(r.fights, { arena: 1, conflito: 1, aberto: 1 });
    assert.deepEqual(r.classes.map((c) => [c.name, c.wins, c.losses, c.damage, c.winRate]), [['Relâmpago', 2, 1, 50, 67], ['Fogo', 1, 2, 4, 33]]);
    assert.deepEqual(r.moves.map((m) => [m.name, m.damage, m.hits, m.perHit, m.kills]), [
      [moveName('lightning'), 50, 2, 25, 1], ['Queimadura', 4, 1, 4, 1], ['Ataque Básico', 0, 0, 0, 1],
    ]);
    assert.equal(rate(0, 0), null);
    assert.deepEqual(toClassRows([{ code: 'sem_classe', wins: 1, losses: 0 }]), [{ code: 'sem_classe', name: 'Sem classe', wins: 1, losses: 0, winRate: 100 }]);
    const text = reportText(r, { days: 7, rows: toClassRows([{ code: 'water', wins: 3, losses: 1 }]) });
    assert.match(text, /3 lutas/);
    assert.match(text, /Relâmpago 2V\/1D \(67%\)/);
    assert.match(text, /Zona de Conflito, últimos 7 dias \(banco\): Água 3V\/1D \(75%\)/);
  });

  it('nomes dos golpes: jutsu, Ataque Básico, arma lançada, poder da Akatsuki e efeito', () => {
    assert.equal(moveName('attack'), 'Ataque Básico');
    assert.equal(moveName('efeito:queimadura'), 'Queimadura');
    assert.equal(moveName('poder:blast'), 'Escultura Detonante');
    assert.equal(moveName('fire'), JUTSU_BY_CODE.get('fire')!.name);
    assert.equal(moveName('arma:kunai'), ITEM_BY_CODE.get('kunai')!.name);
  });

  it('no jogo: o Relâmpago e o Ataque Básico de A derrubam B; o admin vê a classe e o golpe (texto e tabela)', () => {
    const w = setupWorld(config(true));
    const a = w.connect('kaito');
    const b = w.connect('mei');
    const v = w.connect('victor');
    session(w.world, v.id).isAdmin = true;
    const row = openRow(6);
    placeIn(w.world, a.id, 'map_2', row.x, row.y);
    placeIn(w.world, b.id, 'map_2', row.x + 1, row.y);
    Object.assign(session(w.world, a.id), { fx: 1, fy: 0, chakra: 100 });
    session(w.world, a.id).classes.primary = 'lightning';
    session(w.world, b.id).classes.primary = 'water';
    session(w.world, a.id).kits.A = ['lightning', 'water', 'fire', 'taijutsu'];
    session(w.world, a.id).jutsus.set('lightning', 0);
    a.send({ type: 'cast', skill: 'lightning' });
    assert.equal(a.conn.of('cast_failed').length, 0, JSON.stringify(a.conn.of('cast_failed')));
    const bolt = 100 - session(w.world, b.id).hp;
    assert.ok(bolt > 0, 'o raio acertou');
    session(w.world, b.id).hp = 1;
    w.run(1000);
    a.send({ type: 'attack' });
    assert.equal(session(w.world, b.id).dead, true, 'o Ataque Básico derrubou');
    v.send({ type: 'admin', command: 'pvp' });
    const { report } = v.conn.last('admin_pvp');
    assert.deepEqual(report.fights, { arena: 0, conflito: 0, aberto: 1 });
    assert.deepEqual(report.classes.map((c: any) => [c.code, c.wins, c.losses]), [['lightning', 1, 0], ['water', 0, 1]]);
    const move = (label: string) => report.moves.find((m: any) => m.label === label);
    assert.deepEqual([move('lightning').damage, move('lightning').hits, move('lightning').kills], [bolt, 1, 0]);
    assert.deepEqual([move('attack').hits, move('attack').kills], [1, 1]);
    assert.match(v.conn.last('notice').text, /Por classe: Relâmpago 1V\/0D \(100%\)/);
  });
});

describe('cliente do painel', () => {
  const pub = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

  it('todo módulo que o cliente importa está na lista fechada do servidor (senão o jogo inteiro não abre)', () => {
    const served = new Set(loadPublicFiles().map((f) => f.route));
    for (const file of readdirSync(new URL('../public/', import.meta.url)).filter((f) => f.endsWith('.js'))) {
      for (const m of pub(file).matchAll(/^import[^'"]*from\s+['"]\.\/([\w.-]+\.js)['"]/gm)) {
        assert.ok(served.has(`/${m[1]}`), `${file} importa ${m[1]}, que o servidor não serve`);
      }
    }
    assert.ok(served.has('/adminPanel.js'));
  });

  it('o botão começa escondido (só o admin vê); o painel só PEDE (admin, admin_catalog) e confirma o que não volta atrás', () => {
    const html = pub('index.html');
    assert.match(html, /<button id="admin-toggle"[^>]* hidden/);
    assert.match(html, /id="admin-panel"[^>]* hidden/);
    const js = pub('adminPanel.js');
    const types = [...js.matchAll(/send\(\{ type: '([a-z_]+)'/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(types)].sort(), ['admin', 'admin_catalog']);
    for (const cmd of ['zerarpontos', 'renegado ${n} sim', 'eleicao', 'temporada fechar', 'akatsuki remover']) {
      const at = js.indexOf(cmd);
      assert.ok(at > 0, cmd);
      assert.match(js.slice(Math.max(0, at - 120), at), /danger\(/, `${cmd} pede confirmação`);
    }
    assert.match(pub('game.js'), /adminUI\.refresh\(\)/);
  });
});
