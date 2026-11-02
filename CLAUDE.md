# Vontade do Fogo: servidor-missoes

MMORPG ninja em pixel art chibi, para o navegador do celular (deitado) e do computador. O dono do projeto é o
Victor: ele escreve em português e quer as respostas em português do Brasil.

## O jogo em resumo

- **Gênero:** MMORPG de ação 2D, combate em tempo real, progressão por rank (Academia, Genin…), níveis até 60.
- **Tecnologia:** servidor autoritativo em Node e TypeScript (Fastify + WebSocket), Postgres no **Neon**, cliente em
  Canvas 2D sem engine (`public/`). O Render publica a `main` sozinho.
- **Mundo:** Vila da Folha 80x80 (lojas com interior, Academia), Vilas da Névoa, Nuvem e Areia (a Pedra saiu na v20),
  Floresta 100x100, Caverna do Lodo, Clareira Queimada, Poço sob a Praça, Zona de Conflito e Refúgio dos Renegados.
- **Sistemas prontos:** combate com jutsus por elemento e efeitos (queimadura, silêncio, paralisia…), habilidades em
  linha nas 4 direções, monstros com máquina de estados e o chefe Rei Lodo, classes, Extração, armas com jeito próprio,
  Tela de Equipamentos (arma, capa, pés, acessório, pergaminho), clima e dia/noite, fim de jogo (Kage eleito,
  diplomacia, Zona de Conflito com MMR e temporadas de 60 dias, renegados, Akatsuki), Painel do Admin e API `/site/*`.
- **Personagem:** desenhado por código (`public/rig.js` esqueleto 3D, `public/rigArt.js` camadas e física do pano,
  `public/figure.js` cache e giro). Detalhes em `arte/personagem-rig/LEIAME.md`. O estilo segue a folha de referência
  do Victor (chibi, contorno escuro, sombreado em 2-3 tons). Toda mudança de arte é comparada lado a lado com a
  referência e conferida dentro do jogo antes de fechar.
- **Versão atual:** v28 (equilíbrio do PvP, passo 1 do duelo, sem migração). Histórico completo no `README.md`.

## Documentos

- `README.md`: o que entrou em cada versão (v5 a v27) e se precisa de migração.
- `DEPLOY.md`: publicação passo a passo e as regras das migrações.
- `docs/design-do-jogo.md`: design completo (pilares, sistemas, roadmap, decisões e riscos).
- `docs/historia/arco-1.md`: roteiro do Arco 1 (15 missões); o sistema de história ainda não existe.
- `docs/mapas.md`, `docs/endgame.md`, `docs/habilidades.md`, `docs/clima.md`, `docs/netcode.md`.
- `docs/relatorio-progresso-2026-11.pdf`: relatório de progresso (estado do jogo e próximas atualizações).

## Próximas entregas

1. PvP na frente de tudo (decisão do Victor, 2026-11-01): duelo 1x1 equilibrado, plano em `concepts_brief.md`
   (branch `brainstorm-pvp-invocacoes`). A ordem é revista no critério de pronto do duelo ou em 15/12/2026.
2. Cabeça (rosto e cabelo) desenhada à mão em pixel art: o Victor reprovou o rosto e o cabelo gerados por formas 3D.
3. Site no Floot (páginas, login com a conta do jogo, admin, notificações).
4. Salas com imagem: aguardando as imagens do Victor (Areia, Alfaiataria, Academia, Caverna, Clareira, Refúgio).
5. Arco 1 jogável (sistema de história), depois o social (grupo, amigos, sensei).

## Como trabalhar

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
