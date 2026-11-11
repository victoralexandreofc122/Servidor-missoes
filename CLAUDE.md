# Herança do Fogo: servidor-missoes

MMORPG ninja em pixel art chibi, para o navegador do celular (deitado) e do computador. O dono do projeto é o
Victor: ele escreve em português e quer as respostas em português do Brasil.

## O jogo em resumo

- **Gênero:** MMORPG de ação 2D, combate em tempo real, progressão por rank (Academia, Genin…), níveis até 60.
- **Tecnologia:** servidor autoritativo em Node e TypeScript (Fastify + WebSocket), Postgres no **Neon**, cliente em
  Canvas 2D sem engine (`public/`). O Render publica a `main` sozinho.
- **Mundo:** Aldeia da Chama Eterna 80x80 (lojas com interior, Academia), Aldeias da Maré Oculta, Vento Cortante (antes Nuvem) e Rocha Antiga (antes Areia) (antes Folha, Névoa, Nuvem e Areia; a Pedra saiu na v20),
  Floresta 100x100, Caverna do Lodo, Clareira Queimada, Poço sob a Praça, Zona de Conflito e Refúgio dos Renegados.
- **Sistemas prontos:** combate com jutsus por elemento e efeitos (queimadura, silêncio, paralisia…), habilidades em
  linha nas 4 direções, monstros com máquina de estados e o chefe Rei Lodo, classes, Extração, armas com jeito próprio,
  Tela de Equipamentos (arma, capa, pés, acessório, pergaminho), clima e dia/noite, fim de jogo (Kage eleito,
  diplomacia, Zona de Conflito com MMR e temporadas de 60 dias, renegados, Akatsuki), Painel do Admin e API `/site/*`.
- **Personagem:** desenhado por código (`public/rig.js` esqueleto 3D, `public/rigArt.js` camadas e física do pano,
  `public/figure.js` cache e giro). Detalhes em `arte/personagem-rig/LEIAME.md`. O estilo segue a folha de referência
  do Victor (chibi, contorno escuro, sombreado em 2-3 tons). Toda mudança de arte é comparada lado a lado com a
  referência e conferida dentro do jogo antes de fechar.
- **Versão atual:** v29 (modo rankeado no Vale dos Guardiões, migração v15), publicada na `main`. Pronto e esperando o
  Victor (branch, migrações v16 a v29 nessa ordem; bônus de XP do admin com `/admin bonusxp` (v29); o admin muda a patente com `/admin patente` (v23) e reseta as próprias classes com `/admin resetarclasses` (v24); pergaminho único e jutsu só da própria classe (v24); linhagem no Criador, Rito do Despertar e Clã Umbra (v25); Pergaminho do Mestre, nota do Pré-Alpha e Feedback no jogo (v26)): Jutsus v2 com 96 jutsus (10 classes, Vento nova, e o
  Clã Rubro), conjuração, sistemas próprios (muros, invocações, escuridão...), clãs por linhagem, controle mais forte, a
  Fase 1 dos nomes (Herança do Fogo, 4 aldeias), a correção da rodada 2 do rankeado e a Fase 0 (Extração do design
  final e maestria por jutsu, feita no Fogo) e a Fase 1 dos nomes originais (Os Cinzas, Arena das Quatro Heranças, 38 jutsus, v21;
  aldeias Nuvem/Areia corrigidas na v22: `docs/fase1-renomeacao.md`). Documento canônico do endgame (identidade, aldeias, hierarquia, ANBU,
  torneios, Terra Sem Lei, guerras, roadmap Fase 0 a 3): `docs/endgame-visao.md`; nada dele é implementado sem o OK do
  Victor. **Stack:** em avaliação (empacotamento nativo, WASM, N-API, Capacitor/Tauri, C/C++); não mudar nada até ele
  decidir.
  Histórico completo no `README.md`; relatório de progresso em `docs/relatorio-final-e-progresso-2026-11.md`.

## Documentos

- `README.md`: o que entrou em cada versão (v5 a v27) e se precisa de migração.
- `DEPLOY.md`: publicação passo a passo e as regras das migrações.
- `docs/fase2-plano.md`: plano de arquitetura da Fase 2 (endgame), etapas, migrações previstas e decisões em aberto.
- `docs/design-do-jogo.md`: design completo (pilares, sistemas, roadmap, decisões e riscos).
- `docs/historia/arco-1.md`: roteiro do Arco 1 (15 missões); o sistema de história ainda não existe.
- `docs/mapas.md`, `docs/endgame.md`, `docs/habilidades.md`, `docs/clima.md`, `docs/netcode.md`.
- `docs/relatorio-progresso-2026-11.pdf`: relatório de progresso (estado do jogo e próximas atualizações).

## Próximas entregas

1. Jutsus v2 (decisão do Victor, 03/11): todos os jutsus do PDF adaptados (`docs/jutsus-v2.md`,
   `revisao_egm/jutsus/`). Entrega 2 (Fogo novo) com migração v16; Fase 1 (nomes, v17), as classes e a Vento (v18), os
   clãs (v19), a provocação de monstros e a Fase 0 (Extração e maestria, v20) feitos; a linhagem no Criador e o Rito do
   Despertar (v25) e a maestria em todos os jutsus (Fase 1.5, v36) feitos. A Fase 2.5 (74 jutsus novos,
   4 por classe por tier, nomes da opção B) foi feita na v49 (migração v30, `src/realtime/jutsusFase25.ts`).
2. Rankeado, polimento (`revisao_egm/rankeado/`): arquibancada em degraus, estátua, selo de faixa, aviso de próximo.
3. Cabeça (rosto e cabelo) desenhada à mão em pixel art: o Victor reprovou o rosto e o cabelo gerados por formas 3D.
4. Site no Floot (páginas, login com a conta do jogo, admin, notificações).
5. Salas com imagem: aguardando as imagens do Victor (Areia, Alfaiataria, Academia, Caverna, Clareira, Refúgio).
6. Arco 1 jogável (sistema de história), depois o social (grupo, amigos, sensei).

## Como trabalhar

- **Renomeações (regra do Victor, 09/11/2026):** nunca aplicar nome novo sem aprovação. O processo é sempre: **auditar, propor 3 opções por item,
  o Victor escolhe, só então aplicar** (código, banco, testes e docs). "Continuar a partir da sua recomendação" não é escolha: se o Victor
  não disse qual opção, perguntar. Vale para jutsus, clãs, locais, itens, NPCs, títulos e organizações, nesta e nas próximas fases.

- **Troca de classe no nível 60 (decisão do Victor, 09/11/2026; implementar na Fase 2):** custo alto em ryō, só no nível 60. Os jutsus
  e a maestria da classe antiga **ficam guardados no perfil**, só **bloqueados no kit** (a trava de classe da v34, `canUse` no
  `gameWorld.ts`, já faz isso); se ele voltar para aquela classe, voltam a valer sem perder nada. A proteção contra azar da Extração
  da classe antiga também fica guardada.
- **#11, linhagem (decisões do Victor, 09/11/2026):** a linhagem (Rubro, Umbra, Andarilho) é **marcada no Criador de Personagem** e
  **despertada no "Rito do Despertar"** (missão no rank Genin, nível 11); a árvore só abre depois do Rito. A classe Sombra continua uma
  das 10 classes; o **Clã Umbra ganha 4 jutsus próprios** (nomes e mecânicas: 3 opções por jutsu, o Victor escolhe antes de codar).

- **Foco (decisão do Victor, 10/11/2026):** PvP pronto para o Teste Alpha. Nada novo de endgame (Kage, ANBU, Renegados, Guerra) nem os 74
  jutsus da Fase 2.5 até ele pedir. A auditoria dos 100 jutsus (v45) está em `test/auditoriaJutsus.test.ts`: jutsu novo ou mexido passa por ela.
- `npm run verify` (typecheck, testes e build) tem que passar antes de qualquer commit.
- Mudança visual: conferir no jogo com o navegador automático (Playwright) e mostrar imagens ao Victor.
- Commit e push só com o código verificado; mudança que precisa de migração vai num branch até o Victor rodar a
  migração no Neon.

## Migrações de banco (`db/*.sql`)

As migrações são rodadas pelo Victor no **SQL Editor do Neon**, pelo celular. Siga as regras da seção
"Regras para as migrações" do `DEPLOY.md`. As principais:

- **Nunca use blocos `DO $$ ... $$`**: o editor do Neon corta o bloco e dá `unterminated dollar-quoted string`.
  Use `IF [NOT] EXISTS`, `CREATE OR REPLACE FUNCTION`, `INSERT ... ON CONFLICT`, ou uma função temporária
  chamada com `SELECT` e apagada depois.
- Tudo dentro de `BEGIN; ... COMMIT;`.
- O branch principal do Neon se chama `production`.
- Ordem do deploy: migração no Neon primeiro, depois o código na `main` (o Render publica a `main` sozinho).
- Toda migração pode rodar de novo sem erro (avisos como "already exists, skipping" são normais).

## Segredos

`DATABASE_URL`, `JWT_SECRET` e `SERVICE_TOKEN` só existem no painel do Render. Nunca no código, no
`DEPLOY.md`, em logs ou em prints.

## Skill task-observer

- No começo de toda sessão, antes da primeira ferramenta, ative a skill `task-observer`.
- Se ela não estiver instalada (o container da nuvem é novo a cada sessão), instale antes:
  `npx -y skills add rebelytics/one-skill-to-rule-them-all --skill task-observer -g -y`
- As observações que ela registrar nunca podem conter os segredos acima.
