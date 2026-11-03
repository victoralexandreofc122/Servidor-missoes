# Revisão EGM: Jutsus v2

Jogo: "Vontade do Fogo", MMORPG ninja 2D (Node + Canvas), celular deitado e computador. PvP 1x1 rankeado já existe
e foi balanceado (`src/realtime/pvpBalance.ts`, simulador `src/realtime/pvpSim.ts`, plano `concepts_brief.md` no
branch brainstorm-pvp-invocacoes não está aqui; o resumo está na seção 1 do documento).

O dono (Victor) mandou o PDF `especificacao-original.pdf` (10 árvores, ~100 jutsus, clãs Nara e Uchiha) e pediu
para aplicar as ideias no jogo "com balanceamento nas descrições e ideias". O Claude escreveu a adaptação em
`docs/jutsus-v2.md`. Revise a ADAPTAÇÃO (não o PDF): ela está equilibrada, cabe no jogo e mantém o que o Victor quer?

Código para conferir: `src/realtime/jutsus.ts` (classes, tiers, números), `src/realtime/pvpBalance.ts`,
`src/realtime/effects.ts`, `src/realtime/stats.ts`.
