import { z } from 'zod';

const INT32_MAX = 2_147_483_647;
const uuid = z.string().uuid({ message: 'precisa ser um UUID' });
const catalogCode = z.string().regex(/^[A-Z][A-Z0-9_]*$/, { message: 'código inválido' });

export const IdParams = z.object({ id: uuid });

/**
 * Corpo do POST /missions. Não há sensei_id, xp_reward, reward_title_id nem status:
 * o que vier com esses nomes é descartado (o Zod remove chaves desconhecidas).
 * Limites aqui são só os de tipo do banco (int4); regra de jogo fica no banco.
 */
export const CreateMissionBody = z.object({
  trainee_id: uuid,
  mission_type: catalogCode,       // ex.: 'COLLECT_RESOURCE'
  difficulty: catalogCode,         // ex.: 'ADVANCED'
  target_code: z.string().min(1).max(64),
  target_quantity: z.number().int().positive().max(INT32_MAX).default(1),
  expires_in_minutes: z.number().int().positive().max(INT32_MAX).optional(),
});

/** Corpo do PATCH /internal/missions/:id/progress. */
export const ProgressBody = z.object({
  amount: z.number().int().positive().max(INT32_MAX),
});

/** Corpo do POST /missions/:id/evaluate. Sem evaluated_by: vem do JWT. */
export const EvaluateBody = z.object({
  approved: z.boolean(),
  score: z.number().int().min(1).max(5),
  // Conta caracteres como o banco (char_length), não unidades UTF-16: "🔥" vale 1, não 2.
  feedback: z.string().refine((s) => [...s].length <= 500, { message: 'máximo de 500 caracteres' }).optional(),
});
