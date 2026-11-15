/*
 * v64: gera docs/lore/dialogos.csv, a planilha de diálogos (o formato do guia de design narrativo: ID único, personagem,
 * texto, gatilho/condição, arquivo de áudio, status de produção). A fonte é o PRÓPRIO jogo: as falas dos professores
 * (src/realtime/falas.ts), a Crônica das Eras (src/realtime/worldProgress.ts) e os fragmentos, lojistas e dicas
 * (public/lore.js). O teste test/lore.test.ts confere que a planilha está igual ao jogo.
 *
 * Uso: npx tsx scripts/gerar-dialogos.ts
 */
import { writeFileSync } from 'node:fs';
import { todasAsFalas } from '../src/realtime/falas.js';
import { CHRONICLE } from '../src/realtime/worldProgress.js';

const NPC_NAME: Record<string, string> = {
  tutor_dummies: 'Professora Aya', tutor_meditation: 'Professor Daichi', tutor_jutsu: 'Professor Kenji', tutor_weapons: 'Professora Mei',
};
const KEEPER: Record<string, string> = { weapons: 'Ferreiro Tetsu', clothes: 'Costureira Hana', scrolls: 'Sábio Ren' };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** Uma célula CSV (aspas quando precisa). */
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function buildRows(): Promise<string[][]> {
  const lore = await import(new URL('../public/lore.js', import.meta.url).href);
  const rows: string[][] = [['ID', 'Personagem', 'Texto', 'Gatilho / Condição', 'Arquivo de Áudio', 'Status de Produção']];
  const voice = (id: string) => `vo_${id.toLowerCase()}.ogg`;
  for (const f of todasAsFalas()) rows.push([f.id, NPC_NAME[f.npc] ?? f.npc, f.text, `Falar com ${NPC_NAME[f.npc] ?? f.npc}; ${f.quando}`, voice(f.id), 'No jogo (texto); voz pendente']);
  for (const [kind, list] of Object.entries(lore.SHOP_BARKS as Record<string, { id: string; text: string }[]>)) {
    for (const b of list) rows.push([b.id, KEEPER[kind] ?? kind, b.text, `Abrir a loja (${KEEPER[kind] ?? kind}); rodízio`, voice(b.id), 'No jogo (texto); voz pendente']);
  }
  CHRONICLE.forEach((c, i) => rows.push([`CRN_${ROMAN[i]}`, 'O Cronista', `${c.title}. ${c.text}`, `Falar com O Cronista; marco do mundo >= ${c.min}`, voice(`CRN_${ROMAN[i]}`), 'No jogo (texto); voz pendente']));
  for (const f of lore.FRAGMENTS as { id: string; title: string; por: string; text: string; lugar: string; x: number; y: number }[]) {
    rows.push([f.id, f.por, `${f.title}: ${f.text}`, `Chegar perto do brilho em ${f.lugar} (${f.x}, ${f.y}); depois da Academia`, '—', 'No jogo (texto; documento, sem voz)']);
  }
  for (const h of lore.HINTS as { id: string; quando: string; text: string }[]) rows.push([h.id, 'Dica na hora (interface)', h.text, `${h.quando}; uma vez por aparelho`, '—', 'No jogo (texto; interface, sem voz)']);
  return rows;
}

export async function buildCsv(): Promise<string> {
  return (await buildRows()).map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

if (process.argv[1]?.endsWith('gerar-dialogos.ts')) {
  const csv = await buildCsv();
  writeFileSync(new URL('../docs/lore/dialogos.csv', import.meta.url), csv);
  console.log(`docs/lore/dialogos.csv: ${csv.trim().split('\n').length - 1} linhas`);
}
