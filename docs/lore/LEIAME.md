# Lore e tutorial (docs/lore/)

Feito em 15/11/2026 a partir do "Manual Definitivo de Design Narrativo e Construção de Mundos em Jogos" enviado pelo
Victor. Cada arquivo é uma das camadas de documentação que o guia pede:

| Arquivo | Camada do guia | O que tem |
|---|---|---|
| `biblia-do-mundo.md` | Bíblia de Mundo (8 seções) | A fonte única de verdade: visão geral, geografia, cronologia com causa e efeito, culturas e fé, governo, as regras do chakra (Sanderson), economia, nomenclaturas e as contradições corrigidas |
| `ndd.md` | Documento de Design Narrativo | Premissa, 5 pilares, a Linha Contada/Jogada, a espinha autoral, escolhas reais e de textura (hub-and-spoke), pontos ambientais, reatividade, alinhamento ludonarrativo e os erros comuns |
| `personagens.md` | Character Briefs | Ficha de cada NPC: histórico, motivação, como fala, o que nunca diz, o que sabe |
| `artefatos.md` | Flavor text e narrativa ambiental | Os 17 fragmentos da Crônica espalhados pelos mapas: autor, voz, o que revelam e o que escondem |
| `dialogos.csv` | Planilha de diálogos | Cada fala do jogo com ID, personagem, texto, gatilho, arquivo de áudio e status. **Gerada** do jogo (`npx tsx scripts/gerar-dialogos.ts`); o teste confere |
| `tutorial.md` | Design de tutorial | O método em 3 etapas sala por sala, as 13 dicas na hora, a folha de controles e a comunicação diegética |
| `propostas-de-nomes.md` | — | Os nomes que a lore precisa e ainda não existem, com 3 opções cada |
| `mundo-aberto-proposta.md` | — | Proposta do mundo aberto em anéis (17/11/2026): tamanho, níveis por anel, os cinco arcos regionais e os nomes 14 a 25 (só proposta) |

**No jogo (v64):** `public/lore.js` (fragmentos, falas dos lojistas, dicas, controles), `public/dicas.js` (o cartão das
dicas), `public/manual.js` (Códice e folha de controles no Manual), `src/realtime/falas.ts` (falas dos professores) e o
capítulo II da Crônica (`src/realtime/worldProgress.ts`). Sem migração de banco.

**Hierarquia quando dois textos discordam:** Bíblia > NDD > roteiros (`docs/historia/`) > textos do jogo. Achou uma
contradição? Ela vai para a seção 9 da Bíblia até ser corrigida nos dois lados.
