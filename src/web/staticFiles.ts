import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';

/*
 * Cliente web do jogo (pasta public/), servido pela própria API pública.
 *
 * Lista FECHADA de arquivos, lidos uma vez na subida e servidos da memória: não existe
 * caminho vindo da URL chegando no disco, então não há "../" nem arquivo escondido para
 * vazar (.env, código). Para muitos arquivos (sprites, sons), trocar por @fastify/static.
 *
 * Cabeçalhos de segurança:
 *  - CSP: só scripts e estilos do próprio servidor (nada inline). Mesmo que alguém consiga
 *    injetar HTML pelo chat, o navegador não executa script injetado, então o token no
 *    localStorage fica protegido.
 *  - nosniff, sem Referer, sem iframe de outro site.
 * Cache: "no-cache" + ETag. O celular revalida e recebe 304 quando nada mudou, e pega a
 * versão nova logo depois de um deploy.
 */

export interface StaticFile {
  route: string;
  body: string;
  contentType: string;
  etag: string;
}

const FILES = [
  { route: '/', file: 'index.html', contentType: 'text/html; charset=utf-8' },
  { route: '/game.js', file: 'game.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/targeting.js', file: 'targeting.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/village.js', file: 'village.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/character.js', file: 'character.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/movement.js', file: 'movement.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/prediction.js', file: 'prediction.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/styles.css', file: 'styles.css', contentType: 'text/css; charset=utf-8' },
] as const;

/** public/ fica na raiz do projeto: dois níveis acima de src/web/ (dev) e de dist/web/ (Render). */
export const PUBLIC_DIR = new URL('../../public/', import.meta.url);

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

export function loadPublicFiles(dir: URL = PUBLIC_DIR): StaticFile[] {
  return FILES.map(({ route, file, contentType }) => {
    let body: string;
    try {
      body = readFileSync(new URL(file, dir), 'utf8');
    } catch {
      throw new Error(`Cliente web: arquivo public/${file} não encontrado. Confira se a pasta public/ foi enviada ao GitHub.`);
    }
    const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`;
    return { route, body, contentType, etag };
  });
}

export function registerStaticFiles(app: FastifyInstance, files: readonly StaticFile[]): void {
  for (const file of files) {
    app.get(file.route, async (request, reply) => {
      reply
        .header('content-type', file.contentType)
        .header('cache-control', 'no-cache')
        .header('etag', file.etag)
        .header('x-content-type-options', 'nosniff')
        .header('referrer-policy', 'no-referrer');
      if (file.contentType.startsWith('text/html')) {
        reply.header('content-security-policy', CONTENT_SECURITY_POLICY).header('x-frame-options', 'DENY');
      }
      if (request.headers['if-none-match'] === file.etag) return reply.code(304).send();
      return reply.code(200).send(file.body);
    });
  }
}
