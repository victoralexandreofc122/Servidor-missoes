import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ITEMS } from '../src/realtime/items.js';
import { JUTSUS } from '../src/realtime/jutsus.js';
import { POWERS } from '../src/realtime/akatsuki.js';
import { REALTIME } from '../src/realtime/config.js';
import { VILLAGE_INFO, villageFullName } from '../src/realtime/villages.js';

/*
 * Fase 1 (nomes): nenhum nome que o jogador vê pode ser da série. Esta lista é a trava: se um nome proibido voltar para
 * o catálogo, a UI ou as mensagens, o teste falha. Os IDs internos (fire_endan, akatsuki_*, vale_estatuas) não contam.
 */

const PROIBIDOS = [
  'sharingan', 'mangeky', 'susanoo', 'amaterasu', 'tsukuyomi', 'izanagi', 'izanami', 'chidori', 'rasengan', 'rasenshuriken',
  'kirin', 'byakug', 'kage mane', 'kage bunshin', 'kage nui', 'akatsuki', 'uchiha', 'nara', 'tsunade', 'hokage', 'naruto',
  // traduções diretas que já foram trocadas (v21)
  'chamas negras', 'lua ilusória', 'guardião espectral', 'olho da percepção', 'palma mística', 'bisturi de chakra', 'costura de sombra',
  'templo do nirvana', 'pântano do submundo', 'chamas da fênix', 'destruição magnífica', 'dragão d’água', 'clone de água', 'prisão de água',
  'ocultação na névoa', 'dragões gêmeos', 'esferas de vácuo', 'estrela espiral', 'regeneração mitótica', 'xarope pegajoso',
  'argila viva', 'fios de marionete', 'corvos da ilusão', 'cinco corações', 'chuva de papel',
];

const visiveis = [
  ...JUTSUS.map((j) => ['jutsu ' + j.code, j.name] as const),
  ...ITEMS.map((i) => ['item ' + i.code, i.name] as const),
  ...POWERS.map((p) => ['poder ' + p.code, p.name + ' ' + p.text] as const),
  ...Object.values(REALTIME.maps).map((m) => ['mapa ' + m.id, m.name] as const),
  ...REALTIME.npcs.map((n) => ['npc ' + n.id, n.name] as const),
];

describe('Fase 1: nomes originais', () => {
  it('nenhum nome visível (jutsu, item, poder, mapa, NPC) contém nome da série', () => {
    for (const [onde, nome] of visiveis) {
      const baixo = nome.toLowerCase();
      for (const proibido of PROIBIDOS) {
        // "nara" só conta como palavra inteira (não dentro de "narrativa")
        const achou = proibido === 'nara' ? new RegExp('\\bnara\\b').test(baixo) : baixo.includes(proibido);
        assert.ok(!achou, `${onde}: "${nome}" contém "${proibido}"`);
      }
    }
  });

  it('nomes de jutsu não se repetem (o jogador não confunde dois jutsus)', () => {
    const vistos = new Map<string, string>();
    for (const j of JUTSUS) {
      assert.ok(!vistos.has(j.name), `"${j.name}" repetido em ${vistos.get(j.name)} e ${j.code}`);
      vistos.set(j.name, j.code);
    }
    assert.equal(vistos.size, 96);
  });

  it('a UI e as mensagens do jogador não dizem "Akatsuki" (o nome interno fica só em código, comentários e IDs)', () => {
    const texto = ['public/index.html', 'public/endgame.js', 'public/adminPanel.js', 'src/errors/errorTranslator.ts']
      .map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8'))
      .join('\n')
      // sem comentários nem identificadores minúsculos (akatsuki_*, 'akatsuki', data-tab="akatsuki")
      .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l)).join('\n');
    assert.ok(!/Akatsuki/.test(texto), 'sobrou "Akatsuki" com A maiúsculo em texto de tela');
  });

  it('aldeias: o nome completo usa o artigo certo (da Chama Eterna, da Maré Oculta, do Vento Cortante, da Rocha Antiga)', () => {
    assert.deepEqual((['vila_1', 'vila_3', 'vila_4', 'vila_5'] as const).map(villageFullName),
      ['Aldeia da Chama Eterna', 'Aldeia da Maré Oculta', 'Aldeia do Vento Cortante', 'Aldeia da Rocha Antiga']);
    // Nuvem = Vento Cortante e Areia = Rocha Antiga (documento canônico, docs/endgame-visao.md)
    assert.deepEqual([VILLAGE_INFO.vila_4.slug, VILLAGE_INFO.vila_5.slug], ['vento', 'rocha']);
    assert.equal(REALTIME.maps.vila_nuvem?.name, 'Aldeia do Vento Cortante');
    assert.equal(REALTIME.maps.vila_areia?.name, 'Aldeia da Rocha Antiga');
  });
});
