import type { DayPhase, SkyEffects, Weather } from './weather.js';
import type { EffectCode } from './effects.js';
import type { PvpClassRow, PvpReport } from './pvpStats.js';
import { z } from 'zod';
import { ATTRIBUTES, type Attributes, type DerivedStats } from './stats.js';
import type { MapId, MapLayout, ShopKind } from './maps.js';
import { CLANS, type Clan } from './jutsusClasses.js';
import { MANUAL_CHAPTERS, type ManualChapter } from './manual.js';
import type { FeedbackRow } from './admin.js';

/** v43: uma linha de grupo e um jogo da chave da Fase Final (nomes, nunca ids). */
export interface FinalGroupRowView { position: number; username: string; wins: number; losses: number; roundsFor: number; roundsAgainst: number; pending: number; advanced: boolean; me?: boolean }
export interface FinalBracketView { round: number; slot: number; a: string | null; b: string | null; winner: 'a' | 'b' | null; aRounds: number; bRounds: number; bye?: boolean; mine?: boolean }

/** v42: uma linha do placar do Torneio da Temporada (position null = ainda não fez as 15 partidas). */
export interface JouninRowView { position: number | null; username: string; points: number; wins: number; losses: number; finalist: boolean }

/** v38: as categorias do Feedback (Menu > Enviar Feedback). */
export const FEEDBACK_CATEGORIES = ['bug', 'sugestao', 'balanceamento', 'outro'] as const;
import { CLASSES, JUTSUS, JUTSU_CODES, type ClassCode, type JutsuCode, type JutsuForm, type MasteryGain, type Mechanic } from './jutsus.js';
import { ITEM_CODES, type Gear, type ItemDef } from './items.js';
import { IncomingAppearanceSchema, VILLAGES, type Appearance, type Village } from './appearance.js';
import type { EndgameModule } from './endgame.js';
import type { Display, RankRow, VillagePanel } from './endgameStore.js';
import type { RelationRow, WorldEvent } from './villages.js';
import type { PowerKind } from './akatsuki.js';

/*
 * Protocolo do WebSocket: JSON simples, um objeto por mensagem, sempre com `type`.
 *
 * Cliente -> servidor (o cliente só PEDE; dano, acerto, morte e XP são decididos no servidor)
 *   { "type": "input", "seq": 41, "inputs": [[1, 0], [1, 0]] }   joystick com PREDIÇÃO: cada par é 1 tick
 *                                               (50 ms) de direção; seq = número da 1ª entrada
 *   { "type": "move", "dx": 0.5, "dy": -0.5 }   direção "segurada" (teste manual/Hoppscotch; 0,0 = parar)
 *   { "type": "cast", "skill": "fire", "targetId": "m12" }   habilidade; targetId (opcional) = alvo focado
 *   { "type": "meditate", "active": true }      começar/parar de meditar (chakra 3x mais rápido)
 *   { "type": "respawn" }                       renascer (só depois de 5 s morto)
 *   { "type": "talk", "npcId": "sensei" }       falar com o NPC Mestre (precisa estar perto)
 *   { "type": "missions" }                      pedir a missão atual (abrir a Sala de Missões)
 *   { "type": "attack", "targetId": "m12" }     ataque básico (sem chakra); targetId opcional
 *   { "type": "run", "active": true }           correr (8) ou andar (5); o servidor aplica
 *   { "type": "switch_kit", "kit": "B" }        trocar de kit (só vale depois que o servidor confirma)
 *   { "type": "set_loadout", "kitA": [..], "kitB": [..] }   até 4 habilidades por kit
 *   { "type": "spend_point", "attribute": "vitality" }      gastar 1 ponto de atributo
 *   { "type": "reset_attributes" }              redefinir os atributos (custa ryō; o custo é do servidor)
 *   { "type": "set_appearance", "appearance": { v: 2, gender, skin, hairStyle, hairColor, eyeStyle, eyeColor,
 *                                               outfit, shirtColor, pantsColor, bandana, village } }   nomes de paleta
 *                                               (appearance.ts); o formato antigo de 5 cores ainda é aceito e convertido
 *   { "type": "create_mission", "traineeId", "difficulty", "quantity" }   sensei (Chunin+) cria missão
 *   { "type": "deliver_mission", "senseiId" }   aprendiz entrega a missão ao sensei (perto dele)
 *   { "type": "evaluate_mission", "missionId", "approved", "score" }      sensei avalia
 *   { "type": "choose_class", "class": "fire" } classe Primária (Missão de Genin) ou Secundária (Chunin 40)
 *   { "type": "extract", "class": "fire", "level": 2 }   Extração na Casa dos Pergaminhos (gacha)
 *   { "type": "buy", "item": "kunai", "qty": 1 }  compra (perto do lojista que vende; preço do banco)
 *   { "type": "equip", "item": "kunai" }         equipar arma do inventário (null = desequipar)
 *   { "type": "equip", "item": "scroll_fire", "slot": "scroll" }   pergaminho nas costas (item null = tirar)
 *   { "type": "kage_apply" }                     candidatura a Kage (nível 60, com o Diretor)
 *   { "type": "accept_mission", "offer": "NPC_EASY" }   escolher um cartão da Sala de Missões (perto do Mestre)
 *   { "type": "deliver_npc_mission" }            botão "Entregar" da Sala de Missões (perto do Mestre)
 *   { "type": "chat_history" }                   pedir o histórico do chat (últimas 100, 24 h)
 *   { "type": "sync", "id": 12 }                 resposta na hora ao "sync" do servidor (ele mede o ping)
 *   { "type": "client_error", "message": "...", "source": "game.js", "line": 120 }   erro no navegador (vira bug
 *                                                no painel do site; sem resposta)
 *   { "type": "chat", "message": "Olá!" }        fala local (o mapa); "/g texto" = global; "/w Nome texto" = sussurro;
 *                                               "/admin ..." = comandos do administrador (nunca vira chat)
 *
 * Fim de jogo (v16, docs/endgame.md; só valem com o módulo ligado, e o BANCO confere cada regra de novo):
 *   { "type": "village_panel" }                  painel da vila (eleição, diplomacia, denúncias para o Kage)
 *   { "type": "kage_vote", "candidate": uuid }   voto na eleição da própria vila
 *   { "type": "kage_action", "action": "guerra", "village": "vila_3" }   guerra, fim_guerra, alianca, paz, romper
 *   { "type": "kage_answer", "proposal": 3, "accept": true }   responder proposta de aliança ou de paz
 *   { "type": "kage_exile", "name": "Fulano", "reason": ".." }   Kage expulsa da vila (vira renegado)
 *   { "type": "report_player", "name": "Fulano", "reason": ".." }   denúncia (rank igual ou maior)
 *   { "type": "kage_report", "report": 7, "approve": false }   Kage decide a denúncia
 *   { "type": "travel", "to": "vila_nevoa" }     Posto de Viagem (perto dele): para onde ir
 *   { "type": "ranking" }                        ranking PvP (temporada e global)
 *   { "type": "akatsuki_invite", "name": "Fulano", "slot": 4 }   o líder convida
 *   { "type": "akatsuki_answer", "accept": true } aceitar (vira renegado, irreversível) ou recusar
 *   { "type": "akatsuki_expel", "name": "Fulano" } o líder expulsa; { "type": "akatsuki_leave" } sair
 *   { "type": "power", "targetId": "..", "dir": [1, 0] }   poder da vaga na Akatsuki
 *   { "type": "equip", "item": "capa_viagem", "slot": "cape" }   capa (item null = tirar)
 *   { "type": "equip", "item": "botas_viagem", "slot": "feet" }   sapato (item null = descalço)
 *   { "type": "set_display", "cape": true, "weapon": false, "scroll": true }   o que os outros veem no boneco
 *
 * Servidor -> cliente
 *   welcome           { you, players, monsters, world }    ao conectar (players = os OUTROS do MESMO mapa;
 *                                                          world.map = mapa atual, world.maps = todos os layouts)
 *   map_changed       { map, x, y, a, players, monsters, reason }   o próprio jogador trocou de mapa
 *                                                          (borda ou renascer): só o que há no mapa novo
 *   player_joined / player_left                            alguém entrou/saiu DESTE mapa (ou do jogo)
 *   shop_open         { shop, npcId }                      falou com o lojista (perto dele, dentro da loja)
 *
 * Tudo que é de posição, combate e chat vai só para quem está no MESMO mapa (economiza banda e
 * ninguém vê monstro do outro lado do mundo). `announce` vai para todos.
 *   player_moved      { playerId, x, y, d, a }             d = direção (0 baixo, 1 esquerda, 2 direita, 3 cima);
 *                                                          a = última entrada aplicada (o dono reconcilia)
 *   player_appearance { playerId, appearance }             visual novo (sprites: nomes de paleta, appearance.ts)
 *   stats             { hp, maxHp, chakra, maxChakra, shield }   só para o próprio jogador
 *   player_hp         { playerId, hp, maxHp }              vida dos outros (barrinha sobre o boneco)
 *   cast              { playerId, skill, x, y, fx, fy, tx?, ty? }   habilidade aceita (todos veem a animação);
 *                                                          tx, ty = onde o efeito acontece (fim da linha do
 *                                                          Relâmpago/Sombra, golpe do Taijutsu, quem a Cura pegou)
 *   cast_failed       { skill, reason }                    só para quem tentou (SAFE_ZONE = na praça segura)
 *   projectile        { id, playerId, skill | weapon, x, y, fx, fy, speed, range }   Fogo/Kunai (skill) ou a
 *                                                          Shuriken Gigante (weapon) saiu voando (o servidor
 *                                                          anda com ele a cada tick e decide a colisão)
 *   impact            { id, skill | weapon, x, y, r }      o projétil bateu (alvo, parede ou fim do alcance);
 *                                                          r = raio da explosão (0 = sem área)
 *   dash              { playerId, fromX, fromY, x, y, a }  avanço do Taijutsu (o servidor moveu o jogador)
 *   player_status     { playerId, status, ms }             jogador atordoado / preso (PvP)
 *   meditation        { playerId, active, reason? }        entrou/saiu da meditação (todos veem a aura)
 *   hit               { target, id, amount, kind, hp, maxHp, shielded? }   número flutuante
 *   monsters_moved    { m: [[id, x, y], ...] }
 *   monster_spawned   { monster }
 *   monster_status    { id, status, ms }                   atordoado / preso
 *   monster_died      { id, killerId }
 *   player_died       { playerId, respawnInMs }
 *   player_respawned  { playerId, x, y, hp, maxHp }
 *   xp                { gained, totalXp, rank, promoted }  só para quem matou (depois de gravar no banco)
 *   announce          { message }                          para todos (ex.: subiu para Genin)
 *   mission           { mission, reason }                  missão atual (null = nenhuma), só para o dono
 *   npc_say           { npcId, text }                      fala do NPC, só para quem conversou
 *   mission_reward    { rewards, totalXp, rank, promoted } pergaminho entregue (já gravado no banco)
 *   progress          { level, xpInLevel, xpToNext, statPoints, attributes, derived }   ficha (só o dono)
 *   kit               { active, kits }                     kit ativo e loadout (só o dono)
 *   attack / attack_failed                                 ataque básico (todos veem a animação): cd = recarga
 *                                                          (ms); throw = a arma lançada (Shuriken Gigante)
 *   evaluation_request { missionId, trainee, mission }     para o sensei: aprendiz entregou
 *   sensei_options    { difficulties, quantities }         opções de missão (só para Chunin+)
 *   notice            { text, tone }                       aviso curto na tela (só para um jogador)
 *   tutorial          { step }                             passo do tutorial da Academia (0 a 4; 4 = concluído)
 *   inventory         { ryo, items, equipped }             ryō, itens e arma equipada (só o dono)
 *   classes           { primary, secondary }               classes do jogador
 *   jutsus            { jutsus }                           jutsus aprendidos e o uso de cada um (nível = uso)
 *   jutsu_level       { skill, level }                     um jutsu subiu de nível pelo uso
 *   class_choice      { kind, classes }                    o Diretor abriu a escolha de classe
 *   extract_result    { class, level, outcome, jutsu, consumed, scrollsLeft }   resultado da Extração
 *   teleport          { playerId, fromX, fromY, x, y, a }  Teleporte Curto (a = ack, para o dono reconciliar)
 *   substitution      { playerId, logX, logY, x, y, a }    Substituição: tronco no lugar, ninja atrás do atacante
 *   player_gear       { playerId, gear }                   arma na mão / nas costas e pergaminho nas costas (todos veem)
 *   pushed            { playerId, fromX, fromY, x, y, a }  a Água empurrou o ninja (o dono dele refaz a predição dali)
 *   sync              { id, rtt }                          a cada 2 s: o cliente devolve o id na hora; rtt = o ping medido (ms)
 *   monster_aggro     { id, targetId }                     o monstro notou alguém e persegue (null = desistiu)
 *   effect            { target, id, effect, ms }           efeito com tempo (effects.ts) começou ou renovou; ms 0 = acabou
 *   combo             { target, id, combo }                combo de elementos (Água molha + Relâmpago = eletrocutado)
 *   telegraph         { id, x, y, r, ms }                  golpe marcado: círculo no chão, cai em ms (ms 0 = interrompido)
 *   monster_slam      { id, kind, x, y, r }                o golpe marcado caiu (slam: pulou ali; crush: o Esmagar do chefe)
 *   boss_phase        { id, phase, text }                  o chefe passou de fase (filhos, fúria): aviso grande na tela
 *   mission_board     { npcId, offers, mission }           Sala de Missões: cartões do Mestre e a missão atual
 *   chat_history      { messages }                         histórico do chat (só para quem pediu)
 *   chat / error                                           como antes
 *
 * Fim de jogo (v16):
 *   endgame           { modules, villages, kages, relations, events, akatsuki, season }   estado político (todos)
 *   player_faction    { playerId, faction }                vila, renegado, Kage, Akatsuki, recompensa, capa de alguém
 *   village_panel     { panel, ... }                       painel da vila (só para quem pediu)
 *   travel_options    { npcId, options }                   destinos do Posto de Viagem
 *   ranking           { season, top, global, me }          ranking PvP
 *   pvp_result        { winner, loser, winnerDelta, ... }  alguém venceu na Zona de Conflito (o mapa vê)
 *   akatsuki_invite   { from, slot, power, expiresAt }     convite do líder
 *   power             { playerId, power, x, y, fx, fy, tx?, ty? }   poder da Akatsuki aceito (animação)
 *   power_failed      { reason }
 */

/** Direção de -1 a 1 em cada eixo; vetor maior que 1 (diagonal) é normalizado pelo servidor. */
const axis = z.number().finite().min(-1).max(1);

/** Todos os jutsus (catálogo em jutsus.ts): 2 da Academia + 9 classes x 4 tiers. */
export const SKILLS = JUTSU_CODES;
export type Skill = JutsuCode;

/**
 * Mecânicas que miram no alvo focado. Taijutsu é sempre no mais perto; Ilusão é um círculo em volta
 * do jogador; Pedra é em si mesmo; a Cura aceita um ALIADO focado (id de jogador).
 */
export const DIRECTED_MECHANICS: ReadonlySet<Mechanic> = new Set<Mechanic>(['fire', 'water', 'shadow', 'lightning', 'weapons', 'wind']);
export const DIRECTED_SKILLS: ReadonlySet<Skill> = new Set<Skill>(JUTSUS.filter((j) => DIRECTED_MECHANICS.has(j.mechanic)).map((j) => j.code));

/**
 * Habilidades EM LINHA (seguem um caminho até bater no alvo): só saem nas 4 direções. O jogador escolhe a direção
 * segurando e arrastando o botão (o `dir` do cast vira a cardinal mais perto); num toque rápido, o servidor escolhe a
 * direção que passa mais perto do alvo focado (ou do inimigo mais perto no alcance).
 */
export const LINE_MECHANICS: ReadonlySet<Mechanic> = new Set<Mechanic>(['fire', 'shadow', 'lightning', 'weapons', 'wind']);

/**
 * v37: a mira (segurar e arrastar o botão) vale pela FORMA do jutsu, não pela classe:
 *  - 'line': sai numa direção (linha, projétil, leque, avanço, salto, muro...); a prévia é o caminho;
 *  - 'cone': o cone na frente; a prévia é o leque;
 *  - 'area': uma área lançada a distância (zona, aviso, impacto); cai no primeiro inimigo na direção ou no fim do alcance.
 * Sem mira: o que sai em volta de si, no próprio corpo ou travado num alvo (escudo, buff, cura, zona em si, "alvo", "marca").
 */
export type AimShape = 'line' | 'cone' | 'area';
const AIM_BY_FORM: Partial<Record<JutsuForm, AimShape>> = {
  linha: 'line', linha_prende: 'line', linha_raio: 'line', linha_explode: 'line', projetil: 'line', trilhas: 'line', leque: 'line',
  ricochete: 'line', agarre: 'line', faixa: 'line', investida: 'line', avanco: 'line', bumerangue: 'line', muro: 'line', recuo: 'line',
  cone: 'cone', cone_golpe: 'cone',
  impacto: 'area', zona: 'area', aviso: 'area',
};
export function aimShapeOf(form: JutsuForm, cfg: { zone?: { self?: boolean } | undefined; range?: number | undefined }): AimShape | undefined {
  const shape = AIM_BY_FORM[form];
  if (shape === 'area' && form === 'zona' && (cfg.zone?.self || !(cfg.range && cfg.range > 0))) return undefined;   // zona em volta de si
  return shape;
}

/** Id de monstro como o servidor cria ("m" + número). */
const monsterId = z.string().regex(/^m\d{1,9}$/);
const uuid = z.string().uuid();
/** Alvo focado: um monstro ou um jogador (aliado para a Cura; inimigo com o PvP ligado). */
const targetId = z.union([monsterId, uuid]);
/** Visual do personagem (v9: sprites em camadas): nomes de paleta, ver appearance.ts. */
export { AppearanceSchema, type Appearance } from './appearance.js';

/** Direção do boneco: 0 baixo, 1 esquerda, 2 direita, 3 cima. */
export type Dir = 0 | 1 | 2 | 3;
const skillList = z.array(z.enum(SKILLS)).max(4).refine((l) => new Set(l).size === l.length, 'habilidade repetida no kit');

/** Ações do Kage no painel (as regras de cada uma estão no banco, game.kage_*). */
export const KAGE_ACTIONS = ['guerra', 'fim_guerra', 'alianca', 'paz', 'romper'] as const;
const username = z.string().regex(/^[A-Za-z0-9_]{3,24}$/);
/** Justificativa (banimento, denúncia): o banco confere o tamanho (10 a 300) e mostra ao Kage. */
const reason = z.string().max(300);

/** v29: um lado da partida do rankeado, como aparece na tela (o nome só aparece na preparação). */
/** v29: uma linha do ranking do rankeado. */
export interface RankedRowView { position: number; playerId: string; username: string; village: string | null; level: number; mmr: number; wins: number; losses: number }
/** v29: tipos de zona no chão; 'aviso' = o círculo vermelho do golpe que vai cair. */
export type GroundKind = 'fogo' | 'lama' | 'cura' | 'aviso' | 'agua' | 'sombra' | 'ilusao' | 'armas';

export interface DuelSideView { id: string; name: string; level: number; village: string | null }

export type KitName = 'A' | 'B';
export type Kits = Record<KitName, Skill[]>;

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), dx: axis, dy: axis }),
  z.object({ type: z.literal('input'), seq: z.number().int().min(1).max(2_000_000_000), inputs: z.array(z.tuple([axis, axis])).min(1).max(10) }),
  // dir: para onde o Teleporte Curto vai (o joystick do jogador) e a direção escolhida das habilidades em linha (vira
  // cima, baixo, esquerda ou direita); o ALCANCE é sempre do servidor.
  z.object({ type: z.literal('cast'), skill: z.enum(SKILLS), targetId: targetId.optional(), dir: z.tuple([axis, axis]).optional() }),
  z.object({ type: z.literal('meditate'), active: z.boolean() }),
  // v29: modo rankeado: entrar no Arena das Quatro Heranças, sair dele, entrar na fila do Desafio e sair da fila.
  z.object({ type: z.literal('ranked'), action: z.enum(['enter', 'leave', 'queue', 'unqueue', 'board', 'sit', 'stand', 'jounin_queue', 'jounin_unqueue', 'jounin_board', 'final_queue', 'final_unqueue', 'final_board']) }),
  z.object({ type: z.literal('respawn') }),
  z.object({ type: z.literal('talk'), npcId: z.string().regex(/^[a-z][a-z_]{0,23}$/) }),
  z.object({ type: z.literal('missions') }),
  z.object({ type: z.literal('attack'), targetId: targetId.optional() }),
  z.object({ type: z.literal('run'), active: z.boolean() }),
  z.object({ type: z.literal('switch_kit'), kit: z.enum(['A', 'B']) }),
  z.object({ type: z.literal('set_loadout'), kitA: skillList, kitB: skillList }),
  z.object({ type: z.literal('spend_point'), attribute: z.enum(ATTRIBUTES) }),
  z.object({ type: z.literal('set_appearance'), appearance: IncomingAppearanceSchema }),
  z.object({ type: z.literal('create_mission'), traineeId: uuid, difficulty: z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/), quantity: z.number().int() }),
  z.object({ type: z.literal('deliver_mission'), senseiId: uuid }),
  z.object({ type: z.literal('evaluate_mission'), missionId: uuid, approved: z.boolean(), score: z.number().int().min(1).max(5) }),
  z.object({ type: z.literal('choose_class'), class: z.enum(CLASSES) }),
  // v30: o despertar da linhagem (Clã Rubro, Clã Umbra ou Andarilho)
  z.object({ type: z.literal('clan'), clan: z.enum(CLANS) }),
  z.object({ type: z.literal('extract'), class: z.enum(CLASSES), level: z.number().int().min(1).max(4) }),
  z.object({ type: z.literal('buy'), item: z.enum(ITEM_CODES), qty: z.number().int().min(1).max(99) }),
  z.object({ type: z.literal('equip'), item: z.enum(ITEM_CODES).nullable(), slot: z.enum(['weapon', 'scroll', 'cape', 'feet', 'body']).optional() }),
  z.object({ type: z.literal('kage_apply') }),
  z.object({ type: z.literal('hokage_apply') }),   // nome antigo (cliente em cache, até a v15)
  z.object({ type: z.literal('reset_attributes') }),
  z.object({ type: z.literal('accept_mission'), offer: z.string().regex(/^NPC_[A-Z]{1,24}$/) }),
  z.object({ type: z.literal('deliver_npc_mission') }),
  z.object({ type: z.literal('chat_history') }),
  z.object({ type: z.literal('sync'), id: z.number().int().nonnegative().max(2 ** 31) }),
  z.object({ type: z.literal('chat'), message: z.string() }),
  // Painel do admin (v19): o comando sem o "/admin" na frente ("ryo Kaito 500") e o catálogo (online, monstros, mapas).
  z.object({ type: z.literal('admin'), command: z.string().min(1).max(200) }),
  z.object({ type: z.literal('admin_catalog') }),
  // v38: Pergaminho do Mestre (fechou um capítulo), Feedback do jogador e a aba Feedback do admin
  z.object({ type: z.literal('manual_read'), chapter: z.enum(MANUAL_CHAPTERS) }),
  z.object({
    type: z.literal('feedback'), category: z.enum(FEEDBACK_CATEGORIES), content: z.string().max(1500),
    screen: z.record(z.string().max(24), z.union([z.string().max(60), z.number().finite()])).refine((o) => Object.keys(o).length <= 10).optional(),
  }),
  z.object({ type: z.literal('admin_feedback'), action: z.enum(['list', 'resolve']), id: z.number().int().positive().optional() }),
  // Erro no navegador (v20): vira "bug" no painel do admin do site. Texto curto; o servidor tira segredos antes de mandar.
  z.object({
    type: z.literal('client_error'), message: z.string().min(1).max(300), source: z.string().max(200).optional(),
    line: z.number().int().min(0).max(10_000_000).optional(), stack: z.string().max(1500).optional(),
  }),
  // ------------------------------------------------ fim de jogo (v16)
  z.object({ type: z.literal('village_panel') }),
  z.object({ type: z.literal('kage_vote'), candidate: uuid }),
  z.object({ type: z.literal('kage_action'), action: z.enum(KAGE_ACTIONS), village: z.enum(VILLAGES) }),
  z.object({ type: z.literal('kage_answer'), proposal: z.number().int().min(1), accept: z.boolean() }),
  z.object({ type: z.literal('kage_exile'), name: username, reason }),
  z.object({ type: z.literal('report_player'), name: username, reason }),
  z.object({ type: z.literal('kage_report'), report: z.number().int().min(1), approve: z.boolean() }),
  z.object({ type: z.literal('travel'), to: z.string().regex(/^[a-z][a-z0-9_]{0,23}$/) }),
  z.object({ type: z.literal('ranking') }),
  z.object({ type: z.literal('akatsuki_invite'), name: username, slot: z.number().int().min(2).max(10) }),
  z.object({ type: z.literal('akatsuki_answer'), accept: z.boolean() }),
  z.object({ type: z.literal('akatsuki_expel'), name: username }),
  z.object({ type: z.literal('akatsuki_leave') }),
  z.object({ type: z.literal('power'), targetId: targetId.optional(), dir: z.tuple([axis, axis]).optional() }),
  z.object({ type: z.literal('set_display'), cape: z.boolean(), weapon: z.boolean(), scroll: z.boolean() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface RankView {
  code: string;
  name: string;
}

export interface PlayerView {
  id: string;
  username: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  meditating: boolean;
  /** v29: sentado na arquibancada do Vale. */
  sitting?: boolean;
  rank: RankView;
  level: number;
  /** Cores do boneco (padrão se o jogador ainda não criou o personagem). */
  appearance: Appearance;
  dir: Dir;
  /** Equipamento visível no boneco (arma na mão ou nas costas, pergaminho nas costas). */
  gear: Gear;
  /** Fim de jogo (só com o módulo de vilas ligado): vila, renegado, Kage, Akatsuki, recompensa e capa. */
  faction?: FactionView;
  /** Efeitos valendo (effects.ts): código -> ms que faltam. */
  fx?: Partial<Record<EffectCode, number>>;
  /** v35: linhagem despertada e o tier (o visual: olho do Rubro, névoa do Umbra, faixa do Andarilho). */
  lineage?: LineageView;
}

/** v35: a linhagem como todos veem. */
export interface LineageView { clan: Clan; tier: number }

/** O lado de um ninja na política, como todos veem (o banco é a autoridade; o servidor manda). */
export interface FactionView {
  /** null = renegado (sem vila). */
  village: Village | null;
  /** Renegado: a vila de onde saiu (a bandana aparece riscada). */
  renegadeFrom?: Village;
  /** Kage desta vila. */
  kage?: Village;
  /** Vaga na Akatsuki (1 = líder). */
  akatsuki?: number;
  /** Recompensa pela cabeça (renegado), em ryō. */
  bounty?: number;
  /** Capa no boneco (null/ausente = sem capa ou escondida). */
  cape?: string;
}

export interface SelfView extends PlayerView {
  chakra: number;
  maxChakra: number;
  shield: boolean;
  xp: number;
  speed: number;
  running: boolean;
  /** Rank permite ser sensei (Chunin+): o cliente mostra "Criar Missão". O banco confere de novo. */
  canBeSensei: boolean;
  /** false = ainda não passou pelo Criador de Personagem (o cliente abre a tela de criação). */
  appearanceSet: boolean;
  /** Dentro de uma sala compartilhada (loja, Academia): para onde a porta de saída leva (a predição usa). */
  doorBack?: { map: string; x: number; y: number };
}

/** Ficha do jogador: nível, XP do nível (zera a cada nível), pontos e o que os atributos dão. */
export interface ProgressView {
  level: number;
  xpInLevel: number;
  xpToNext: number;
  totalXp: number;
  statPoints: number;
  attributes: Attributes;
  /** Quanto o PRÓXIMO ponto de cada atributo rende (soft cap calculado pelo servidor). Sem teto de pontos. */
  nextGain: Attributes;
  derived: DerivedStats;
  /** Ryō para redefinir os atributos. */
  resetCost: number;
}

export interface KitView {
  active: KitName;
  kits: Kits;
}

export interface MonsterView {
  id: string;
  type: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Efeitos valendo (effects.ts): código -> ms que faltam. */
  fx?: Partial<Record<EffectCode, number>>;
}

/** NPC parado no mapa. `range` = distância máxima para conversar (casas). */
export interface NpcView {
  id: string;
  name: string;
  /** Mapa onde ele fica (o cliente só desenha os do mapa atual: lojista só dentro da loja). */
  map: MapId;
  /** O que ele faz: Mestre (Sala de Missões), Posto de Viagem, lojista, professor ou o Diretor da Academia. */
  role: 'sensei' | 'travel' | 'shop' | 'tutor' | 'director';
  /** Lojista: falar com ele abre a loja (shop_open). */
  shop?: ShopKind;
  x: number;
  y: number;
  range: number;
}

/** Progressão do ninja (v7): só o dono vê. */
export interface NinjaView {
  /** v30: linhagem (null = ainda não despertou). */
  clan?: Clan | null;
  /** v35: linhagem marcada no Criador (antes do Rito) e o andamento do Rito do Despertar. */
  clanMark?: Clan | null;
  riteProgress?: number | null;
  /** v38: Pergaminho do Mestre (capítulos abertos e lidos). */
  manual?: { unlocked: ManualChapter[]; read: ManualChapter[] };
  /** Passo do tutorial da Academia: 0 a 3 = na sala 1 a 4; 4 = concluído (pode sair). */
  tutorialStep: number;
  ryo: number;
  items: Record<string, number>;
  equipped: string | null;
  /** Pergaminho levado nas costas (só visual). */
  equippedScroll: string | null;
  /** Sapato calçado (null = descalço). */
  equippedShoes: string | null;
  /** Acessório por cima da roupa (o casaco; null = nenhum). */
  equippedAccessory: string | null;
  classes: { primary: ClassCode | null; secondary: ClassCode | null };
  /** Jutsus aprendidos -> quantas vezes o servidor contou o uso (o nível sai daí). */
  jutsus: Record<string, number>;
  kageCandidate: boolean;
  /** Modo Administrador: o cliente mostra a dica dos comandos /admin (o servidor confere sempre). */
  isAdmin: boolean;
  /** Fim de jogo: trocas de vila já usadas (só 1), capa equipada e o que os outros veem no boneco. */
  villageSwitches: number;
  cape: string | null;
  display: Display;
}

/** Cartão da Sala de Missões (o Mestre): título, descrição, recompensa e dificuldade. */
export interface MissionOffer {
  /** Código da dificuldade no catálogo (game.mission_difficulties). */
  code: string;
  title: string;
  description: string;
  difficulty: 'Fácil' | 'Normal' | 'Difícil';
  target: { code: string; quantity: number };
  /** XP e título vêm do catálogo do BANCO (o mesmo que o trigger congela na missão). */
  reward: { xp: number; title: string | null };
}

/** Uma linha do histórico do chat. */
export interface ChatEntry {
  channel: ChatChannel;
  playerId: string;
  username: string;
  /** Sussurro: para quem foi. */
  to?: string;
  message: string;
  /** ISO 8601. */
  at: string;
}
export type ChatChannel = 'local' | 'global' | 'whisper';

/** Jutsu como o cliente mostra (botão, aba Jutsus). */
export interface SkillInfo {
  name: string;
  /** v30: só vem quando não é a mecânica (Academia: null); sem ele, a classe é a mecânica. */
  class?: ClassCode | null;
  /** v37: como se mira (segurar e arrastar): linha, cone ou área. Sem o campo: não mira (sai em si ou no alvo). */
  aim?: AimShape;
  /** v37: salto ou recuo (casas; negativo = para trás). A mira escolhe para onde ele vai. */
  dash?: number;
  /** v36: jutsu de clã (Rubro, Umbra): o nome do clã na aba Jutsus. */
  clan?: Clan;
  tier: number;
  mechanic: Mechanic;
  cost: number;
  cooldownMs: number;
  range?: number;
  /** Círculo da hitbox (explosão do Fogo, Ilusão, golpe do Taijutsu, Cura), para o efeito na tela. */
  radius?: number;
  /** Habilidade em linha (só nas 4 direções): a prévia da mira mostra o caminho. */
  line?: boolean;
  /** Kunais: quantas trilhas paralelas e a distância entre elas (casas). */
  shots?: number;
  laneGap?: number;
  /** v29 (Jutsus v2): como o jutsu sai (cone, leque, meteoros...), para o desenho e a mira. */
  form?: JutsuForm;
  /** v29: selos antes de sair (ms). */
  castMs?: number;
  /** v29: abertura do cone (graus). */
  coneDeg?: number;
  /** v29: buff de Básico: quanto tempo dura (para o brilho na arma). */
  durationMs?: number;
  /** v31: o que a maestria melhora (só nos jutsus já com a regra nova; sem ele: dano e cura). */
  mastery?: MasteryGain[];
  /** v46: o ícone próprio do jutsu e a descrição com os números de verdade (jutsuText.ts). */
  icon?: string;
  desc?: string;
}

/** Missão de sensei como o jogador vê (Sala de Missões). */
export interface MissionView {
  id: string;
  /** active = em andamento; submitted = esperando o sensei avaliar; approved = pergaminho para entregar. */
  status: 'active' | 'submitted' | 'approved';
  senseiName: string;
  /** Id do sensei: o aprendiz entrega tocando NESTE jogador. */
  senseiId: string;
  /** Missão do NPC Mestre (e não de um sensei jogador). */
  fromNpc: boolean;
  type: { code: string; name: string };
  /** code = tipo do monstro (DEFEAT_MONSTER) ou do conteúdo; quantity = meta. */
  target: { code: string; quantity: number };
  progress: number;
  reward: { xp: number; title: string | null };
  expiresAt: string | null;
  /** Objetivo completo ou pergaminho aprovado: é só voltar ao Mestre. */
  ready: boolean;
}

export interface MissionRewardView {
  senseiName: string;
  xp: number;
  title: string | null;
  titleNew: boolean;
}

/** Por que a missão foi (re)enviada: o cliente escolhe o aviso. */
export type MissionReason = 'sync' | 'assigned' | 'progress' | 'ready' | 'completed';

/** O que o cliente precisa saber do mundo para desenhar, prever o movimento e montar os botões. */
/**
 * O céu (weather.ts, docs/clima.md): a hora (o cliente acompanha sozinho a partir de `serverNow`, `cycleMs`,
 * `offsetMs` e `phaseStarts`), o clima e o que eles mudam nos jutsus agora (só ao ar livre).
 */
export interface SkyView {
  serverNow: number;
  cycleMs: number;
  offsetMs: number;
  phaseStarts: Record<DayPhase, number>;
  phase: DayPhase;
  weather: Weather;
  effects: SkyEffects;
}

export interface WorldInfo {
  /** Chefes (tipo -> nome e onde ficam as fases, em fração da vida): a barra do topo. */
  bosses: Record<string, { name: string; phases: number[] }>;
  /** Catálogo dos efeitos com tempo (effects.ts): o cliente mostra o ícone e o nome. */
  effects: Record<EffectCode, { name: string; icon: string; kind: 'buff' | 'debuff' | 'cc' }>;
  width: number;
  height: number;
  speed: number;
  runSpeed: number;
  tickMs: number;
  spawn: { x: number; y: number };
  respawnMs: number;
  /** range = alcance máximo (Fogo: raio da área); ausente = habilidade em si mesmo (nível 1 do jutsu). */
  skills: Record<Skill, SkillInfo>;
  /** v28: custo e recarga de cada jutsu nas áreas de PvP (arena das vilas e Zona de Conflito). */
  pvpSkills: Record<Skill, { cost: number; cooldownMs: number }>;
  meditationRegenMultiplier: number;
  npcs: NpcView[];
  basicAttack: { range: number; cooldownMs: number };
  sky: SkyView;
  /**
   * Mapa onde o jogador está agora e os layouts (paredes, saídas, chão) dele e dos vizinhos (saídas e portas). Os
   * outros chegam no `map_changed`, quando o jogador se aproxima deles.
   */
  map: MapId;
  maps: Partial<Record<MapId, MapLayout>>;
  attributePerPoint: Attributes;
  /** Níveis dos ranks: Genin (Missão de Genin), Chunin (Exame Chunin), Kage (candidatura). */
  rankLevels: { genin: number; chunin: number; kage: number };
  classes: { code: ClassCode; name: string; icon: string; desc: string }[];
  items: ItemDef[];
  /** Extração: pergaminhos e chance por nível (1 a 4). Só informativo: o sorteio é do servidor. */
  extraction: { level: number; scrolls: number; chance: number }[];
  /** Proteção contra azar (v10): + isto na chance por falha seguida (as falhas vêm em `extract_odds`). */
  extractionPityStep: number;
  /** Vilas que o Criador deixa escolher (todas com o módulo de vilas ligado; senão só a primeira). */
  openVillages: string[];
  /** Usos para cada nível do jutsu (índice = nível - 1). */
  jutsuLevelUses: number[];
  maxLevel: number;
  /** v38: a versão do jogo (nota do Pré-Alpha) e o prêmio de cada capítulo novo do Pergaminho do Mestre. */
  version: string;
  manualReward: { ryo: number; xp: number };
}

export type CastFailReason = 'NO_CHAKRA' | 'COOLDOWN' | 'NO_TARGET' | 'OUT_OF_RANGE' | 'FULL_HP' | 'ALREADY_ACTIVE' | 'DEAD' | 'NOT_EQUIPPED' | 'SAFE_ZONE' | 'NOT_LEARNED' | 'NOT_YOUR_CLASS' | 'BLOCKED' | 'TUTORIAL_LOCKED' | 'STUNNED' | 'SILENCED' | 'ASLEEP' | 'CASTING';
/** Por que a meditação acabou. */
export type MeditationEnd = 'manual' | 'moved' | 'cast' | 'damaged' | 'died';
export type MonsterStatus = 'stunned' | 'rooted';

export type ServerMessage =
  | { type: 'welcome'; you: SelfView; players: PlayerView[]; monsters: MonsterView[]; world: WorldInfo; progress: ProgressView; kit: KitView; ninja: NinjaView }
  | { type: 'player_joined'; player: PlayerView }
  | { type: 'shop_open'; shop: ShopKind; npcId: string }
  /** maps: layouts que o cliente ainda não tinha (o mapa novo e os vizinhos dele). */
  | { type: 'map_changed'; map: MapId; x: number; y: number; a: number; players: PlayerView[]; monsters: MonsterView[]; reason: MapChangeReason; maps?: Partial<Record<MapId, MapLayout>> }
  | { type: 'player_moved'; playerId: string; x: number; y: number; d: Dir; a: number }
  | { type: 'player_appearance'; playerId: string; appearance: Appearance }
  | { type: 'player_left'; playerId: string }
  | { type: 'chat'; playerId: string; username: string; message: string; channel?: ChatChannel; to?: string }
  | { type: 'chat_history'; messages: ChatEntry[] }
  | { type: 'player_gear'; playerId: string; gear: Gear }
  | { type: 'pushed'; playerId: string; fromX: number; fromY: number; x: number; y: number; a: number }
  | { type: 'sync'; id: number; rtt: number }
  | { type: 'admin_catalog'; players: { username: string; map: string; level: number }[]; monsters: { code: string; name: string }[]; maps: { id: string; name: string }[]; villages: { code: string; name: string }[] }
  | { type: 'admin_pvp'; report: PvpReport; db: { days: number; rows: PvpClassRow[] } | null }
  | { type: 'manual'; unlocked: ManualChapter[]; read: ManualChapter[]; fresh?: ManualChapter[] }
  | { type: 'feedback_sent'; id: number }
  | { type: 'admin_feedback'; items: FeedbackRow[]; error?: string }
  | { type: 'monster_aggro'; id: string; targetId: string | null }
  /** O monstro bateu em alguém (v19): o cliente toca a animação de ataque virada para o alvo. */
  | { type: 'monster_attack'; id: string; targetId: string }
  | { type: 'effect'; target: 'player' | 'monster'; id: string; effect: EffectCode; ms: number }
  | { type: 'combo'; target: 'player' | 'monster'; id: string; combo: 'eletrocutado' }
  | { type: 'telegraph'; id: string; kind: 'slam' | 'crush'; x: number; y: number; r: number; ms: number }
  | { type: 'monster_slam'; id: string; kind: 'slam' | 'crush'; x: number; y: number; r: number }
  | { type: 'boss_phase'; id: string; phase: number; text: string }
  | { type: 'mission_board'; npcId: string; offers: MissionOffer[]; mission: MissionView | null }
  | { type: 'stats'; hp: number; maxHp: number; chakra: number; maxChakra: number; shield: boolean; speed: number; running: boolean }
  | { type: 'player_hp'; playerId: string; hp: number; maxHp: number }
  | { type: 'cast'; playerId: string; skill: Skill; x: number; y: number; fx: number; fy: number; tx?: number; ty?: number; cd?: number }
  | { type: 'projectile'; id: number; playerId: string; skill?: Skill; weapon?: string; power?: PowerKind; x: number; y: number; fx: number; fy: number; speed: number; range: number }
  | { type: 'impact'; id: number; skill?: Skill; weapon?: string; power?: PowerKind; x: number; y: number; r: number }
  | { type: 'dash'; playerId: string; fromX: number; fromY: number; x: number; y: number; a: number }
  | { type: 'player_status'; playerId: string; status: MonsterStatus; ms: number }
  | { type: 'cast_failed'; skill: Skill; reason: CastFailReason }
  | { type: 'meditation'; playerId: string; active: boolean; reason?: MeditationEnd }
  | { type: 'hit'; target: 'monster' | 'player'; id: string; amount: number; kind: 'damage' | 'heal'; hp: number; maxHp: number; shielded?: boolean }
  | { type: 'monsters_moved'; m: [string, number, number][] }
  | { type: 'monster_spawned'; monster: MonsterView }
  | { type: 'monster_status'; id: string; status: MonsterStatus; ms: number }
  | { type: 'monster_died'; id: string; killerId: string }
  /** Densidade: o mapa esvaziou e este monstro (longe de todos) sumiu. */
  | { type: 'monster_gone'; id: string }
  /** arena: perdeu uma luta de treino (renasce na entrada da arena, mais rápido). */
  | { type: 'player_died'; playerId: string; respawnInMs: number; arena?: boolean }
  // v29: modo rankeado. A fila (só para quem está nela) e o estado da partida da arena (para todos no Vale).
  | { type: 'duel_queue'; queued: boolean; position: number; size: number;
      /** v41: fila do Torneio da Temporada (só a da vila de quem recebe): posição (0 = fora) e tamanho. */ jounin?: { position: number; size: number };
      /** v43: fila da Fase Final (0 = fora). */ final?: { position: number; size: number } }
  /** v41: o Torneio da Temporada para quem recebe: aberto agora, até quando, se ele pode jogar e os pontos dele na era. */
  /** v42: o painel do Torneio: os 10 primeiros da vila, a linha de corte (2x as vagas) e a linha de quem pediu. */
  | { type: 'jounin_board'; available: boolean; open?: boolean; endsAt?: number; village?: string; slots?: number; cut?: number;
      /** Pontos de quem está na última posição da zona de classificação (null = ainda sobra lugar). */ cutPoints?: number | null;
      qualified?: number; top?: JouninRowView[]; me?: JouninRowView | null; eligible?: boolean; reason?: string; minMatches?: number }
  /** v43: a Fase Final de uma vila: grupos, chave, os Jounin da era e os jogos que faltam para quem pediu. */
  | { type: 'final_board'; stage: 'pontos' | 'grupos' | 'chaves' | 'encerrado'; village?: string; slots?: number;
      groups?: { no: number; rows: FinalGroupRowView[] }[]; bracket?: FinalBracketView[]; rounds?: number;
      era?: { position: number; username: string; me?: boolean }[]; champion?: string | null;
      finalist?: boolean; pending?: string[] }
  | { type: 'jounin_state'; stage?: 'pontos' | 'grupos' | 'chaves' | 'encerrado'; finalist?: boolean; open: boolean; endsAt?: number; eligible?: boolean; points?: number; wins?: number; losses?: number; minMatches: number }
  // v29 (Jutsus v2, entrega 1): zona no chão (fogo, lama, cura...) e aviso de golpe que cai depois de `ms`.
  | { type: 'ground'; id: number; kind: GroundKind; x: number; y: number; r: number; ms: number; skill?: string; follow?: string }
  | { type: 'ground_end'; id: number }
  // v30: muro de jutsu (entra nas paredes do mapa enquanto existe)
  | { type: 'barrier'; id: number; kind: 'rocha' | 'agua'; x: number; y: number; w: number; h: number; hp: number; ms: number }
  | { type: 'barrier_end'; id: number }
  // v30: invocação de um ninja (é um monstro com dono; some no fim) e o soco do Golem
  | { type: 'summon'; id: string; ownerId: string; kind: string; hp: number; maxHp: number; ms: number }
  | { type: 'summon_punch'; id: string; x: number; y: number; r: number }
  // v29: conjuração (selos) começou, e foi interrompida
  | { type: 'cast_start'; playerId: string; skill: string; ms: number }
  | { type: 'cast_interrupted'; playerId: string; skill: string; reason: 'interrupted' | 'cancel' }
  // v29: sentou ou levantou da arquibancada do Vale (todos no mapa veem)
  | { type: 'sit'; playerId: string; active: boolean }
  // v29 (migração v15): os pontos de quem lutou depois da partida, e o painel do ranking.
  | { type: 'duel_rating'; counted: boolean; delta: number; mmr: number; won: boolean; ryo: number;
      /** v41: 'jounin' = partida do Torneio da Temporada (`mmr` leva os pontos da era). */ mode?: 'ranked' | 'jounin' | 'final' }
  | { type: 'ranked_board'; available: boolean; season?: { id: number; endsAt: number } | null; top?: RankedRowView[]; me?: RankedRowView | null;
      overall?: { mmr: number; best: number; wins: number; losses: number } | null }
  /** v45: as recargas voltaram a zero (começo de cada rodada do duelo): o cliente limpa os botões. */
  | { type: 'cooldowns_reset' }
  | { type: 'duel_state'; phase: 'idle' | 'prep' | 'round' | 'interval' | 'done'; ms: number; round: number; wins: { a: number; b: number };
      a?: DuelSideView; b?: DuelSideView; history: ('a' | 'b')[]; winner?: 'a' | 'b'; reason?: 'rounds' | 'forfeit'; queue: number;
      /** v41: partida do Torneio da Temporada ('final' = Fase Final, v43). */ mode?: 'ranked' | 'jounin' | 'final';
      /** v29: a partida acabou sem nenhum dano (não conta pontos). */ voided?: boolean;
      /** v29: um lado caiu e tem até `ms` para reconectar. */ away?: { side: 'a' | 'b'; ms: number } }
  | { type: 'arena_result'; winnerId: string; winner: string; loserId: string; loser: string; winnerRecord: ArenaRecord; loserRecord: ArenaRecord }
  | { type: 'player_respawned'; playerId: string; x: number; y: number; hp: number; maxHp: number }
  | { type: 'xp'; gained: number; totalXp: number; rank: RankView; promoted: boolean }
  | { type: 'announce'; message: string }
  | { type: 'mission'; mission: MissionView | null; reason: MissionReason }
  | { type: 'npc_say'; npcId: string; text: string }
  | { type: 'mission_reward'; rewards: MissionRewardView[]; totalXp: number; rank: RankView; promoted: boolean }
  | { type: 'progress' } & ProgressView
  | { type: 'kit' } & KitView
  /** r e arc: alcance e abertura do golpe com a arma (o corte é desenhado desse tamanho); throw: arma lançada. */
  | { type: 'attack'; playerId: string; x: number; y: number; fx: number; fy: number; cd: number; throw?: string; r?: number; arc?: number }
  | { type: 'attack_failed'; reason: 'COOLDOWN' | 'NO_TARGET' | 'OUT_OF_RANGE' | 'DEAD' | 'SAFE_ZONE' | 'STUNNED' | 'ASLEEP' }
  | { type: 'player_rank'; playerId: string; rank: RankView; level: number; lineage?: LineageView }
  | { type: 'evaluation_request'; missionId: string; trainee: { id: string; username: string }; mission: MissionView }
  | { type: 'sensei_options'; difficulties: SenseiDifficulty[]; quantities: number[] }
  | { type: 'notice'; text: string; tone: 'info' | 'good' | 'bad' }
  /** Mudou a fase do dia ou o clima (para todos). `changed`: o que mudou (o cliente avisa na tela). */
  | { type: 'sky'; sky: SkyView; changed: 'phase' | 'weather' | 'both' }
  | { type: 'tutorial'; step: number }
  | { type: 'inventory'; ryo: number; items: Record<string, number>; equipped: string | null; equippedScroll: string | null; equippedShoes: string | null; equippedAccessory: string | null; cape?: string | null }
  | { type: 'classes'; primary: ClassCode | null; secondary: ClassCode | null }
  // v30: a linhagem despertou
  | { type: 'clan'; clan: Clan }
  | { type: 'clan_mark'; clan: Clan }
  | { type: 'rite'; progress: number | null; count: number }
  | { type: 'jutsus'; jutsus: Record<string, number> }
  | { type: 'jutsu_level'; skill: Skill; level: number }
  | { type: 'class_choice'; kind: 'primary' | 'secondary'; classes: ClassCode[] }
  | { type: 'extract_result'; class: ClassCode; level: number; outcome: 'success' | 'failed' | 'no_scrolls' | 'all_learned'; jutsu: Skill | null; consumed: number; scrollsLeft: number }
  /** Falhas seguidas na Extração por classe e tier (proteção contra azar): o cliente soma à chance. */
  | { type: 'extract_odds'; failures: Partial<Record<ClassCode, Record<number, number>>> }
  | { type: 'teleport'; playerId: string; fromX: number; fromY: number; x: number; y: number; a: number }
  | { type: 'substitution'; playerId: string; logX: number; logY: number; x: number; y: number; a: number }
  | { type: 'error'; code: RealtimeErrorCode; message: string }
  // ------------------------------------------------ fim de jogo (v16)
  | ({ type: 'endgame' } & EndgameView)
  | { type: 'player_faction'; playerId: string; faction: FactionView }
  | ({ type: 'village_panel' } & VillagePanelView)
  | { type: 'travel_options'; npcId: string; options: TravelOption[] }
  | ({ type: 'ranking' } & RankingView)
  | { type: 'pvp_result'; winnerId: string; winner: string; loserId: string; loser: string; counted: boolean; winnerDelta: number; loserDelta: number; loot: number; bounty: number }
  | { type: 'akatsuki_invite'; from: string; slot: number; power: string; expiresAt: number }
  | { type: 'power'; playerId: string; power: PowerKind; x: number; y: number; fx: number; fy: number; tx?: number; ty?: number; ms?: number }
  | { type: 'power_failed'; reason: PowerFailReason };

export type PowerFailReason = 'NOT_MEMBER' | 'COOLDOWN' | 'NO_CHAKRA' | 'NO_TARGET' | 'DEAD' | 'SAFE_ZONE' | 'STUNNED' | 'SILENCED' | 'ASLEEP';

/** Estado político que todos recebem (welcome e cada mudança). Instantes em ms. */
export interface EndgameView {
  /** Módulos ligados agora (vilas -> pvp -> renegados -> akatsuki). */
  modules: EndgameModule[];
  villages: { code: Village; name: string; map: MapId; passive: string }[];
  kages: { village: Village; playerId: string; username: string; termEndsAt: number }[];
  relations: RelationRow[];
  events: WorldEvent[];
  akatsuki: { slot: number; playerId: string; username: string; power: string }[];
  season: { id: number; startsAt: number; endsAt: number } | null;
  /** Viagem para vila aliada (ryō). */
  allyTravelRyo: number;
  /** Poderes da Akatsuki por vaga (nome, texto e recarga) para o botão. */
  powers: { slot: number; code: PowerKind; name: string; text: string; cooldownMs: number; cost: number }[];
}

export interface VillagePanelView {
  panel: VillagePanel;
  /** Quem pediu é o Kage desta vila (o cliente mostra as ações; o banco confere de novo). */
  isKage: boolean;
  /** Texto da passiva da vila. */
  passive: string;
}

/** Um destino do Posto de Viagem. `cost` em ryō; `locked` = por que não dá agora. */
export interface TravelOption {
  to: string;
  name: string;
  cost: number;
  locked?: string;
}

export interface RankingView {
  season: { id: number; startsAt: number; endsAt: number } | null;
  top: RankRow[];
  global: RankRow[];
  me: { mmr: number; wins: number; losses: number; seasonMmr: number | null; seasonWins: number; seasonLosses: number; position: number | null };
}

/** Placar de arena de um ninja (desde que o servidor subiu). */
export interface ArenaRecord {
  wins: number;
  losses: number;
}

/** Por que o jogador trocou de mapa: andou, renasceu ou foi levado pelo tutorial (sala seguinte / Praça). */
export type MapChangeReason = 'walk' | 'respawn' | 'tutorial' | 'travel' | 'exiled';

export interface SenseiDifficulty {
  code: string;
  name: string;
  xp: number;
  title: string | null;
}

export const REALTIME_ERRORS = {
  INVALID_MESSAGE: 'Mensagem inválida. Use {"type":"input","seq":1,"inputs":[[1,0]]}, {"type":"move","dx":..,"dy":..}, {"type":"cast","skill":".."}, {"type":"meditate","active":true}, {"type":"respawn"}, {"type":"talk","npcId":"sensei"}, {"type":"missions"}, {"type":"attack"}, {"type":"run","active":true}, {"type":"switch_kit","kit":"B"}, {"type":"spend_point","attribute":".."} ou {"type":"chat","message":".."}.',
  RESPAWN_NOT_READY: 'Ainda não dá para renascer.',
  CANNOT_MEDITATE: 'Não dá para meditar agora.',
  UNKNOWN_NPC: 'Esse NPC não existe.',
  NPC_TOO_FAR: 'Chegue mais perto para conversar.',
  CANNOT_TALK: 'Não dá para conversar agora.',
  MISSIONS_UNAVAILABLE: 'A Sala de Missões não está disponível agora. Tente de novo.',
  NO_POINTS: 'Você não tem pontos de atributo. Suba de nível para ganhar mais.',
  PROFILE_UNAVAILABLE: 'Não foi possível salvar agora. Tente de novo.',
  PROFILE_BUSY: 'Calma! Ainda salvando os pedidos anteriores.',
  PLAYER_NOT_FOUND: 'Esse jogador não está mais online.',
  PLAYER_TOO_FAR: 'Chegue mais perto desse jogador.',
  INVALID_MISSION_OPTION: 'Opção de missão inválida.',
  CHAT_RATE_LIMITED: 'Calma! Espere um pouco antes de mandar outra mensagem no chat.',
  CHAT_INVALID: 'Mensagem de chat vazia ou longa demais.',
  NOT_LEARNED: 'Você ainda não aprendeu esse jutsu.',
  SHOP_TOO_FAR: 'Fale com o lojista que vende isso (dentro da loja).',
  DIRECTOR_TOO_FAR: 'Fale com o Diretor, na última sala da Academia.',
  ITEM_NOT_OWNED: 'Você não tem esse item.',
  NOT_A_WEAPON: 'Isso não é uma arma.',
  NOT_A_SCROLL: 'Só pergaminhos vão nas costas.',
  SENSEI_TOO_FAR: 'Fale com o Mestre, na avenida da Vila, para escolher ou entregar missões.',
  TUTORIAL_LOCKED: 'Termine esta etapa da Academia primeiro.',
  VILLAGE_LOCKED: 'Essa vila ainda não abriu. Por enquanto, todos os ninjas são da primeira vila.',
  ENDGAME_OFF: 'Isso ainda não abriu no servidor (chega quando houver mais ninjas).',
  TRAVEL_TOO_FAR: 'Fale com o Posto de Viagem.',
  NOT_A_CAPE: 'Isso não é uma capa.',
  NOT_SHOES: 'Só sapatos vão nos pés.',
  NOT_ACCESSORY: 'Esse item não é um acessório.',
  NOT_YOUR_CLASS: 'Esse jutsu é de outra classe: só entram no kit os da sua classe Primária, Secundária, da Academia ou da sua linhagem.',
} as const;
export type RealtimeErrorCode = keyof typeof REALTIME_ERRORS;

/** Códigos de fechamento (o cliente vê no evento "close"). */
export const CLOSE = {
  SHUTDOWN: { code: 1001, reason: 'servidor reiniciando' },
  FLOOD: { code: 1008, reason: 'mensagens demais' },
  REPLACED: { code: 4000, reason: 'conectado em outro lugar' },
  SLOW_CONSUMER: { code: 4001, reason: 'conexão lenta demais' },
} as const;

/**
 * Limpa o texto do chat: tira caracteres de controle e de inversão de direção, e
 * espaços nas pontas. Devolve undefined se ficar vazio ou passar do limite.
 */
export function sanitizeChat(raw: string, maxLength: number): string | undefined {
  // \p{Cc}: controles (\n, \u0000...). U+202A-202E e U+2066-2069: inversão de direção do texto,
  // usada para disfarçar mensagens. Emojis compostos (com U+200D) continuam funcionando.
  const text = raw.replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, ' ').replace(/\s+/g, ' ').trim();
  const length = [...text].length;
  return length === 0 || length > maxLength ? undefined : text;
}
