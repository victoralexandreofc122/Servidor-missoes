import { z } from 'zod';

/** Conta caracteres como o banco (char_length): "é" ou "🔥" valem 1. */
const length = (s: string) => [...s].length;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;   // teto: senha gigante só serviria para gastar CPU do scrypt

/** Mesmos limites do banco (ck_players_username: 3 a 24, sem espaço nas pontas), mais um alfabeto seguro. */
const Username = z
  .string()
  .regex(/^[A-Za-z0-9_]{3,24}$/, { message: 'use de 3 a 24 caracteres: letras sem acento, números ou _' });

/** E-mail normalizado como o banco exige (ck_players_email): minúsculo e sem espaço nas pontas. */
const Email = z.string().trim().toLowerCase().max(254, { message: 'máximo de 254 caracteres' }).email({ message: 'e-mail inválido' });

/**
 * POST /auth/register. Senha forte: 10 a 128 caracteres, com minúscula, maiúscula e número,
 * e sem conter o nome de usuário. As mensagens nunca repetem a senha.
 */
export const RegisterBody = z
  .object({
    username: Username,
    email: Email,
    password: z.string(),
  })
  .superRefine((body, ctx) => {
    const pw = body.password;
    const problem = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message });
    if (length(pw) < PASSWORD_MIN) problem(`mínimo de ${PASSWORD_MIN} caracteres`);
    if (length(pw) > PASSWORD_MAX) problem(`máximo de ${PASSWORD_MAX} caracteres`);
    if (!/\p{Ll}/u.test(pw)) problem('precisa de pelo menos uma letra minúscula');
    if (!/\p{Lu}/u.test(pw)) problem('precisa de pelo menos uma letra maiúscula');
    if (!/\p{Nd}/u.test(pw)) problem('precisa de pelo menos um número');
    if (body.username.length >= 3 && pw.toLowerCase().includes(body.username.toLowerCase())) {
      problem('não pode conter o nome de usuário');
    }
  });

/**
 * POST /auth/login. Entra com `email` OU `username` (exatamente um) e a senha.
 * Aqui não se aplica a regra de senha forte: só o teto de tamanho.
 */
export const LoginBody = z
  .object({
    email: Email.optional(),
    username: z.string().min(1).max(64).optional(),
    password: z.string().min(1).max(PASSWORD_MAX * 4),
  })
  .superRefine((body, ctx) => {
    if ((body.email === undefined) === (body.username === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'informe o e-mail ou o nome de usuário (um dos dois)' });
    }
  });

export type RegisterInput = z.infer<typeof RegisterBody>;
export type LoginInput = z.infer<typeof LoginBody>;
