import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { activeModules } from '../src/realtime/endgame.js';
import { makeEndgameStore } from '../src/realtime/endgameStore.js';
import { makeAdminStore, parseAdminCommand, type EndgameAdminCommand } from '../src/realtime/admin.js';
import { REALTIME } from '../src/realtime/config.js';
import { ITEMS } from '../src/realtime/items.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelStart } from '../src/realtime/stats.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

/*
 * Migração v11 (fim de jogo, docs/endgame.md) no PostgreSQL de verdade: as regras que NÃO podem ser burladas moram
 * no banco. Vila do servidor, eleição do Kage, diplomacia, renegado irreversível, ranking imune a admin, recompensa
 * pela cabeça, as 10 vagas da Akatsuki, capas e a manutenção periódica.
 */

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V11 = readFileSync(new URL('../db/schema_v11_endgame.sql', import.meta.url), 'utf8');
const rule = (name: string) => (e: { constraint?: string }) => e.constraint === name;
const no = (text: RegExp) => (r: { ok: boolean; text?: string }) => !r.ok && text.test(r.text ?? '');

describe('v11 no banco: fim de jogo (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });
  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];
  const store = () => makeEndgameStore(t.db);

  /** Ninja pronto: tutorial feito, nível, rank, vila, visual criado e conta antiga (vota). */
  async function ninja(name: string, opts: { level?: number; rank?: string; village?: string; admin?: boolean; fresh?: boolean } = {}) {
    const id = await t.createPlayer(name, opts.rank ?? 'GENIN');
    for (let s = 1; s <= 4; s++) await t.pool.query('SELECT game.advance_tutorial($1, $2)', [id, s]);
    if ((opts.level ?? 1) > 1) await makeProgression(t.db).grantXp(id, levelStart(opts.level!));
    await t.pool.query(`UPDATE game.players SET village = $2, appearance = $3::jsonb, is_admin = $4,
                          created_at = CASE WHEN $5 THEN now() ELSE now() - interval '30 days' END WHERE id = $1`,
    [id, opts.village ?? 'vila_1', JSON.stringify({ ...DEFAULT_APPEARANCE, village: opts.village ?? 'vila_1' }), opts.admin ?? false, opts.fresh ?? false]);
    if (opts.rank && opts.rank !== 'GENIN') await t.setRank(id, opts.rank);
    return id;
  }
  const modules = async (mode: 'on' | 'off' | 'auto') => {
    await t.pool.query(`UPDATE game.endgame_modules SET mode = $1`, [mode]);
  };

  it('migração: roda de novo sem erro; vilas, módulos em auto; jogador novo é da Folha; o Kage substitui o Hokage', async () => {
    await t.pool.query(V11);
    assert.deepEqual((await t.pool.query('SELECT code, name FROM game.villages ORDER BY sort_order')).rows.map((r) => r.name), ['Chama Eterna', 'Maré Oculta', 'Vento Cortante', 'Rocha Antiga']);
    assert.deepEqual((await t.pool.query(`SELECT code, mode, activated_at FROM game.endgame_modules ORDER BY code`)).rows.map((r) => r.mode), ['auto', 'auto', 'auto', 'auto']);
    const id = await t.createPlayer('novato');
    assert.equal((await one('SELECT village FROM game.players WHERE id = $1', [id])).village, 'vila_1');
    assert.equal((await one(`SELECT name FROM game.ranks WHERE code = 'HOKAGE'`))?.name ?? 'Kage', 'Kage');
    await assert.rejects(t.pool.query('UPDATE game.players SET village = NULL WHERE id = $1', [id]), rule('ck_players_village'), 'sem vila só o renegado');
  });

  it('módulos: população ativa liga em ordem; ligado fica; admin força (e liga os anteriores, desliga os seguintes)', async () => {
    const s = store();
    assert.equal(await s.available(), true);
    const p = await ninja('ativo');
    await s.touch(p);
    assert.ok((await s.population(7)) >= 1);
    assert.equal(await s.activate('vilas'), true);
    assert.equal(await s.activate('vilas'), false, 'uma vez só');
    assert.deepEqual([...activeModules((await s.politics()).modules)], ['vilas']);
    assert.equal((await one(`SELECT game.endgame_active('pvp') AS a`)).a, false, 'pvp sem a população dele');
    const admin = await ninja('admin1', { admin: true });
    await t.pool.query(`SELECT game.admin_endgame_mode($1, 'akatsuki', 'on')`, [admin]);
    assert.deepEqual((await t.pool.query(`SELECT code FROM game.endgame_modules WHERE game.endgame_active(code) ORDER BY code`)).rows.map((r) => r.code),
      ['akatsuki', 'pvp', 'renegados', 'vilas']);
    await t.pool.query(`SELECT game.admin_endgame_mode($1, 'pvp', 'off')`, [admin]);
    assert.deepEqual((await t.pool.query(`SELECT code FROM game.endgame_modules WHERE game.endgame_active(code) ORDER BY code`)).rows.map((r) => r.code), ['vilas']);
    await assert.rejects(t.pool.query(`SELECT game.admin_endgame_mode($1, 'pvp', 'on')`, [p]), rule('rule_admin_only'));
    assert.ok((await one(`SELECT count(*)::int AS n FROM game.admin_audit_log WHERE command = 'endgame'`)).n >= 2);
    await modules('on');
  });

  it('vila: escolha livre ao criar o personagem; depois uma troca só (não para Kage/candidato); desligado, não muda', async () => {
    const s = store();
    const fresh = await t.createPlayer('recem');
    assert.deepEqual(await s.chooseVillage(fresh, 'vila_3'), { ok: true, village: 'vila_3' }, 'visual vazio: escolha livre');
    await t.pool.query('UPDATE game.players SET appearance = $2::jsonb WHERE id = $1', [fresh, JSON.stringify(DEFAULT_APPEARANCE)]);
    assert.deepEqual(await s.chooseVillage(fresh, 'vila_5'), { ok: true, village: 'vila_5' }, 'a troca grátis');
    assert.ok(no(/já usou/)(await s.chooseVillage(fresh, 'vila_4')));
    const cand = await ninja('candidato', { level: 60 });
    await makeNinjaStore(t.db).applyKage(cand);
    assert.ok(no(/candidato/)(await s.chooseVillage(cand, 'vila_4')));
    await modules('off');
    const other = await ninja('outro');
    assert.ok(no(/ainda não está disponível/)(await s.chooseVillage(other, 'vila_4')));
    await modules('on');
  });

  it('eleição do Kage: Genin+ com conta de 7 dias, um voto; ganha quem tem mais votos (empate: quem se candidatou antes)', async () => {
    const s = store();
    const a = await ninja('cand_a', { level: 60, village: 'vila_5' });
    const b = await ninja('cand_b', { level: 60, village: 'vila_5' });
    const ns = makeNinjaStore(t.db);
    await ns.applyKage(a);
    await ns.applyKage(b);
    const ev = await s.tick();
    assert.ok(ev.some((e) => e.kind === 'eleicao_aberta' && e.village === 'vila_5'), 'sem Kage: a eleição abre');
    const voters = await Promise.all(['eleitor1', 'eleitor2', 'eleitor3'].map((n) => ninja(n, { village: 'vila_5' })));
    const newbie = await ninja('calouro', { village: 'vila_5', fresh: true });
    const academy = await ninja('cadete', { village: 'vila_5', rank: 'ACADEMY' });
    const foreign = await ninja('estrangeiro', { village: 'vila_3' });
    assert.ok(no(/7 dias/)(await s.vote(newbie, a)));
    assert.ok(no(/Genin/)(await s.vote(academy, a)));
    assert.ok(no(/não concorre/)(await s.vote(foreign, a)), 'outra vila: o candidato não é dela');
    assert.deepEqual(await s.vote(voters[0]!, b), { ok: true });
    assert.ok(no(/já votou/)(await s.vote(voters[0]!, a)));
    await s.vote(voters[1]!, b);
    await s.vote(voters[2]!, a);
    const panel = await s.villagePanel(voters[0]!, 'vila_5', false);
    assert.deepEqual(panel.election!.candidates.map((c) => c.username), ['cand_a', 'cand_b']);
    assert.equal(panel.election!.myVote, b);
    await t.pool.query(`UPDATE game.kage_elections SET closes_at = now() - interval '1 minute' WHERE village = 'vila_5' AND closed_at IS NULL`);
    const closed = await s.tick();
    assert.ok(closed.some((e) => e.kind === 'eleicao_fechada' && e.village === 'vila_5' && e.playerId === b));
    assert.equal((await one('SELECT game.kage_village_of($1) AS v', [b])).v, 'vila_5');
    assert.ok((await s.politics()).kages.some((k) => k.village === 'vila_5' && k.username === 'cand_b'));
  });

  it('diplomacia: guerra sozinho; aliança proposta e aceita (1 por vila); 24 h entre mudanças; trégua forçada vale por cima', async () => {
    const s = store();
    const admin = await ninja('admin2', { admin: true });
    const k3 = await ninja('kage_nevoa', { village: 'vila_3' });
    const k4 = await ninja('kage_nuvem', { village: 'vila_4' });
    const k5 = await ninja('kage_areia', { village: 'vila_5' });
    for (const [v, k] of [['vila_3', k3], ['vila_4', k4], ['vila_5', k5]] as const) await t.pool.query('SELECT game.admin_set_kage($1, $2, $3)', [admin, v, k]);
    assert.ok(no(/Só o Kage/)(await s.kageAction(await ninja('zezinho', { village: 'vila_3' }), 'guerra', 'vila_4')));
    assert.deepEqual(await s.kageAction(k3, 'guerra', 'vila_4'), { ok: true });
    assert.equal((await one(`SELECT game.village_relation('vila_4', 'vila_3') AS r`)).r, 'guerra');
    assert.ok(no(/já estão em guerra/)(await s.kageAction(k4, 'guerra', 'vila_3')));
    assert.ok(no(/Só quem declarou/)(await s.kageAction(k4, 'fim_guerra', 'vila_3')));
    assert.ok(no(/24 h/)(await s.kageAction(k3, 'fim_guerra', 'vila_4')), 'acabou de mudar');
    await t.pool.query(`UPDATE game.village_pair_changes SET last_change_at = now() - interval '2 days'`);
    assert.deepEqual(await s.kageAction(k4, 'paz', 'vila_3'), { ok: true }, 'o outro lado propõe a paz');
    const peace = (await s.villagePanel(k3, 'vila_3', true)).proposals.find((p) => p.kind === 'paz')!;
    assert.deepEqual(await s.kageAnswer(k3, peace.id, true), { ok: true, kind: 'paz' });
    assert.equal((await one(`SELECT game.village_relation('vila_3', 'vila_4') AS r`)).r, 'neutro');
    await t.pool.query(`UPDATE game.village_pair_changes SET last_change_at = now() - interval '2 days'`);
    await s.kageAction(k3, 'alianca', 'vila_5');
    const ally = (await s.villagePanel(k5, 'vila_5', true)).proposals[0]!;
    assert.ok(no(/não encontrada/)(await s.kageAnswer(k4, ally.id, true)), 'só a vila que recebeu responde');
    assert.deepEqual(await s.kageAnswer(k5, ally.id, true), { ok: true, kind: 'alianca' });
    assert.ok(no(/uma aliança/)(await s.kageAction(k4, 'alianca', 'vila_5')));
    assert.ok(no(/aliada/)(await s.kageAction(k3, 'guerra', 'vila_5')));
    // economia: Névoa aliada (−5%); com guerra também, +10%
    const buyer = await ninja('comprador', { village: 'vila_3' });
    await t.pool.query('UPDATE game.players SET ryo = 10000 WHERE id = $1', [buyer]);
    const ns = makeNinjaStore(t.db);
    const bought = await ns.buy(buyer, 'kunai', 1);
    assert.ok(bought.ok && bought.ryo === 10000 - 285 && bought.items.kunai === 1, '300 x 0,95');
    await t.pool.query(`UPDATE game.village_pair_changes SET last_change_at = now() - interval '2 days'`);
    await s.kageAction(k3, 'guerra', 'vila_4');
    assert.equal(Number((await one(`SELECT game.village_price_factor('vila_3') AS f`)).f).toFixed(3), '1.045');
    // trégua de todas: a guerra para e ninguém declara outra
    await t.pool.query(`SELECT game.admin_world_event($1, 'tregua', NULL, NULL, 2)`, [admin]);
    assert.equal((await one(`SELECT game.village_relation('vila_3', 'vila_4') AS r`)).r, 'tregua');
    await t.pool.query(`UPDATE game.village_pair_changes SET last_change_at = now() - interval '2 days'`);
    assert.ok(no(/trégua/)(await s.kageAction(k4, 'guerra', 'vila_5')));
    const pol = await s.politics();
    assert.ok(pol.events.some((e) => e.kind === 'tregua' && e.a === null));
    await t.pool.query(`UPDATE game.world_events SET starts_at = now() - interval '1 hour', ends_at = now() - interval '1 second'`);
    await assert.rejects(t.pool.query(`SELECT game.admin_world_event($1, 'guerra', 'vila_1', NULL, 2)`, [admin]), rule('ck_world_events_pair'));
  });

  it('renegado: banimento do Kage (justificativa, limite 5 por semana), denúncia por rank, e IRREVERSÍVEL sem admin', async () => {
    const s = store();
    const admin = await ninja('admin3', { admin: true });
    const kage = await ninja('kage_folha', { village: 'vila_1', rank: 'CHUNIN' });
    await t.pool.query('SELECT game.admin_set_kage($1, $2, $3)', [admin, 'vila_1', kage]);
    const bad = await ninja('baderneiro', { village: 'vila_1' });
    assert.ok(no(/justificativa/)(await s.exile(kage, 'baderneiro', 'curto')));
    assert.ok(no(/sua vila/)(await s.exile(kage, 'kage_nevoa', 'atacou a vila várias vezes')));
    assert.deepEqual(await s.exile(kage, 'baderneiro', 'atacou os aliados na zona'), { ok: true, targetId: bad, username: 'baderneiro' });
    const row = await one('SELECT village, renegade_from, renegade_at IS NOT NULL AS ren FROM game.players WHERE id = $1', [bad]);
    assert.deepEqual(row, { village: null, renegade_from: 'vila_1', ren: true });
    await assert.rejects(t.pool.query(`UPDATE game.players SET renegade_at = NULL, village = 'vila_1' WHERE id = $1`, [bad]), rule('rule_renegade_final'));
    assert.ok(no(/não tem vila/)(await s.chooseVillage(bad, 'vila_1')));
    // denúncia: rank igual ou maior
    const genin = await ninja('genin_x', { village: 'vila_1' });
    const chunin = await ninja('chunin_x', { village: 'vila_1', rank: 'CHUNIN' });
    assert.ok(no(/rank igual ou maior/)(await s.report(genin, 'chunin_x', 'roubou kunais da armaria')));
    assert.deepEqual(await s.report(chunin, 'genin_x', 'roubou kunais da armaria'), { ok: true });
    assert.ok(no(/denúncia aberta/)(await s.report(chunin, 'genin_x', 'de novo, roubou kunais')));
    const rep = (await s.villagePanel(kage, 'vila_1', true)).reports[0]!;
    assert.equal(rep.target, 'genin_x');
    assert.deepEqual(await s.decideReport(kage, rep.id, true), { ok: true, targetId: genin });
    // limite: 2 já foram (banimento + denúncia); mais 3 e o 6º recusa
    for (const n of ['exilado1', 'exilado2', 'exilado3']) {
      await ninja(n, { village: 'vila_1' });
      assert.equal((await s.exile(kage, n, 'motivo bem explicado aqui')).ok, true);
    }
    await ninja('exilado4', { village: 'vila_1' });
    assert.ok(no(/5 ninjas nesta semana/)(await s.exile(kage, 'exilado4', 'motivo bem explicado aqui')));
    // o admin desfaz (a única forma)
    await t.pool.query('SELECT game.admin_renegade($1, $2, false)', [admin, bad]);
    assert.deepEqual(await one('SELECT village, renegade_at FROM game.players WHERE id = $1', [bad]), { village: 'vila_1', renegade_at: null });
    // Kage que vira renegado perde o cargo
    await t.pool.query('SELECT game.admin_renegade($1, $2, true)', [admin, kage]);
    assert.equal((await one('SELECT game.kage_village_of($1) AS v', [kage])).v, null);
  });

  it('PvP: Elo global e da temporada; admin, nível muito diferente e a 4ª vez da mesma dupla no dia não contam', async () => {
    const s = store();
    await t.pool.query(`SELECT * FROM game.endgame_tick(now())`);     // abre a temporada 1
    const w = await ninja('lutador_a', { level: 30, village: 'vila_1' });
    const l = await ninja('lutador_b', { level: 30, village: 'vila_3' });
    const first = await s.pvpKill(w, l);
    assert.deepEqual([first.counted, first.winnerDelta, first.loserDelta, first.winnerMmr, first.loserMmr], [true, 16, -16, 1016, 984]);
    const season = (await s.politics()).season!;
    assert.deepEqual(await one('SELECT mmr, wins FROM game.pvp_season_ratings WHERE season_id = $1 AND player_id = $2', [season.id, w]), { mmr: 1016, wins: 1 });
    await s.pvpKill(w, l);
    await s.pvpKill(w, l);
    assert.equal((await s.pvpKill(w, l)).counted, false, 'a 4ª da mesma dupla no dia');
    const low = await ninja('fraco', { level: 5, village: 'vila_3' });
    assert.equal((await s.pvpKill(w, low)).counted, false, 'diferença de nível > 10');
    const adm = await ninja('admin4', { level: 30, admin: true });
    assert.equal((await s.pvpKill(adm, l)).counted, false, 'admin nunca entra no ranking');
    assert.equal((await s.pvpKill(l, adm)).counted, false);
    const r = await s.ranking(w, 10);
    assert.equal(r.top[0]!.username, 'lutador_a');
    assert.ok(!r.global.some((x) => x.username === 'admin4'));
    assert.equal(r.me.position, 1);
  });

  it('karma: o 20º ninja da própria vila derrotado na Zona vira renegado (sem aviso antes)', async () => {
    const s = store();
    const killer = await ninja('traidor', { level: 20, village: 'vila_5' });
    const victim = await ninja('vitima', { level: 20, village: 'vila_5' });
    for (let i = 1; i < 20; i++) assert.equal((await s.pvpKill(killer, victim)).becameRenegade, false);
    assert.equal((await s.pvpKill(killer, victim)).becameRenegade, true);
    assert.equal((await one('SELECT renegade_reason FROM game.players WHERE id = $1', [killer])).renegade_reason, 'karma: 20 ninjas da própria vila');
  });

  it('guerra dá espólio; renegado ganha recompensa pela cabeça e quem o caça leva metade (1 vez por dia por dupla)', async () => {
    const s = store();
    // espólio: Névoa x Nuvem em guerra (o teste da diplomacia declarou e a trégua já venceu)
    const a = await ninja('soldado_n', { level: 20, village: 'vila_3' });
    const b = await ninja('soldado_u', { level: 20, village: 'vila_4' });
    assert.equal((await s.pvpKill(a, b)).lootRyo, 25 + 2 * 20);
    // recompensa
    const admin = await ninja('admin5', { admin: true });
    const ren = await ninja('foragido', { level: 30, village: 'vila_1' });
    await t.pool.query('SELECT game.admin_renegade($1, $2, true)', [admin, ren]);
    const v1 = await ninja('aldeao1', { level: 30, village: 'vila_1' });
    const hunter = await ninja('cacador', { level: 30, village: 'vila_3' });
    assert.equal((await s.pvpKill(ren, v1)).winnerBounty, 50 + 5 * 30);
    assert.equal((await s.pvpKill(ren, v1)).winnerBounty, 200, 'mesma dupla no mesmo dia: não aumenta de novo');
    const before = Number((await one('SELECT ryo FROM game.players WHERE id = $1', [hunter])).ryo);
    const hunt = await s.pvpKill(hunter, ren);
    assert.deepEqual([hunt.bountyPaid, hunt.loserBounty], [100, 100]);
    assert.equal(Number((await one('SELECT ryo FROM game.players WHERE id = $1', [hunter])).ryo), before + 100);
    assert.equal((await s.pvpKill(hunter, ren)).bountyPaid, 0, 'a mesma dupla só cobra uma vez por dia');
  });

  it('temporada: fecha com títulos, ryō e o Manto do Campeão (10+ lutas, sem admin) e abre a próxima', async () => {
    const s = store();
    const champ = await ninja('campeao', { level: 40, village: 'vila_1' });
    const foes = await Promise.all(Array.from({ length: 4 }, (_, i) => ninja(`rival${i}`, { level: 40, village: 'vila_3' })));
    for (const f of foes) for (let i = 0; i < 3; i++) await s.pvpKill(champ, f);
    const admin = await ninja('admin6', { admin: true });
    const season = (await s.politics()).season!.id;
    const ryo0 = Number((await one('SELECT ryo FROM game.players WHERE id = $1', [champ])).ryo);
    assert.equal((await one('SELECT game.admin_close_season($1) AS s', [admin])).s, season);
    assert.equal(Number((await one('SELECT ryo FROM game.players WHERE id = $1', [champ])).ryo), ryo0 + 5000);
    assert.equal((await one(`SELECT t.name FROM game.player_titles pt JOIN game.titles t ON t.id = pt.title_id WHERE pt.player_id = $1 AND t.code LIKE 'SEASON_%'`, [champ])).name,
      `Campeão da Temporada ${season}`);
    assert.equal((await one(`SELECT quantity FROM game.player_items WHERE player_id = $1 AND item_code = 'manto_campeao'`, [champ])).quantity, 1);
    assert.equal((await s.politics()).season!.id, season + 1);
    assert.equal(((await s.ranking(champ, 10)).top).length, 0, 'temporada nova: começa vazia');
    assert.equal((await one('SELECT count(*)::int AS n FROM game.pvp_season_rewards WHERE player_id = $1', [admin])).n, 0);
  });

  it('Akatsuki: líder pelo admin, convites só do líder, aceitar vira renegado, 10 vagas e não mais', async () => {
    const s = store();
    const admin = await ninja('admin7', { admin: true });
    const leader = await ninja('lider', { level: 50, village: 'vila_1' });
    await t.pool.query('SELECT game.admin_akatsuki_leader($1, $2)', [admin, leader]);
    assert.equal((await one('SELECT renegade_at IS NOT NULL AS r FROM game.players WHERE id = $1', [leader])).r, true);
    const member = await ninja('membro', { level: 45, village: 'vila_3' });
    const weak = await ninja('fraquinho', { level: 20, village: 'vila_3' });
    assert.ok(no(/nível 40/)(await s.akatsukiInvite(leader, 'fraquinho', 2)));
    assert.ok(no(/Só o líder/)(await s.akatsukiInvite(member, 'fraquinho', 2)));
    assert.deepEqual(await s.akatsukiInvite(leader, 'membro', 2), { ok: true, targetId: member, username: 'membro' });
    assert.deepEqual(await s.akatsukiInviteOf(member).then((i) => i && [i.slot, i.from]), [2, 'lider']);
    assert.deepEqual(await s.akatsukiAccept(member), { ok: true, slot: 2 });
    assert.equal((await one('SELECT village FROM game.players WHERE id = $1', [member])).village, null, 'aceitar transforma em renegado');
    assert.ok(no(/ocupada/)(await s.akatsukiInvite(leader, 'membro', 2)));
    await assert.rejects(t.pool.query('INSERT INTO game.akatsuki_members (slot, player_id) VALUES (11, $1)', [weak]), /akatsuki_members_slot_check/);
    // caça de Kage: membro derrota o Kage da Névoa
    const kage = (await s.politics()).kages.find((k) => k.village === 'vila_3')!;
    await t.pool.query('UPDATE game.players SET level = 45 WHERE id = $1', [kage.playerId]).catch(() => undefined);
    const hunt = await s.pvpKill(member, kage.playerId);
    assert.equal(hunt.kageHunted, 'vila_3');
    assert.equal((await one(`SELECT count(*)::int AS n FROM game.player_titles pt JOIN game.titles t ON t.id = pt.title_id WHERE pt.player_id = $1 AND t.code = 'KAGE_HUNTER'`, [member])).n, 1);
    assert.deepEqual(await s.akatsukiExpel(leader, 'membro'), { ok: true, targetId: member, username: 'membro' });
    assert.equal((await s.politics()).akatsuki.length, 1);
  });

  it('capas: só as que tem; o Manto do Kage só para o Kage; o que mostrar no boneco', async () => {
    const s = store();
    const p = await ninja('estiloso', { village: 'vila_1' });
    assert.ok(no(/não tem essa capa/)(await s.equipCape(p, 'capa_viagem')));
    await t.pool.query(`INSERT INTO game.player_items (player_id, item_code, quantity) VALUES ($1, 'capa_viagem', 1)`, [p]);
    assert.deepEqual(await s.equipCape(p, 'capa_viagem'), { ok: true, cape: 'capa_viagem' });
    assert.ok(no(/não tem essa capa/)(await s.equipCape(p, 'manto_kage')));
    await s.setDisplay(p, { cape: false, weapon: true, scroll: false });
    const me = await s.player(p);
    assert.deepEqual([me!.cape, me!.display], ['capa_viagem', { cape: false, weapon: true, scroll: false }]);
    await assert.rejects(t.pool.query(`UPDATE game.players SET display = '{"cape": 1}'::jsonb WHERE id = $1`, [p]), rule('ck_players_display'));
  });

  it('Posto de Viagem: só para vila aliada, 50 ryō (o mesmo da config), sem ryō não viaja', async () => {
    const s = store();
    const p = await ninja('viajante', { village: 'vila_3' });
    await t.pool.query(`UPDATE game.players SET ryo = 70 WHERE id = $1`, [p]);
    assert.ok(no(/vila aliada/)(await s.payTravel(p, 'vila_4')));
    await t.pool.query(`DELETE FROM game.village_relations WHERE village_a = 'vila_3' OR village_b = 'vila_3'`);
    await t.pool.query(`DELETE FROM game.village_relations WHERE village_a = 'vila_4' OR village_b = 'vila_4'`);
    await t.pool.query(`INSERT INTO game.village_relations (village_a, village_b, state, declared_by) VALUES ('vila_3', 'vila_4', 'alianca', 'vila_3')`);
    assert.deepEqual(await s.payTravel(p, 'vila_4'), { ok: true, ryo: 70 - REALTIME.endgame.allyTravelRyo });
    assert.ok(no(/Ryō insuficiente/)(await s.payTravel(p, 'vila_4')));
    await t.pool.query(`DELETE FROM game.village_relations WHERE village_a = 'vila_3'`);
  });

  it('catálogo: as capas de items.ts são as mesmas do banco', async () => {
    const capes = (await t.pool.query(`SELECT code, name, price_ryo, shop FROM game.items WHERE kind = 'cape' ORDER BY code`)).rows;
    assert.deepEqual(capes, ITEMS.filter((i) => i.kind === 'cape').map((i) => ({ code: i.code, name: i.name, price_ryo: i.price, shop: i.shop }))
      .sort((a, b) => (a.code < b.code ? -1 : 1)));
  });

  it('comandos de admin do fim de jogo pelo AdminStore: auditados, e recusa vira texto', async () => {
    const admin = makeAdminStore(t.db);
    const boss = await ninja('chefao', { admin: true });
    const alvo = await ninja('alvoadm', { village: 'vila_1' });
    const cmd = (text: string) => {
      const r = parseAdminCommand(text, ['slime']);
      assert.ok(r.ok, text);
      return r.command as EndgameAdminCommand;
    };
    assert.deepEqual(await admin.endgame!(boss, cmd('/admin vila alvoadm areia'), alvo), { ok: true, result: '' });
    assert.equal((await one('SELECT village FROM game.players WHERE id = $1', [alvo])).village, 'vila_5');
    assert.equal((await admin.endgame!(boss, cmd('/admin renegado alvoadm on'), alvo)).ok, true);
    assert.equal((await one('SELECT village FROM game.players WHERE id = $1', [alvo])).village, null);
    const again = await admin.endgame!(boss, cmd('/admin renegado alvoadm on'), alvo);
    assert.equal(again.ok, false);
    assert.equal((await admin.endgame!(boss, cmd('/admin renegado alvoadm off'), alvo)).ok, true);
    assert.equal((await one('SELECT village FROM game.players WHERE id = $1', [alvo])).village, 'vila_5', 'volta para a vila de antes');
    assert.equal((await admin.endgame!(boss, cmd('/admin evento tregua todas 2'), null)).ok, true);
    const notBoss = await admin.endgame!(alvo, cmd('/admin endgame pvp off'), null);
    assert.equal(notBoss.ok, false);
    const audit = (await t.pool.query(`SELECT command, ok FROM game.admin_audit_log WHERE admin_id = $1 ORDER BY id`, [boss])).rows;
    assert.deepEqual(audit.map((r) => `${r.command}:${r.ok}`), ['vila:true', 'renegado:true', 'renegado:false', 'renegado:true', 'evento:true']);
    await t.pool.query(`DELETE FROM game.world_events`);
  });

  it('sem a v11, o servidor sabe (available = false)', async () => {
    // Sem a v11 e sem a v13 (que limpa tabelas da v11).
    const old = await createTestDatabase(MIGRATIONS.filter((f) => f !== 'schema_v11_endgame.sql' && f !== 'schema_v27_temporadas.sql' && f !== 'schema_v28_fase_final.sql' && f !== 'schema_v13_sem_pedra.sql' && f !== 'schema_v17_nomes.sql'));
    try {
      assert.equal(await makeEndgameStore(old.db).available(), false);
    } finally {
      await old.drop();
    }
  });

  it('a migração segue as regras do SQL Editor do Neon (sem DO $$, numa transação só)', () => {
    assert.doesNotMatch(V11, /\bDO\s+\$\$/);
    assert.match(V11, /^BEGIN;$/m);
    assert.match(V11, /^COMMIT;$/m);
  });
});
