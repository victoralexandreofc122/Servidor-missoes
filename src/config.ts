import { z } from 'zod';

/** Origem exata de navegador: esquema + host (+ porta), sem caminho nem barra final. */
const OriginSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value;
  } catch {
    return false;
  }
}, { message: 'origem inválida (use só esquema://host[:porta], sem "/" no final)' });

/** CSV -> lista de origens. Vazio (padrão) = nenhuma origem cross-origin permitida. */
const AllowedOrigins = z
  .string()
  .default('')
  .transform((csv) => csv.split(',').map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(OriginSchema));

/** Como o Fastify deve tratar X-Forwarded-For. "true" (padrão), "false", nº de proxies ou lista de IPs. */
const TrustProxy = z
  .string()
  .default('true')
  .transform((v): boolean | number | string => {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^\d+$/.test(s)) return Number(s);
    return v.trim();
  });

export type TrustProxySetting = boolean | number | string;

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa de pelo menos 32 caracteres'),
  JWT_ISSUER: z.string().min(1).optional(),
  JWT_AUDIENCE: z.string().min(1).optional(),
  SERVICE_TOKEN: z.string().min(32, 'SERVICE_TOKEN precisa de pelo menos 32 caracteres'),
  PUBLIC_HOST: z.string().default('0.0.0.0'),
  /** Porta pública. O Render injeta PORT sozinho (hoje 10000); localmente, 3000. */
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  /** API interna: só em 127.0.0.1. O Render só encaminha tráfego externo para PORT. */
  INTERNAL_HOST: z.string().default('127.0.0.1'),
  INTERNAL_PORT: z.coerce.number().int().positive().max(65535).default(3001),
  ALLOWED_ORIGINS: AllowedOrigins,
  TRUST_PROXY: TrustProxy,
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_SENSITIVE_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${problems}`);
  }
  if (parsed.data.JWT_SECRET === parsed.data.SERVICE_TOKEN) {
    throw new Error('Configuração inválida: JWT_SECRET e SERVICE_TOKEN precisam ser diferentes');
  }
  if (parsed.data.PORT === parsed.data.INTERNAL_PORT) {
    throw new Error('Configuração inválida: PORT e INTERNAL_PORT precisam ser diferentes');
  }
  return parsed.data;
}

/**
 * Aviso de boot: em produção, atrás de proxy/load balancer, trustProxy=false faz
 * request.ip virar o IP do proxy (logs e futuros limites por IP ficam errados).
 */
export function trustProxyWarning(config: Pick<Config, 'NODE_ENV' | 'TRUST_PROXY'>): string | undefined {
  if (config.NODE_ENV === 'production' && config.TRUST_PROXY === false) {
    return 'TRUST_PROXY=false em produção: request.ip será o IP do proxy, não o do jogador';
  }
  return undefined;
}
