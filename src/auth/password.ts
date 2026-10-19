import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/*
 * Hash de senha com o scrypt NATIVO do Node (node:crypto): nada para compilar no Render.
 *
 * Parâmetros: N = 2^14, r = 8, p = 5. É uma das combinações equivalentes que a OWASP
 * recomenda para scrypt (Password Storage Cheat Sheet), com 16 MiB de memória por hash.
 * Medido aqui: ~200 ms por hash num núcleo inteiro. No plano Free do Render (fração de CPU)
 * deve ficar perto de 1 a 2 s, o que é aceitável para cadastro e login e caro para quem
 * tenta adivinhar senhas.
 *
 * Formato gravado (estilo PHC), com os parâmetros dentro do próprio hash:
 *   $scrypt$ln=14,r=8,p=5$<sal base64>$<hash base64>
 * Assim dá para subir o custo no futuro sem invalidar as senhas antigas.
 */

export const SCRYPT_PARAMS = { ln: 14, r: 8, p: 5 } as const;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024;   // o padrão do Node (32 MiB) é o limite exato; folga para o overhead do OpenSSL

const PREFIX = '$scrypt$';
const HASH_FORMAT = /^\$scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize('NFC'), salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '');

/** Gera o hash de uma senha. Cada chamada usa um sal aleatório novo. */
export async function hashPassword(password: string): Promise<string> {
  const { ln, r, p } = SCRYPT_PARAMS;
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_LENGTH, { N: 2 ** ln, r, p, maxmem: MAX_MEMORY });
  return `${PREFIX}ln=${ln},r=${r},p=${p}$${b64(salt)}$${b64(key)}`;
}

/**
 * Confere a senha contra o hash gravado, em tempo constante na comparação.
 * Hash em formato inesperado (ou parâmetros absurdos) é "senha errada", nunca exceção.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = HASH_FORMAT.exec(stored);
  if (!m) return false;
  const [ln, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Limites de sanidade: um hash adulterado não pode pedir memória ou CPU sem fim.
  if (ln < 10 || ln > 20 || r < 1 || r > 32 || p < 1 || p > 16 || 128 * 2 ** ln * r > MAX_MEMORY) return false;
  const salt = Buffer.from(m[4]!, 'base64');
  const expected = Buffer.from(m[5]!, 'base64');
  // Tamanho exato: no scrypt, a chave curta é prefixo da longa, então um hash truncado "bateria".
  if (salt.length < 8 || expected.length !== KEY_LENGTH) return false;
  const actual = await scrypt(password, salt, KEY_LENGTH, { N: 2 ** ln, r, p, maxmem: MAX_MEMORY });
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Hash descartável, calculado uma vez. O login usa quando o e-mail/usuário não existe,
 * para gastar o mesmo tempo de uma senha errada: a resposta não revela se a conta existe.
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64'));
  return dummyHash;
}
