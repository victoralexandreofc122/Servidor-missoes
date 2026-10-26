import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { WORLD_MAPS } from '../realtime/maps.js';

/*
 * Cliente web do jogo (pasta public/), servido pela própria API pública.
 *
 * Lista FECHADA de arquivos (texto e os PNG dos sprites), lidos uma vez na subida e servidos da memória: não existe
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
  /** Texto (HTML, JS, CSS) ou bytes (PNG dos sprites). */
  body: string | Buffer;
  contentType: string;
  etag: string;
}

/** Atlas dos monstros em public/assets/monsters/ (a lista bate com monsterData.js: test/monstros.test.ts confere). */
export const MONSTER_ART_TYPES = ['slime', 'lodo_escuro', 'lodo_sombrio', 'rei_lodo'] as const;

/** Folhas PNG de public/assets/<pasta>/ (a lista bate com vfxData.js e weaponData.js: test/static.test.ts confere). */
function sheets(folder: 'vfx' | 'weapons', names: readonly string[]) {
  return names.map((n) => ({ route: `/assets/${folder}/${n}.png`, file: `assets/${folder}/${n}.png`, contentType: 'image/png', binary: true as const }));
}

/** Bloco de chão do mapa em imagem (8 x 8 casas, como CHUNK em game.js), feito por arte/mapas/fatiar.py. */
export const MAP_ART_CHUNK = 8;

/** Blocos WebP (e o minimapa) de cada mapa com `art`: public/mapas/<art>/<cx>_<cy>.webp e mini.webp. */
function mapArt() {
  const out: { route: string; file: string; contentType: string; binary: true }[] = [];
  const seen = new Set<string>();
  for (const m of Object.values(WORLD_MAPS)) {
    if (!m.art || seen.has(m.art)) continue;
    seen.add(m.art);
    const names = ['mini'];
    for (let cy = 0; cy * MAP_ART_CHUNK < m.height; cy++) for (let cx = 0; cx * MAP_ART_CHUNK < m.width; cx++) names.push(`${cx}_${cy}`);
    for (const n of names) out.push({ route: `/mapas/${m.art}/${n}.webp`, file: `mapas/${m.art}/${n}.webp`, contentType: 'image/webp', binary: true });
  }
  return out;
}

const FILES = [
  { route: '/', file: 'index.html', contentType: 'text/html; charset=utf-8' },
  { route: '/game.js', file: 'game.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/targeting.js', file: 'targeting.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/world.js', file: 'world.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/mapArt.js', file: 'mapArt.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/character.js', file: 'character.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/movement.js', file: 'movement.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/politics.js', file: 'politics.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/endgame.js', file: 'endgame.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/adminPanel.js', file: 'adminPanel.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/prediction.js', file: 'prediction.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/styles.css', file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  { route: '/hud.css', file: 'hud.css', contentType: 'text/css; charset=utf-8' },
  // Personagem em sprites (arte/personagem-chibi): o desenhista, os dados e os atlas de cada gênero.
  { route: '/sprites.js', file: 'sprites.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/spriteData.js', file: 'spriteData.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/sprites/chibi_m.png', file: 'sprites/chibi_m.png', contentType: 'image/png', binary: true },
  { route: '/sprites/chibi_f.png', file: 'sprites/chibi_f.png', contentType: 'image/png', binary: true },
  // Efeitos dos golpes e armas em pixel art (arte/armas-vfx): o código, os dados e as folhas (abaixo, em VFX_SHEETS/WEAPON_SHEETS).
  { route: '/vfx.js', file: 'vfx.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/vfxData.js', file: 'vfxData.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/weapons.js', file: 'weapons.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/weaponData.js', file: 'weaponData.js', contentType: 'text/javascript; charset=utf-8' },
  ...sheets('vfx', [
    'slash', 'hit', 'punch', 'dust', 'smoke', 'fireball', 'explosion', 'water',
    'lightning', 'spark', 'shadow', 'bind', 'illusion', 'heal', 'stone', 'kunai', 'fuma',
  ]),
  ...sheets('weapons', ['kunai_training', 'kunai', 'tanto', 'katana', 'katana_mao', 'katana_bainha', 'fuma_shuriken', 'fuma_shuriken_mao', 'scroll']),
  // Monstros em sprites (v19, arte/monstros): o desenhista, os dados (gerados) e um atlas WebP por tipo.
  { route: '/monsterSprites.js', file: 'monsterSprites.js', contentType: 'text/javascript; charset=utf-8' },
  { route: '/monsterData.js', file: 'monsterData.js', contentType: 'text/javascript; charset=utf-8' },
  ...MONSTER_ART_TYPES.map((n) => ({ route: `/assets/monsters/${n}.webp`, file: `assets/monsters/${n}.webp`, contentType: 'image/webp', binary: true as const })),
  // Identidade visual (binários): favicon da Folha em Chamas e Pergaminho em Chamas do login.
  { route: '/img/favicon-32.png', file: 'img/favicon-32.png', contentType: 'image/png', binary: true },
  { route: '/img/favicon-192.png', file: 'img/favicon-192.png', contentType: 'image/png', binary: true },
  { route: '/img/apple-touch-icon.png', file: 'img/apple-touch-icon.png', contentType: 'image/png', binary: true },
  { route: '/img/login-bg.webp', file: 'img/login-bg.webp', contentType: 'image/webp', binary: true },
  { route: '/img/logo.webp', file: 'img/logo.webp', contentType: 'image/webp', binary: true },
  // Fonte da interface: Barlow Condensed (SIL Open Font License, public/fonts/OFL-barlow.txt), só o alfabeto latino.
  ...[500, 600, 700].map((w) => ({ route: `/fonts/barlow-condensed-${w}.woff2`, file: `fonts/barlow-condensed-${w}.woff2`, contentType: 'font/woff2', binary: true as const })),
  // Mapas em imagem (arte/mapas): os blocos de chão de cada mapa com `art`.
  ...mapArt(),
];

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
  return FILES.map((entry) => {
    const { route, file, contentType } = entry;
    let body: string | Buffer;
    try {
      body = 'binary' in entry && entry.binary ? readFileSync(new URL(file, dir)) : readFileSync(new URL(file, dir), 'utf8');
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
