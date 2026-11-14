import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { MUSIC_TRACKS, byteRange, loadPublicFiles, registerStaticFiles } from '../src/web/staticFiles.js';

/* v57: áudio (músicas em MP3 servidas com Range; efeitos sintetizados no cliente, public/audio.js). */
const A = await import(new URL('../public/audio.js', import.meta.url).href);

describe('v57: músicas', () => {
  it('toda faixa usada pelo cliente existe, é servida e é leve (MP3 sem capa)', () => {
    const used = new Set(Object.values<string[]>(A.MUSIC).flat());
    assert.deepEqual([...used].sort(), [...MUSIC_TRACKS].sort());
    for (const n of MUSIC_TRACKS) {
      const f = new URL(`../public/assets/audio/${n}.mp3`, import.meta.url);
      assert.ok(existsSync(f), n);
      assert.ok(statSync(f).size < 3_500_000, `${n}: ${statSync(f).size} bytes`);
    }
    const routes = new Set(loadPublicFiles().map((f) => f.route));
    assert.ok(routes.has('/audio.js'));
    for (const n of MUSIC_TRACKS) assert.ok(routes.has(`/assets/audio/${n}.mp3`), n);
  });

  it('cidade, arena, chefe e lugar tenso têm música; vitória e derrota também', () => {
    for (const mood of ['calma', 'pvp', 'boss', 'misterio', 'vitoria', 'derrota']) assert.ok(A.MUSIC[mood]?.length >= 1, mood);
    assert.equal(A.MUSIC.calma.length, 2, 'as duas calmas revezam');
  });

  it('volumes padrão: música 40%, efeitos 60%, sem mudo; os efeitos pedidos existem', () => {
    assert.deepEqual(A.DEFAULT_AUDIO, { music: 40, sfx: 60, mute: false });
    for (const k of ['slash', 'thud', 'charge', 'whoosh', 'step', 'blip', 'levelup', 'death']) assert.ok(A.SFX_KINDS.includes(k), k);
  });

  it('antes do primeiro toque nada toca (sem contexto de áudio)', () => {
    const a = new A.AudioManager();
    assert.equal(a.unlocked, false);
    assert.equal(a.sfx('slash'), null);
    a.setMood('pvp');
    assert.equal(a.current, null);
  });
});

describe('v57: Range (o Safari do iPhone só toca áudio com 206)', () => {
  it('byteRange', () => {
    assert.equal(byteRange(undefined, 100), undefined);
    assert.deepEqual(byteRange('bytes=0-', 100), [0, 99]);
    assert.deepEqual(byteRange('bytes=0-1', 100), [0, 1]);
    assert.deepEqual(byteRange('bytes=90-500', 100), [90, 99]);
    assert.deepEqual(byteRange('bytes=-10', 100), [90, 99]);
    assert.equal(byteRange('bytes=100-', 100), 'bad');
    assert.equal(byteRange('bytes=0-1,5-6', 100), undefined);
  });

  it('o servidor responde 206 com o pedaço certo; sem Range, o arquivo todo; texto não muda', async () => {
    const app = Fastify();
    registerStaticFiles(app, [
      { route: '/m.mp3', body: Buffer.from('0123456789'), contentType: 'audio/mpeg', etag: '"x"' },
      { route: '/t.js', body: 'abc', contentType: 'text/javascript', etag: '"y"' },
    ]);
    const part = await app.inject({ url: '/m.mp3', headers: { range: 'bytes=2-4' } });
    assert.equal(part.statusCode, 206);
    assert.equal(part.body, '234');
    assert.equal(part.headers['content-range'], 'bytes 2-4/10');
    assert.equal(part.headers['accept-ranges'], 'bytes');
    assert.equal((await app.inject({ url: '/m.mp3' })).body, '0123456789');
    assert.equal((await app.inject({ url: '/m.mp3', headers: { range: 'bytes=20-' } })).statusCode, 416);
    assert.equal((await app.inject({ url: '/t.js', headers: { range: 'bytes=0-0' } })).statusCode, 200);
    await app.close();
  });
});
