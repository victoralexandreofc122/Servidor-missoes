# Revisão Goldfish: escopo e implementação (Jutsus v2)

**Nota: 5/10.** As regras de adaptação (seção 2) são boas e protegem o PvP. O escopo, não: o documento diz
"só 1 sistema novo pequeno", mas as tabelas pedem uns 10 sistemas novos. Para um dev sozinho em pré-alpha, o
plano de ~60 jutsus + 2 clãs é coisa de vários meses. O piloto Fogo + clã é a ordem certa, mas ainda é grande demais.

## O que o código tem hoje (conferido)

- `skillConfig` (`jutsus.ts`) só sabe uma coisa: pegar o `BASE_SKILLS[mechanic]` e multiplicar pelo `TIER`. São 11
  mecânicas fixas, e o `cast` do `gameWorld.ts` faz um `switch` por mecânica. O cliente (`game.js`, perto da
  linha 1010) desenha o efeito **pela mecânica**. Um jutsu com outra forma precisa de código novo nos dois lados.
- A Extração no banco (`game.extract_jutsu`, v10) já sorteia entre **vários** jutsus do mesmo tier e classe e pula os
  que o jogador já tem. Então "2 por tier" não muda a regra do sorteio. Mas `player_jutsus.jutsu_code` aponta
  (FK) para `game.jutsus`, então **todo jutsu novo precisa de um `INSERT` numa migração** antes do código.
- `effects.ts` tem queimadura, lentidão, regeneração, paralisia, silêncio, molhado... mas nada que **fique no chão**,
  nem escudo com vida própria, nem algo com hitbox no mapa.

## Sistemas que as tabelas pedem de verdade

| Sistema | Jutsus que usam | Peso |
|---|---|---|
| Zona no chão com tique (servidor + desenho + rede) | Sopro L4, Nuvem de Cinzas, Meteoros, Xarope, Pântano, Regeneração de Área, Domínio | médio |
| Aviso no chão com atraso (telegraph) | Nuvem, Meteoros, Kirin | pequeno, se vier junto com a zona |
| Buff no Ataque Básico | Lâmina de Fogo, Punho de Rocha, Bisturi | pequeno |
| Cone / leque de vários projéteis | Sopro, Fênix, Agulhas, Costura | pequeno (o leque de kunais já existe) |
| Escudo com vida (absorve X) | Susanoo, Míssil L4, "quebra escudo" em ~10 jutsus | médio (mexe na conta de dano e na rede de segurança) |
| Muro no mapa com vida (colisão de projétil) | Muralha de Terra, "atravessa muros fracos" | grande |
| Salto entre alvos | Lança em Cadeia | pequeno |
| Puxão para o centro | Vórtice | médio (briga com o empurrão e a colisão) |
| Canalização / "fica parado" | Prisão de Água, Palma Mística | médio |
| Escuridão só para o alvo | Nuvem L4, Noite Eterna | médio (só no cliente, mas por jogador) |
| Recarga congelada, mostrar recarga do outro, "próximo golpe erra", reflexo | Izanami, Hien | médio cada |
| Maestria que muda a forma (L2/L3/L4) | todos | **grande**: multiplica tudo por 4 |
| Clã (coluna, Criador, passiva, árvore própria) | Kurokage, Hien | grande |

## Bloqueadores

1. **"Muda a forma por nível" multiplica o trabalho por 4.** Cada linha da tabela vira 4 versões para programar,
   desenhar e passar no simulador. O que fazer: no piloto, os níveis 2 a 4 **só mexem em números** (raio, duração,
   dano, recarga). Mudança de forma entra num só jutsu, como prova, e só se der tempo.
2. **Falta o modelo de dados de `JutsuDef`.** A seção 7 diz "`form` + `mastery`", mas o `cast` faz `switch` por
   `mechanic` e o cliente também. O que fazer: antes de qualquer jutsu, escrever o formato (ex.: `form` com
   parâmetros + lista de `onHit` em efeitos) e refazer os 11 jutsus de hoje nele **sem mudar nenhum número**. Critério:
   o `pvpSim` e os testes dão o mesmo resultado de antes. Sem isso, cada jutsu novo vira mais um `if` no `cast`.
3. **A migração está subestimada.** O doc fala em migração v16 só para `clan`. Mas cada jutsu novo precisa de linha
   em `game.jutsus` (por causa da FK), o código tem que aceitar os códigos novos antes ou junto da migração, e a
   proteção contra azar (`player_extraction_pity`) muda de chance quando o tier passa de 1 para 2 jutsus. O que fazer:
   uma migração por entrega (v16 = jutsus do Fogo, v17 = clã), só com `INSERT ... ON CONFLICT DO NOTHING`, rodando de
   novo sem erro e sem `DO $$`. **Nunca renomear nem apagar códigos que já existem** (`player_jutsus` e os kits
   guardam esses códigos).

## Importantes

4. **O piloto tem que ser menor.** Fogo tem 8 jutsus e precisa de zona, aviso, cone, leque, onda, buff e escudo.
   O que fazer: piloto = Fogo com **4 jutsus novos** (Sopro tier 1, Fênix tier 2, Nuvem de Cinzas tier 2, Meteoros
   tier 4) e **2 sistemas novos**: zona com tique e aviso no chão. Destruição, Míssil e Lâmina de Fogo vêm na rodada
   seguinte.
5. **Deixar o clã para depois do piloto de classe.** O clã soma coluna nova, Criador, regra de troca, passiva no
   `statsFor`, "+1 espaço" para quem não tem clã (esse sistema ainda não existe) e, no Kurokage, prender + estrangular
   + zona. Isso dobra o piloto. O que fazer: piloto só com Fogo. O clã entra numa entrega própria, e o primeiro é o
   **Hien sem o Susanoo** (só passiva de leitura + Amaterasu, que é queimadura que já existe). Kurokage depois.
6. **Escudo com vida mexe na conta de dano em todo o PvP.** "Quebra escudo" e "+X% contra escudo" aparecem em uns 10
   jutsus, e a rede de segurança (50% em 2 s) precisa saber se o dano no escudo conta. O que fazer: um só tipo de
   escudo (`shieldHp` no alvo, gasto antes da vida, não entra na rede de segurança). Os bônus contra escudo saem do
   piloto.
7. **Cliente e mira.** Cone, leque, onda e "joga para lados opostos" têm que caber na mira de 4 direções, e cada
   forma nova pede um desenho novo no `game.js`, que hoje desenha por mecânica. O que fazer: no doc, toda forma diz em
   qual das 4 direções sai. Critério de pronto de cada jutsu: ver no celular (Playwright, tela deitada) o aviso e a área.
8. **Cortar as classes que inflam o escopo.** Vento é classe nova (exige `game.classes`, Missão de Genin, mestre,
   ícone, pergaminho), e Terra precisa do muro (o sistema mais caro). O que fazer: tirar Vento e a Muralha desta
   versão. Ficam na lista "depois", junto com as invocações.

## Detalhes

9. A recarga -2% por nível de maestria tem que entrar no `pvpSim` e no `cooldownMs` do servidor, não só no texto.
10. "Cada alvo leva no máx. 2" (Fênix) e "salta 1 alvo" precisam de controle por lançamento. O das kunais já existe:
    reaproveitar.
11. A Extração passa a sortear entre 2 do tier: avisar no texto da UI que o jogador pode tirar o "outro".
12. A pergunta 3 (classe Sombra vira clã?) mexe em dados salvos: se virar, é migração de troca de classe.
    Recomendo **não** mexer nisso agora.

## Ordem de entregas (cada uma com critério de pronto)

| # | Entrega | Pronto quando |
|---|---|---|
| 0 | Refazer `JutsuDef`/`cast`/cliente em "forma + efeitos", com os mesmos números | `npm run verify` verde, `pvpSim` igual ao de antes, nenhum jogador perde jutsu nem kit |
| 1 | Zona no chão + aviso no chão (servidor, rede, desenho) | 1 teste por sistema; dá para ler no celular; a zona some ao trocar de mapa |
| 2 | Fogo: 4 jutsus (Sopro, Fênix, Nuvem, Meteoros) + migração v16 (`INSERT` em `game.jutsus`) | Victor rodou a v16 no Neon; Extração dá os novos; `pvpSim` passa; 2 testadores jogaram |
| 3 | Buff no Básico + escudo com vida → Lâmina de Fogo, Destruição, Míssil | Rede de segurança testada com escudo |
| 4 | Clã Hien (coluna `clan`, Criador, passiva, Amaterasu) — migração v17 | "Sem clã" continua válido; conta antiga entra sem clã |
| 5+ | Uma classe por vez (Água, Relâmpago, Cura, Ilusão, Armas), cada uma só com os sistemas que já existem | Mesmo critério da 2 |
| Depois | Muro, puxão, canalização, escuridão, Vento, Kurokage, maestria que muda a forma, invocações | Revisão própria |
