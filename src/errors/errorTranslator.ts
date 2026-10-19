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
