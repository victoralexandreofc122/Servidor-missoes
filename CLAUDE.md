# Vontade do Fogo: servidor-missoes

## Migrações de banco (`db/*.sql`)

As migrações são rodadas pelo Victor no **SQL Editor do Neon**, pelo celular. Siga as regras da seção
"Regras para as migrações" do `DEPLOY.md`. As principais:

- **Nunca use blocos `DO $$ ... $$`**: o editor do Neon corta o bloco e dá `unterminated dollar-quoted string`.
  Use `IF [NOT] EXISTS`, `CREATE OR REPLACE FUNCTION`, `INSERT ... ON CONFLICT`, ou uma função temporária
  chamada com `SELECT` e apagada depois.
- Tudo dentro de `BEGIN; ... COMMIT;`.
- O branch principal do Neon se chama `production`.
- Ordem do deploy: migração no Neon primeiro, depois o código na `main` (o Render publica a `main` sozinho).

## Segredos

`DATABASE_URL`, `JWT_SECRET` e `SERVICE_TOKEN` só existem no painel do Render. Nunca no código, no
`DEPLOY.md`, em logs ou em prints.

## Skill task-observer

- No começo de toda sessão, antes da primeira ferramenta, ative a skill `task-observer`.
- Se ela não estiver instalada (o container da nuvem é novo a cada sessão), instale antes:
  `npx -y skills add rebelytics/one-skill-to-rule-them-all --skill task-observer -g -y`
- As observações que ela registrar nunca podem conter os segredos acima.
