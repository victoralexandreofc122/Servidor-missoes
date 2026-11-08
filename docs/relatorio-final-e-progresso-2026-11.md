---
title: "Vontade do Fogo: versão final e progresso atual"
subtitle: "Relatório para o Victor · 8 de novembro de 2026"
---

# 1. Resumo

O jogo roda no navegador (celular deitado e computador), com servidor autoritativo em Node e TypeScript, banco Postgres
no Neon e cliente em Canvas 2D sem engine.

- **Versão publicada na `main`:** v29 (modo rankeado no Vale das Estátuas, PRs #11 e #13).
- **Em andamento:** Jutsus v2 (branch `jutsus-v2`). A entrega 0 (base nova) e a entrega 1 (zona no chão e aviso de
  golpe) estão prontas e verificadas. A entrega 2 (Fogo novo) está pela metade, salva em um patch.
- **Testes:** 556 passando com `npm run verify` (typecheck, testes e build).
- **Pendência de banco:** a migração **v16** (jutsus novos) ainda não foi escrita nem rodada.

# 2. Como o jogo deve ficar na versão final

Esta é a visão de produto, do que o Victor já decidiu ou pediu até aqui.

**Mundo.** Vila da Folha (80 x 80, com lojas com interior e Academia), vilas da Névoa, Nuvem e Areia, Floresta
(100 x 100), Caverna do Lodo, Clareira Queimada, Poço sob a Praça, Zona de Conflito, Refúgio dos Renegados e o Vale das
Estátuas (modo rankeado). Clima e dia e noite afetam o combate.

**Progressão.** Rank da Academia até Kage, níveis até 60. Classes (Cura, Sombra, Ilusão, Pedra, Fogo, Água, Taijutsu,
Armas, Relâmpago), Extração por pergaminho, tier de 1 a 4, e nível de uso (maestria) por jutsu. Dois kits de até 4
jutsus, com troca no combate.

**Combate.** Jutsus por elemento com efeitos (queimadura, paralisia, silêncio, sono, lentidão, ferida). Habilidades
em linha nas 4 direções. Monstros com máquina de estados e o chefe Rei Lodo. No PvP: tabela de equilíbrio própria,
orçamento de controle (1,5 s por golpe e 2,5 s a cada 15 s), rede de segurança (ninguém perde mais de 50% da vida em 2
s para um atacante) e simulador de duelos no `npm run verify`.

**Social e fim de jogo.** Vilas com Kage eleito, diplomacia (guerra, aliança, trégua), renegados, Akatsuki, Zona de
Conflito com ranking e temporadas de 60 dias. Ainda falta grupo, amigos e sensei (o social), e o sistema de história
do Arco 1.

**Clãs (proposta, aprovada em parte).** Linhagem escolhida no Criador, com despertar por missão no rank Genin. Quem não
escolhe é Andarilho. Dois clãs: Uchiha (primeiro) e Nara (a classe Sombra vira este clã). Nomes da série.

**Jutsus v2 (proposta).** Todos os jutsus do documento do Victor adaptados ao jogo: 94 jutsus, com tempo de
conjuração (faixas de 0 a 1,2 s) e interrupção por controle duro. O Médico mantém o Soco Tsunade.

# 3. Progresso por frente

| Frente | Estado | Onde está |
|---|---|---|
| Combate básico, classes, Extração, mapas, fim de jogo | Pronto (v5 a v28) | `README.md` |
| PvP: equilíbrio, orçamento de controle, rede de segurança, simulador | Pronto (v28, passo 1 do duelo) | `README.md`, `src/realtime/pvpBalance.ts` |
| Modo rankeado: Vale, fila, partida melhor de 3, pontos, temporadas, ranking, faixas | Pronto e na `main` (v29) | `src/realtime/duel.ts`, `docs/endgame.md` |
| Rankeado: anti-abuso, 15 s para reconectar, partida anulada, W.O. | Pronto (v29) | `src/realtime/gameWorld.ts` |
| Tela cheia e celular só deitado | Pronto (não testado num Android real) | `public/game.js` |
| Floresta feita por código (pilar de colisão e arte) | Piloto parado (revisão 4: 8,5 / 7,5 / 8,8) | `revisao_egm/floresta/` |
| Jutsus v2: proposta, adaptações dos 94 jutsus | Pronto como proposta | `docs/jutsus-v2.md`, `revisao_egm/jutsus/` |
| Jutsus v2 entrega 0: forma do jutsu e números por jutsu | Pronto e verificado | branch `jutsus-v2` |
| Jutsus v2 entrega 1: zona no chão e aviso de golpe | Pronto e verificado (sem jutsu usando ainda) | branch `jutsus-v2` |
| Jutsus v2 entrega 2: Fogo com 7 jutsus novos | **Em andamento**, salvo em patch | `revisao_egm/jutsus/entrega2-em-andamento.patch` |
| Conjuração e interrupção | Definido pelos Goldfish; implementação parcial (ver 3.3) | `revisao_egm/jutsus/conjuracao_*.md` |
| Cabeça (rosto e cabelo) desenhada à mão | Pendente (reprovado o gerado por formas 3D) | — |
| Site no Floot (páginas, login, admin, notificações) | Pendente | — |
| Salas com imagem (Areia, Alfaiataria, Academia, Caverna, Clareira, Refúgio) | Aguarda imagens do Victor | — |
| Arco 1 jogável (sistema de história) e social | Pendente | `docs/historia/arco-1.md` |

## 3.1 Modo rankeado (v29)

- **Fluxo:** botão Rankeado no menu, Vale das Estátuas, botão Desafio na tela, fila, partida melhor de 3 (10 s de
  preparação, rodadas de até 50 s), tela de resultado com pontos, ryō e faixa, e botão Jogar de novo.
- **Fila:** quem entrou primeiro luta primeiro; adversário de nível parecido entre os 4 seguintes; ninguém passado mais
  de 2 vezes; evita repetir a dupla.
- **Pontos:** Elo com K = 24 e fator do novato (primeiras 30 partidas); 30 ryō na vitória e 10 na derrota quando a
  partida conta; temporadas de 60 dias com recompensa (Campeão, Elite, Veterano).
- **Regras de saída:** depois que a luta começa, ninguém sai pelo Voltar. Cair da conexão na preparação cancela sem
  pontos; na luta, a pessoa tem 15 s para voltar (o placar mostra a contagem).
- **Anulada e W.O.:** partida sem nenhum dano é anulada, sem pontos. Quem sai depois de haver dano perde por W.O.
- **Arquibancadas:** dos dois lados da arena; dá para sentar e, sentado, assistir ou parar de assistir.
- **Revisões Goldfish (rodada 5):** jogabilidade 8,5; estilo 7,5; celular 9.

## 3.2 Jutsus v2

**Decisões do Victor (03/11).** Linhagem mais despertar; nomes da série; Sombra vira Clã Nara; Fogo primeiro, depois o
Clã Uchiha; **todos os jutsus do PDF entram**; o Médico mantém o Soco Tsunade; cada jutsu ganha tempo de conjuração,
e os poderosos têm um tempo maior que pode ser interrompido.

**Adaptações (`revisao_egm/jutsus/adapt_*.md`).** 94 jutsus no total, com tier, forma, números na escala do jogo,
maestria, texto curto para o jogador e sistema novo exigido. Nenhum passa dos limites do PvP: raio até 5 casas,
controle até 1,5 s por golpe, sem invulnerabilidade.

**Entrega 0 (pronta).** Cada jutsu tem uma forma (linha que explode, cone, avanço, anel, escudo, leque...) e pode ter
números próprios. O lançamento escolhe o comportamento pela forma. Um teste compara todos os números com uma foto de
antes, e nada mudou.

**Entrega 1 (pronta).** Zona no chão (fogo, lama, cura: dano, lentidão ou cura a cada segundo) e aviso de golpe (um
círculo se enche e o dano cai no fim). Mesmo caminho de dano dos jutsus de hoje, então o equilíbrio do PvP vale.
Três testes novos. Ainda não há jutsu usando, e o desenho no navegador não foi conferido.

**Entrega 2 (em andamento).** Fogo com 7 jutsus novos: Karyū Endan, Hibashiri, Kasumi Enbu, Hōsenka, Ryūka, Haisekishō,
Lâmina de Fogo, Gōka Messhitsu, Karyū Hōtan e Tenrai Gōen. O patch `revisao_egm/jutsus/entrega2-em-andamento.patch`
tem o que já foi escrito: os tipos, o cadastro dos jutsus com números próprios e a forma no lançamento. **Falta:**
atualizar os testes que mudaram de propósito (números de fire_2 a fire_4 e do catálogo), a migração v16 e o
desenho no cliente.

## 3.3 Conjuração e interrupção

- **Faixas:** instantâneo (0), rápido (0,2 a 0,3 s), médio (0,5 a 0,6 s), longo (0,8 a 1,0 s) e ritual (1,2 s).
  Resultado: 44 instantâneos, 21 rápidos, 18 médios, 7 longos e 4 rituais.
- **Movimento:** rápido e médio andam a 50%; longo, ritual e corpo a corpo ficam parados.
- **Recompensa:** médio +5% de dano; longo +10%; ritual +15%. Toda conjuração de 0,5 s ou mais tem recarga 10% menor.
- **Interrompe:** controle duro (atordoar, prender, levantar, silêncio, puxão), empurrão de 1,5 casa ou mais, e os
  jutsus marcados. **Dano comum não interrompe.**
- **Interrompido:** metade do chakra de volta, recarga de 1,5 s e 3 s de Concentração.
- **Implementado até agora:** o protocolo, o campo de conjuração no servidor, a interrupção por controle, e a regra de
  velocidade. **Falta:** ligar aos jutsus da entrega 2, a barra sobre a cabeça no cliente e os testes.

## 3.4 Floresta (piloto de mapa por código)

Pausada a pedido do Victor. A última rodada dos revisores (rodada 4) deu colisão 8,5, estilo 7,5 e celular 8,8. Pendências
registradas em `revisao_egm/floresta/relatorio_rodada4.md`: o platô do paredão parece grama e bloqueia, a pedra da
Pedra-Selo 1 tem piso creme, o pinheiro da beira do abismo bloqueia a copa inteira, e o Carvalho com o boneco em cima
do tronco.

# 4. O que falta, em ordem

1. **Jutsus v2, entrega 2:** Fogo novo. Atualizar os testes, aplicar o patch, escrever a migração v16 (`INSERT ... ON
   CONFLICT` dos jutsus novos em `game.jutsus`; nenhum código antigo é renomeado ou apagado), testar no simulador e no
   navegador.
2. **Conjuração no Fogo:** ligar os tempos da tabela aos jutsus, a barra sobre a cabeça e o aviso de interrupção.
3. **Jutsus v2, entregas 3 a 5:** buff de Básico e escudo com vida; Clã Uchiha com linhagem no Criador, missão de
   despertar e Andarilho (migração v17, coluna `clan`); depois uma classe por vez, cada uma no simulador.
4. **Rankeado, polimento:** arquibancada em degraus de pedra mais marcados, estátua com mais tons, selo redondo de faixa,
   aviso sonoro de "você é o próximo" e o "Próximo: X x Y" para quem assiste.
5. **Testes que faltam:** tela cheia num Android real; partida real que termine com subida de faixa (as telas de exemplo
   não mostraram isso); reconexão de 15 s num celular de verdade.
6. **Cabeça desenhada à mão**, Site no Floot, Salas com imagem (aguardando as imagens do Victor), Arco 1 e social.

# 5. Decisões que dependem do Victor

- Confirmar o Clã Uchiha como primeiro clã e os nomes da série (risco de marca registrado; reavaliar antes de qualquer
  item pago).
- Aprovar a regra de conjuração (dano não interrompe; só controle e jutsus marcados).
- Decidir se o Susanoo Perfeito e o Tsukuyomi entram no PvP ou ficam como poderes de evento.
- Confirmar a recompensa do rankeado (30 e 10 ryō) e se o rankeado conta pontos de Admin (não conta, hoje).

# 6. Como continuar em outra janela

**Branches.** A `main` tem a v29. O trabalho atual está no branch `jutsus-v2` (publicado no GitHub). Antes de mesclar
o `jutsus-v2` na `main`, rodar `npm run verify` e a migração v16 no Neon, se já existir.

**Ler antes de mexer:**

- `CLAUDE.md`: regras do projeto (verificação, migrações, segredos, skill task-observer).
- `README.md`: o que cada versão fez e se precisa de migração (seção v29 e esta).
- `docs/jutsus-v2.md`: a proposta da entrega de jutsus, com as decisões.
- `revisao_egm/jutsus/`: as adaptações de cada jutsu, as revisões e `entrega2-em-andamento.patch`.
- `docs/endgame.md`: regras do fim de jogo e do ranking.

**Para rodar no computador (local, banco de teste):** o servidor sobe com `npm run dev` (ou `src/server.ts` com as
variáveis de `DEPLOY.md`), e o banco é o Postgres local. Não usar segredos reais fora do Render.

**Regras que não podem ser quebradas:**

- `npm run verify` tem que passar antes de qualquer commit.
- Migrações: sem blocos `DO $$`, tudo em `BEGIN; ... COMMIT;`, rodáveis duas vezes, e sempre no Neon antes do código.
- Segredos (`DATABASE_URL`, `JWT_SECRET`, `SERVICE_TOKEN`) só no Render.
- Mudança visual: conferir no navegador e mostrar imagens ao Victor.
- Não criar pull request sem o Victor pedir.

# 7. Números

| Medida | Valor |
|---|---|
| Testes automáticos | 556 passando |
| Versão publicada | v29 |
| Jutsus adaptados (PDF) | 94 |
| Revisões Goldfish feitas no rankeado | 5 rodadas, com 3 revisores cada |
| Notas finais do rankeado (rodada 5) | jogabilidade 8,5; estilo 7,5; celular 9 |
| Notas da Floresta (rodada 4) | colisão 8,5; estilo 7,5; celular 8,8 |
| Notas da proposta de jutsus | equilíbrio 6; escopo 5; fantasia 6,5 |
