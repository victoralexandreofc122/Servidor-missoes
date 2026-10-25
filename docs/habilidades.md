# Habilidades: profundidade do combate

A profundidade não vem de ter 100 jutsus, e sim de ter poucos que se comportam de jeitos diferentes. Este documento
separa, para cada tipo de habilidade de MMO:

- o que **já está no jogo**;
- o que a **base de código da v18** já permite (`effects.ts`, `monsterAi.ts`);
- os **jutsus que vamos citar** como próximos passos.

Os números das propostas são um ponto de partida; o balanceamento vem dos dados das lutas (docs/netcode.md).

## 1. Por função

| Função | Já no jogo | Base pronta (v18) | Próximos jutsus |
|---|---|---|---|
| **Dano direto, um alvo** | Relâmpago, Taijutsu, Ataque Básico | | |
| **Dano em área** | Fogo (explosão), Água (cone), Kunais (leque), Shuriken Gigante (atravessa) | | |
| **Dano ao longo do tempo** | | `queimadura` (4 por segundo) | Fogo tier 3 e 4 deixam queimadura |
| **Cura direta** | Cura (no aliado focado, em si ou no mais ferido) | | |
| **Cura ao longo do tempo** | | `regeneracao` (5 por segundo) | Cura tier 3 vira regeneração no grupo |
| **Atordoar** | Ilusão (em volta), Relâmpago (choque curto) | | |
| **Prender** | Sombra | | |
| **Silêncio** (sem jutsu) | | `silencio` | Ilusão tier 3: "Genjutsu do Silêncio" |
| **Sono** (quebra ao apanhar) | | `sono` | Ilusão tier 4: "Genjutsu do Sono", longo e frágil |
| **Melhorias** | Pedra (escudo), passivas das vilas, poderes da Akatsuki | | Pedra tier 3: escudo também nos aliados perto |
| **Penalidades** | | `lentidao` (60% da velocidade), `ferida` (metade da cura) | Sombra tier 2: lentidão; Kunais envenenadas: ferida |
| **Dissipar** | | | "Selo de Dissipação": tira 1 efeito bom do inimigo ou 1 ruim do aliado |
| **Movimento** | Teleporte Curto, avanço do Taijutsu, Substituição, empurrão da Água | | |

O **teto de controle** já existe: no PvP, atordoar ou prender o mesmo ninja de novo dura a metade, depois um quarto, e
depois nada. Silêncio e sono devem entrar nesse mesmo teto quando virarem jutsus.

## 2. Pela forma de ativação

| Forma | No jogo | Proposta |
|---|---|---|
| **Instantânea** | Todos os jutsus de hoje. É o ritmo do jogo. | Continua sendo a maioria. |
| **Conjuração** (selos de mão) | | Só nos tier 4: 0,8 s de selos e depois o jutsu. Atordoar, empurrar ou dormir interrompe. A compensação de lag (docs/netcode.md) já existe para o "interromper ou não" ser justo. |
| **Canalizada** | A meditação já é um canal: andar, atacar ou apanhar interrompe. | "Rajada de Água": jato contínuo enquanto segura o botão. |
| **Cargas** | | Kunais com 3 cargas, cada uma volta sozinha: rajada controlada. |
| **Mantida** (liga e desliga) | Correr já é: liga, desliga e muda o ritmo. | "Postura de Pedra": menos dano recebido enquanto gasta chakra por segundo. |

## 3. Recursos e ritmo

- **Chakra (custo fixo):** já existe. O chakra só volta meditando, e isso já dá ritmo: lutar, recuar, meditar.
- **Construir e gastar** (proposta, "Selos"): cada Ataque Básico que acerta gera 1 selo, até 5. Jutsus fortes gastam
  selos em vez de chakra, ou ganham bônus com eles. Dá função ao Ataque Básico na luta longa.
- **Calor** (proposta, só para o Fogo): cada Fogo aquece, e o calor esfria sozinho. Aquecido demais, o próximo Fogo
  queima também quem lançou. É uma escolha, não um castigo.

## 4. PvP

- **Reativa:** a **Substituição** já é. Ela só funciona se você apanhar dentro da janela: o tronco fica no lugar e você
  aparece atrás de quem bateu.
- **Anti-cura:** a base é a `ferida`, que corta a cura pela metade. Proposta: Kunais envenenadas, ou Armas tier 3.
- **Dissipar o inimigo:** proposta: o Selo de Dissipação tira o escudo de Pedra ou a regeneração.
- **Tempo de reação:** desde a v18 os golpes saem sem alvo e podem errar, e a compensação de lag confere o acerto
  onde o adversário estava na tela de quem bateu.

## 5. PvE

- **Máquina de estados (v18, já no jogo):** parado → persegue (raio de aggro ou quem bateu nele) → ataca → volta. A volta
  acontece se o jogador foge além da corda; o monstro volta curando a vida toda. O caminho é recalculado a cada
  0,5 s, e o passo desvia de parede.

  | Monstro | Raio de aggro | Velocidade | Corda |
  |---|---|---|---|
  | slime | 3,5 casas | 2,5 casas/s | 8 casas |
  | Lodo Escuro | 5 casas | 3 casas/s | 10 casas |
  | lodo sombrio | 6 casas | 3,4 casas/s | 12 casas |

  O ninja anda a 5 casas/s, então sempre dá para fugir.
- **Golpe telegrafado** (próximo): o Lodo Escuro marca o chão com um círculo e 1 s depois pula ali. Quem sai do
  círculo não apanha.
- **Primeiro chefe** (proposta: o Rei Lodo, no fundo da Caverna do Lodo), com fases disparadas uma vez só:
  - **65% da vida:** invoca 4 slimes (adds);
  - **30%:** golpe pesado no alvo dele ("tank buster"), que pede Pedra ou Substituição;
  - também: marca um jogador com uma poça (**espalhar**: os outros se afastam dele).
  - **Linha de visão** já funciona, porque linhas e projéteis param na parede. Uma onda do chefe poderia ser evitada
    escondendo-se atrás das pedras.
- **Agrupar** (dividir o dano) faz sentido em grupo. Fica para quando houver grupos.

## 6. Sinergias e combos

- **Água + Relâmpago (v18, já no jogo):** a Água deixa o alvo **molhado** (4 s); o Relâmpago num alvo molhado bate
  **30% a mais** e o seca (aparece "Combo! ⚡💧"). Com a chuva (Água e Raio +5%), o combo fica ainda melhor.
- **Próximos combos de classe:**
  - a Água apaga a queimadura (defesa contra Fogo);
  - Sombra + Ilusão: o preso que é atordoado também fica lento.
- **Campo + finalizador** (proposta): o Fogo tier 4 deixa o chão em chamas por 3 s, e Kunais que passam pelo fogo
  viram kunais de fogo (aplicam queimadura).

## 7. Para testar a base (admin)

`/admin efeito <nome> <efeito|limpar> [segundos]` põe um efeito num ninja online:

- efeitos: `molhado`, `queimadura`, `regeneracao`, `silencio`, `sono`, `ferida`, `lentidao`;
- sem segundos, usa a duração padrão;
- `limpar` tira todos;
- vale só até reiniciar e fica na auditoria.

O ícone do efeito aparece em cima do nome, na barra de efeitos (tocar mostra o nome e o tempo) e, nos monstros, em
cima da vida.
