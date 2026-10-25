# Netcode e combate (PvP e PvE)

Como o servidor de Vontade do Fogo trata os pontos críticos de combate em MMO. Cada item diz **o que já existe**, onde
está no código e **o que falta** (em ordem de prioridade no fim).

## A base: servidor autoritativo

O servidor é a única fonte da verdade. O cliente só manda **intenções** e o servidor decide o resultado.

| Ponto | Como está | Onde |
|---|---|---|
| Movimento | O cliente manda só a direção do joystick (−1 a 1). A velocidade e a posição são do servidor, com orçamento de passos por tick (sem speed hack nem teletransporte). | `gameWorld.ts` (`moveSession`) |
| Golpes e jutsus | O servidor confere vivo, atordoado, zona segura, jutsu aprendido e no kit, recarga e chakra. Depois calcula a hitbox (arco, cone, círculo, linha, projétil) com as posições dele, o dano e a morte. | `gameWorld.ts` (`cast`, `basicAttack`), `combat.ts` |
| Pacotes | Toda mensagem passa pelo Zod (tipos, faixas e campos extras ignorados). Limites: 20 mensagens/s, 1 KiB por mensagem, chat 1/s; mais de 100 descartadas em 1 s derruba a conexão. | `protocol.ts`, `gameWorld.ts` |
| Economia | Ryō, itens, equipamento e regras que não podem ser burladas ficam no **banco** (funções e gatilhos no Postgres). | `db/*.sql` |
| Admin | Só quem tem `is_admin`; cada função `game.admin_*` confere de novo e grava a auditoria. | `admin.ts` |

## Tick, previsão e interpolação

- **Tick de 20 Hz** (50 ms). Um tick nunca anda mais que 250 ms de uma vez (servidor travado não dá "pulo"). Teste
  de desempenho: 100 jogadores andando com monstros cabem com folga no tick.
- **Previsão do cliente:** o próprio boneco anda na hora (`prediction.js`). O servidor devolve a posição com o número
  do último comando processado e o cliente refaz o que previu dali (reconciliação).
- **Os outros ninjas** são desenhados ~100 ms no passado, entre duas posições do servidor (interpolação), para
  andarem lisos.
- **Golpes não são previstos:** a animação só começa quando o servidor confirma (`attack`, `cast`). É mais justo e
  evita "acertei, mas não acertei".

## PvP: compensação de lag (v18)

Quem ataca vê o adversário no passado: o ping (ida e volta) mais os 100 ms da interpolação. Sem compensação, um golpe
que acertou na tela erra no servidor, porque o outro já andou. Desde que os golpes saem sem alvo e podem errar, isso
pesa ainda mais.

- **O servidor mede o ping de cada um** (`sync` a cada 2 s; o cliente devolve na hora). O valor é medido pelo
  servidor, não informado pelo cliente. A média muda devagar e aparece no topo da tela ("· 85 ms").
- **Rastro:** cada ninja guarda onde esteve nos últimos 500 ms (um ponto por tick). Trocar de mapa apaga o rastro.
- **Golpes instantâneos** (Ataque Básico, Água, Ilusão, Sombra, Relâmpago, Taijutsu e os poderes da Akatsuki):
  a hitbox é conferida contra o outro ninja **onde ele estava** há `ping + 100 ms`, com **teto de 300 ms**. Ping alto
  não acerta atrás da parede.
- **Projéteis** (Fogo, Kunais, Shuriken Gigante) voam em tempo real: batem na posição de agora. Os dois lados veem o
  projétil voando e podem desviar.
- Só vale para **ninjas**. Monstros andam 1 casa por segundo, aos saltos, e o cliente chega na posição nova em
  ~100 ms.
- Números em `config.ts` (`lagComp`); testes em `test/lagComp.test.ts`.

**Não temos:** jutsus com tempo de conjuração (todos são instantâneos). Então não existe a janela de interrupção
entre dois pings, que o texto aponta como o maior problema de sincronização.

## Justiça e balanceamento

- **Controle com teto** (já existe): atordoar ou prender o mesmo ninja de novo dentro de 8 s dura a metade, depois um
  quarto, e depois nada.
- **Proteção ao renascer:** 5 s sem apanhar de jogador.
- **Clima:** cada bônus de elemento vale no máximo 5%.
- **Registro das lutas:** cada vitória na Zona de Conflito vai para o banco (Elo, temporada, espólio).
- **Números do PvP (v19, `pvpStats.ts`):** o painel do admin (aba PvP) e o `/admin pvp [dias]` mostram:
  - desde que o servidor ligou: vitórias, derrotas, % e dano por classe Primária, e dano, acertos, dano por acerto e
    abates por golpe (jutsu, Ataque Básico, arma lançada, poder e queimadura);
  - do banco: a Zona de Conflito por classe nos últimos N dias.
- **Falta:** *dampening* (cura e dano caindo devagar em luta longa) para a arena.

## PvE

- **Máquina de estados (v18, `monsterAi.ts`):**
  - **parado:** anda à toa na zona de caça;
  - **persegue:** alguém entrou no raio de aggro, ou bateu nele (o alvo é quem mais bateu);
  - **ataca:** encostou;
  - **volta:** o jogador fugiu além da corda, morreu, saiu do mapa ou entrou em zona segura. O monstro volta sem ouvir
    ninguém e, chegando, recupera a vida toda e zera quem participou.
- **Leve:** o monstro "pensa" (alvo e direção) a cada 500 ms e só anda no tick; o passo desvia de parede (reto, ±45°,
  ±90°). Monstro de mapa vazio não pensa. Números por tipo em `config.ts` (`ai`), detalhes em docs/habilidades.md.
- **Golpe marcado (v18):** o Lodo Escuro marca o chão e pula ali 1 s depois; quem sai escapa e atordoar no preparo
  interrompe. O servidor decide quem estava dentro na hora do pulo.
- **Chefe com fases (v19, o Rei Lodo):** cada fase dispara uma vez só no limiar da vida (65%: filhos; 30%: fúria e
  Esmagar). O servidor confere o limiar a cada dano, então um golpe grande que passa os dois limiares dispara as duas
  fases na ordem. A volta para casa zera as fases (docs/habilidades.md, seção 5).

## Anti-cheat

- **Já existe:** a validação de tudo no servidor (acima). Mensagem inválida, tentativa de `/admin` sem ser admin e
  excesso de mensagens vão para o log.
- **Falta:** contar anomalias por jogador (golpe fora da recarga repetido, joystick acima de 1, mensagens descartadas)
  e sinalizar no log de admin quem passar do limite.

## Ordem sugerida para o que falta

1. ~~PvE com máquina de estados~~ (feito na v18).
2. ~~Golpe telegrafado~~ (o golpe marcado do Lodo Escuro) e ~~chefe com fases~~ (o Rei Lodo, v19).
3. ~~Métricas de PvP por classe e jutsu~~ (v19, painel do admin). *Dampening* na arena.
4. **Contador de anomalias** por jogador.
