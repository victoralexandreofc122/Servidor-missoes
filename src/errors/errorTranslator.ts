import { AppError, type PublicError } from './AppError.js';

/**
 * Regras do BANCO: nome da constraint (ou da regra levantada por trigger)
 * -> erro público. O nome da constraint nunca sai para o jogador.
 */
export const CONSTRAINT_ERRORS: Readonly<Record<string, PublicError>> = {
  // criação da missão
  rule_sensei_rank: { status: 403, code: 'SENSEI_RANK_REQUIRED', message: 'Seu rank ainda não permite criar missões de sensei.' },
  rule_trainee_rank: { status: 422, code: 'TRAINEE_RANK_TOO_HIGH', message: 'O aprendiz precisa ter um rank abaixo do seu.' },
  ck_sensei_missions_not_self: { status: 422, code: 'CANNOT_TRAIN_YOURSELF', message: 'Você não pode criar uma missão para si mesmo.' },
  rule_catalog_active: { status: 422, code: 'MISSION_OPTION_UNAVAILABLE', message: 'Esse tipo de missão ou essa dificuldade não está disponível.' },
  ck_sensei_missions_target: { status: 422, code: 'INVALID_TARGET', message: 'O alvo da missão é inválido.' },
  ck_sensei_missions_deadline: { status: 422, code: 'INVALID_DEADLINE', message: 'O prazo da missão precisa ser no futuro.' },
  ux_sensei_missions_trainee_open: { status: 409, code: 'TRAINEE_BUSY', message: 'Esse aprendiz já está com uma missão de sensei em aberto.' },

  // andamento e entrega ao sensei
  rule_mission_terms_immutable: { status: 409, code: 'MISSION_TERMS_LOCKED', message: 'Os termos da missão não podem mudar depois de criada.' },
  rule_mission_transition: { status: 409, code: 'INVALID_MISSION_STATE', message: 'Essa ação não é possível no estado atual da missão.' },
  rule_mission_progress: { status: 409, code: 'MISSION_NOT_IN_PROGRESS', message: 'Essa missão não está em andamento.' },
  ck_sensei_missions_progress: { status: 409, code: 'PROGRESS_OUT_OF_RANGE', message: 'Progresso fora do limite da missão.' },
  rule_mission_incomplete: { status: 409, code: 'MISSION_INCOMPLETE', message: 'Complete o objetivo antes de voltar ao sensei.' },
  rule_mission_deadline: { status: 409, code: 'MISSION_DEADLINE', message: 'O prazo da missão não permite essa ação.' },

  // avaliação
  rule_evaluation_requires_submission: { status: 409, code: 'MISSION_NOT_SUBMITTED', message: 'Só dá para avaliar uma missão que o aprendiz já entregou.' },
  rule_only_sensei_evaluates: { status: 403, code: 'ONLY_SENSEI_EVALUATES', message: 'Só o sensei desta missão pode avaliá-la.' },
  rule_evaluator_rank: { status: 403, code: 'EVALUATOR_RANK_REQUIRED', message: 'Seu rank não permite avaliar missões de sensei.' },
  rule_evaluator_not_trainee: { status: 403, code: 'CANNOT_EVALUATE_OWN_MISSION', message: 'Você não pode avaliar a sua própria missão.' },
  ux_mission_evaluations_one_approval: { status: 409, code: 'MISSION_ALREADY_APPROVED', message: 'Essa missão já foi aprovada.' },
  ck_mission_evaluations_score: { status: 422, code: 'INVALID_SCORE', message: 'A nota precisa estar entre 1 e 5.' },
  ck_mission_evaluations_feedback: { status: 422, code: 'FEEDBACK_TOO_LONG', message: 'O comentário pode ter no máximo 500 caracteres.' },

  // pergaminho e Sala de Missões
  rule_scroll_requires_approval: { status: 409, code: 'SCROLL_REQUIRES_APPROVAL', message: 'Pergaminho só é emitido para missão aprovada.' },
  rule_redemption_requires_approval: { status: 409, code: 'SCROLL_NOT_REDEEMABLE', message: 'Este pergaminho não pode ser entregue na Sala de Missões.' },
  ux_scroll_redemptions_scroll: { status: 409, code: 'SCROLL_ALREADY_REDEEMED', message: 'Este pergaminho já foi entregue.' },

  // progressão (v7): ranks, classes, Extração, loja, tutorial e Kage
  rule_tutorial_first: { status: 409, code: 'TUTORIAL_FIRST', message: 'Conclua o tutorial da Academia primeiro.' },
  rule_genin_level: { status: 409, code: 'GENIN_LEVEL', message: 'A Missão de Genin é a partir do nível 11.' },
  rule_genin_rank: { status: 409, code: 'ALREADY_GENIN', message: 'Você já passou da Academia.' },
  rule_class_unknown: { status: 422, code: 'CLASS_UNKNOWN', message: 'Essa classe não existe.' },
  rule_secondary_class: { status: 409, code: 'SECONDARY_CLASS', message: 'A classe Secundária é para Chunin de nível 40, diferente da Primária e escolhida uma vez só.' },
  rule_extraction_input: { status: 422, code: 'EXTRACTION_INVALID', message: 'Extração inválida.' },
  rule_class_not_owned: { status: 403, code: 'CLASS_NOT_OWNED', message: 'Você só aprende jutsus da sua classe.' },
  rule_item_not_for_sale: { status: 422, code: 'ITEM_NOT_FOR_SALE', message: 'Esse item não está à venda.' },
  rule_not_enough_ryo: { status: 409, code: 'NOT_ENOUGH_RYO', message: 'Ryō insuficiente.' },
  rule_equip_owned: { status: 409, code: 'ITEM_NOT_OWNED', message: 'Só dá para equipar uma arma do seu inventário.' },
  rule_hokage_level: { status: 409, code: 'HOKAGE_LEVEL', message: 'Só um ninja de nível 60 pode se candidatar a Kage.' },
  rule_usage_only_up: { status: 409, code: 'RECORD_LOCKED', message: 'Esse registro não pode ser alterado.' },
  rule_chunin_exam: { status: 422, code: 'CHUNIN_EXAM_LEVEL', message: 'O Exame Chunin é para Genin de nível 40.' },
  rule_level_from_xp: { status: 409, code: 'RECORD_LOCKED', message: 'Esse registro não pode ser alterado.' },

  // v8: redefinir atributos, pergaminho nas costas e Modo Administrador
  rule_nothing_to_reset: { status: 409, code: 'NOTHING_TO_RESET', message: 'Você ainda não investiu nenhum ponto.' },
  rule_reset_cost: { status: 422, code: 'INVALID_INPUT', message: 'Custo inválido.' },
  rule_equip_scroll_owned: { status: 409, code: 'ITEM_NOT_OWNED', message: 'Só dá para levar nas costas um pergaminho do seu inventário.' },
  // v12: sapatos e /admin ryo
  rule_admin_ryo: { status: 422, code: 'INVALID_INPUT', message: 'O ryō vai de 1 a 1.000.000.' },
  rule_equip_shoes_owned: { status: 409, code: 'ITEM_NOT_OWNED', message: 'Só dá para calçar um sapato do seu inventário.' },
  rule_admin_only: { status: 403, code: 'ADMIN_ONLY', message: 'Comando restrito ao administrador.' },

  // v11: fim de jogo (vilas, Kage, diplomacia, PvP, renegados, Akatsuki, capas)
  rule_module_off: { status: 409, code: 'MODULE_OFF', message: 'Isso ainda não está disponível neste servidor.' },
  rule_village_unknown: { status: 422, code: 'VILLAGE_UNKNOWN', message: 'Vila inválida.' },
  rule_village_switch_used: { status: 409, code: 'VILLAGE_SWITCH_USED', message: 'Você já usou a sua troca de vila.' },
  rule_village_switch_blocked: { status: 409, code: 'VILLAGE_SWITCH_BLOCKED', message: 'Kage, candidato a Kage e membro dos Cinzas não trocam de vila.' },
  rule_renegade_no_village: { status: 409, code: 'RENEGADE', message: 'Renegado não tem vila.' },
  rule_renegade_final: { status: 409, code: 'RENEGADE_FINAL', message: 'Renegado não volta para a vila.' },
  rule_vote_no_village: { status: 409, code: 'RENEGADE', message: 'Renegado não vota.' },
  rule_vote_no_election: { status: 409, code: 'NO_ELECTION', message: 'Não há eleição aberta na sua vila agora.' },
  rule_vote_eligibility: { status: 409, code: 'VOTE_NOT_ALLOWED', message: 'Só votam Genin ou acima, com conta de mais de 7 dias.' },
  rule_vote_candidate: { status: 422, code: 'VOTE_CANDIDATE', message: 'Esse ninja não concorre na eleição da sua vila.' },
  rule_vote_once: { status: 409, code: 'ALREADY_VOTED', message: 'Você já votou nesta eleição.' },
  rule_kage_only: { status: 403, code: 'KAGE_ONLY', message: 'Só o Kage da vila pode fazer isso.' },
  rule_kage_village: { status: 422, code: 'KAGE_VILLAGE', message: 'O Kage precisa ser ninja da vila.' },
  rule_diplomacy_cooldown: { status: 409, code: 'DIPLOMACY_COOLDOWN', message: 'Essas duas vilas mudaram de relação há pouco. Espere 24 h.' },
  rule_war_on_ally: { status: 409, code: 'WAR_ON_ALLY', message: 'Não dá para declarar guerra a uma vila aliada. Desfaça a aliança antes.' },
  rule_already_war: { status: 409, code: 'ALREADY_WAR', message: 'As duas vilas já estão em guerra.' },
  rule_truce_active: { status: 409, code: 'TRUCE', message: 'Há uma trégua em vigor: ninguém declara guerra agora.' },
  rule_end_war_declarer: { status: 409, code: 'END_WAR', message: 'Só quem declarou a guerra a encerra sozinho. O outro lado propõe a paz.' },
  rule_alliance_state: { status: 409, code: 'ALLIANCE_STATE', message: 'Aliança só entre vilas neutras (sem guerra nem trégua).' },
  rule_alliance_limit: { status: 409, code: 'ALLIANCE_LIMIT', message: 'Cada vila pode ter só uma aliança.' },
  rule_peace_state: { status: 409, code: 'PEACE_STATE', message: 'As duas vilas não estão em guerra.' },
  rule_proposal_open: { status: 409, code: 'PROPOSAL_OPEN', message: 'Já existe uma proposta aberta entre essas vilas.' },
  rule_proposal_missing: { status: 409, code: 'PROPOSAL_MISSING', message: 'Proposta não encontrada (ou já venceu).' },
  rule_not_allied: { status: 409, code: 'NOT_ALLIED', message: 'Essas vilas não são aliadas.' },
  rule_travel_not_allied: { status: 409, code: 'TRAVEL_NOT_ALLIED', message: 'Esse Posto só leva para vila aliada.' },
  rule_exile_target: { status: 422, code: 'EXILE_TARGET', message: 'Só dá para expulsar ninjas da sua vila (e nunca o Kage).' },
  rule_reason_length: { status: 422, code: 'REASON_LENGTH', message: 'Escreva uma justificativa de 10 a 300 caracteres.' },
  rule_exile_limit: { status: 409, code: 'EXILE_LIMIT', message: 'A vila já expulsou 5 ninjas nesta semana. Espere alguns dias.' },
  rule_report_target: { status: 422, code: 'REPORT_TARGET', message: 'Só dá para denunciar ninjas da sua vila.' },
  rule_report_rank: { status: 409, code: 'REPORT_RANK', message: 'Só denuncia quem tem rank igual ou maior que o do denunciado.' },
  rule_report_open: { status: 409, code: 'REPORT_OPEN', message: 'Você já tem uma denúncia aberta contra esse ninja.' },
  rule_report_missing: { status: 409, code: 'REPORT_MISSING', message: 'Denúncia não encontrada (ou já decidida).' },
  rule_akatsuki_leader: { status: 403, code: 'AKATSUKI_LEADER', message: 'Só o líder dos Cinzas pode fazer isso.' },
  rule_akatsuki_slot: { status: 409, code: 'AKATSUKI_SLOT', message: 'Essa vaga dos Cinzas está ocupada (ou o ninja ainda não tem nível 40).' },
  rule_akatsuki_target: { status: 422, code: 'AKATSUKI_TARGET', message: 'Esse ninja não pode entrar nos Cinzas (nível 40+, fora dela e não admin).' },
  rule_akatsuki_invite: { status: 409, code: 'AKATSUKI_INVITE', message: 'Convite dos Cinzas não encontrado (ou já venceu).' },
  rule_cape_owned: { status: 409, code: 'CAPE_NOT_OWNED', message: 'Você não tem essa capa.' },
  rule_admin_endgame: { status: 422, code: 'INVALID_INPUT', message: 'Módulo (vilas, pvp, renegados, akatsuki) ou modo (on, off, auto) inválido.' },
  rule_admin_event: { status: 422, code: 'INVALID_INPUT', message: 'Evento inválido: de 1 a 720 horas, entre duas vilas diferentes (ou trégua entre todas).' },
  rule_admin_renegade: { status: 409, code: 'INVALID_INPUT', message: 'Esse ninja já está nesse estado.' },
  rule_admin_season: { status: 409, code: 'NO_SEASON', message: 'Não há temporada aberta.' },
  ck_world_events_pair: { status: 422, code: 'INVALID_INPUT', message: 'Evento inválido: guerra é entre duas vilas; trégua, entre duas ou entre todas.' },
  rule_admin_level: { status: 422, code: 'INVALID_INPUT', message: 'O nível vai de 1 a 60.' },
  rule_admin_reset_target: { status: 422, code: 'INVALID_INPUT', message: 'O reset de classes é só para conta de admin (para testar builds).' },
  rule_admin_rank: { status: 422, code: 'INVALID_INPUT', message: 'Patente desconhecida (academia, genin, chunin, jounin, anbu ou kage).' },
  rule_admin_jutsu_level: { status: 422, code: 'INVALID_INPUT', message: 'O nível do jutsu vai de 1 a 4.' },
  rule_admin_quantity: { status: 422, code: 'INVALID_INPUT', message: 'A quantidade vai de 1 a 999.' },

  // gerais
  rule_append_only: { status: 409, code: 'RECORD_LOCKED', message: 'Esse registro não pode ser alterado.' },
  ux_players_username: { status: 409, code: 'USERNAME_TAKEN', message: 'Esse nome já está em uso.' },

  // cadastro (v3). O Zod barra antes; estas são a última linha de defesa no banco.
  ux_players_email: { status: 409, code: 'EMAIL_TAKEN', message: 'Esse e-mail já está cadastrado.' },
  ck_players_email: { status: 400, code: 'INVALID_INPUT', message: 'E-mail inválido.' },
  ck_players_username: { status: 400, code: 'INVALID_INPUT', message: 'Nome de usuário inválido.' },
};

/** Regras do SERVIDOR (autorização e entrada), que o banco não cobre. */
export const SERVER_ERRORS = {
  rule_not_trainee: { status: 403, code: 'NOT_MISSION_TRAINEE', message: 'Só o aprendiz desta missão pode fazer isso.' },
  mission_not_found: { status: 404, code: 'MISSION_NOT_FOUND', message: 'Missão não encontrada.' },
  scroll_not_found: { status: 404, code: 'SCROLL_NOT_FOUND', message: 'Pergaminho não encontrado.' },
  unauthenticated: { status: 401, code: 'UNAUTHENTICATED', message: 'Faça login novamente.' },
  invalid_credentials: { status: 401, code: 'INVALID_CREDENTIALS', message: 'E-mail, usuário ou senha incorretos.' },
  service_unauthorized: { status: 401, code: 'SERVICE_UNAUTHORIZED', message: 'Acesso negado.' },
  invalid_input: { status: 400, code: 'INVALID_INPUT', message: 'Dados inválidos na requisição.' },
  route_not_found: { status: 404, code: 'NOT_FOUND', message: 'Rota não encontrada.' },
  cors_forbidden: { status: 403, code: 'CORS_FORBIDDEN', message: 'Origem não permitida.' },
  rate_limited: { status: 429, code: 'RATE_LIMITED', message: 'Muitas requisições. Espere um pouco e tente de novo.' },
} as const satisfies Record<string, PublicError>;

/** Erros sem constraint nomeada: decididos pelo SQLSTATE. */
const SQLSTATE_ERRORS: Readonly<Record<string, PublicError>> = {
  '23502': { status: 400, code: 'INVALID_INPUT', message: 'Campo obrigatório ausente.' },
  '23503': { status: 404, code: 'REFERENCE_NOT_FOUND', message: 'Jogador, missão ou pergaminho não encontrado.' },
  '23505': { status: 409, code: 'CONFLICT', message: 'Essa ação conflita com um registro existente.' },
  '23514': { status: 409, code: 'RULE_VIOLATION', message: 'Essa ação não é permitida pelas regras do jogo.' },
  '22P02': { status: 400, code: 'INVALID_INPUT', message: 'Dados inválidos na requisição.' },
  '22003': { status: 400, code: 'INVALID_INPUT', message: 'Valor numérico fora do limite.' },
  '40001': { status: 503, code: 'TRY_AGAIN', message: 'O servidor está ocupado. Tente de novo.' },
  '40P01': { status: 503, code: 'TRY_AGAIN', message: 'O servidor está ocupado. Tente de novo.' },
  '55P03': { status: 503, code: 'TRY_AGAIN', message: 'O servidor está ocupado. Tente de novo.' },   // lock_timeout
  '57014': { status: 503, code: 'TRY_AGAIN', message: 'O servidor está ocupado. Tente de novo.' },   // statement_timeout
};

const INTERNAL: PublicError = { status: 500, code: 'INTERNAL_ERROR', message: 'Algo deu errado. Tente de novo em instantes.' };

interface PgErrorLike {
  code: string;
  constraint?: string;
  severity?: string;
}

function isPgError(err: unknown): err is PgErrorLike {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  return typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && typeof e.severity === 'string';
}

/**
 * Converte qualquer erro em AppError público. O erro original fica em `cause`
 * (para log interno) e nunca vai na resposta.
 */
export function translateError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (isPgError(err)) {
    const byConstraint = err.constraint ? CONSTRAINT_ERRORS[err.constraint] : undefined;
    if (byConstraint) return new AppError(byConstraint, { cause: err });
    const bySqlState = SQLSTATE_ERRORS[err.code];
    if (bySqlState) return new AppError(bySqlState, { cause: err });
    return new AppError(INTERNAL, { cause: err });
  }

  // Erros do próprio Fastify (JSON malformado, content-type, corpo grande demais...)
  if (typeof err === 'object' && err !== null) {
    const e = err as { statusCode?: unknown; code?: unknown };
    if (typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500 && typeof e.code === 'string' && e.code.startsWith('FST_')) {
      return new AppError({ status: e.statusCode, code: 'BAD_REQUEST', message: 'Requisição inválida.' }, { cause: err });
    }
  }

  return new AppError(INTERNAL, { cause: err });
}
