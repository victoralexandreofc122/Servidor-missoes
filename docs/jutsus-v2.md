# Jutsus v2: as árvores do documento do Victor, adaptadas ao jogo

* **Autor:** Victor (documento "Especificação Técnica de Jutsus", versão 2.4.0; cópia em
  `revisao_egm/jutsus/especificacao-original.pdf`), adaptado pelo Claude.
* **Status:** versão 2, depois da revisão EGM (3 revisores Goldfish: equilíbrio 6, escopo 5, fantasia 6,5; relatórios
  em `revisao_egm/jutsus/`) e das decisões do Victor de 03/11/2026.

## 1. Decisões do Victor

| Pergunta | Decisão |
|---|---|
| Como se ganha um clã | **Linhagem + despertar:** a linhagem é escolhida no Criador (nome e visual); a árvore do clã só abre com uma **missão de despertar no rank Genin**. Quem não escolhe clã é **Andarilho** (ver 5.3). |
| Nomes | **Os da série** (Uchiha, Nara, Sharingan, Amaterasu, Susanoo, Chidori...). Risco de marca aceito pelo Victor; reavaliar antes de qualquer item pago. |
| Classe Sombra | **Vira o Clã Nara.** Quem tem Sombra como classe recebe os pontos de volta (troca grátis de classe) e a linhagem Nara já despertada. |
| Ordem | **Fogo primeiro, depois o Clã Uchiha.** O Nara vem depois. |
| Quais jutsus | **Todos os jutsus do PDF**, adaptados ao jogo (adaptação feita pelos agentes Goldfish em `revisao_egm/jutsus/adapt_*.md`). Os que dependem de sistema novo grande (muro, invocação, voo) entram na lista com a adaptação pronta e são implementados na entrega da classe. |
| Médico | **Mantém o Soco Tsunade (Chakra Enhanced Punch)**: o Médico tem poucas habilidades de dano e precisa delas. |

## 2. Regras de adaptação (o que muda em relação ao PDF)

| PDF | No jogo | Por quê |
|---|---|---|
| Dano de 15 a 450 | Cada jutsu guarda o **dano do tier 1 equivalente** (`base`), de 18 a 30. O tier entra só pelas curvas que já existem: `TIER.power` contra monstros (1 a 2,8) e `PVP_TIER_POWER` no PvP (1 a 1,45). Ex.: Chuva de Meteoros "85" vira base 30 (85 / 2,8). | Sem isso o tier conta duas vezes no PvP (revisão de equilíbrio). |
| Áreas de 20 a 30 m | 1 casa = 1 m; raio máximo **5 casas**, linhas até 10. | A tela do celular mostra ~14 casas. |
| Stun de 3 a 4 s | Todo controle entre jogadores passa pelo **orçamento de controle** (1,5 s por golpe, 2,5 s a cada 15 s). Tipos novos: **puxão** (peso 1) e **levantado** (conta como atordoado e **pode levar dano**). Congelar recargas vira **silêncio**. | Já decidido no duelo. |
| Invulnerabilidade | Não existe. Vira escudo ou redução de dano. | A luta perde a resposta. |
| Escudos variados | **Um tipo só de escudo:** absorve dano, no máximo 25% da vida máxima, até 4 s, **um ativo por vez**. O dano no escudo não conta para a rede de segurança. No piloto, nada tem bônus contra escudo. | Escudo com vida mexe em toda a conta de dano. |
| Curas grandes | No PvP a cura usa o fator **x0,5**; depois de uma cura acima de 20% da vida, a cura recebida cai 50% por 4 s. | O Médico não pode ficar imortal (Médico x Fogo tem que acabar em menos de 60 s no simulador). |
| Buffs no Ataque Básico | **Um buff de Básico por vez**, no máximo +15% no PvP, 5 s, recarga mínima de 15 s. | Somados davam +55%. |
| Lentidão | Zonas e jutsus: lentidão total no máximo **40%**. | Não prender ninguém andando. |
| Avanço com dano | Recarga mínima de **6 s**. | Avanço barato vira perseguição infinita. |
| Armadura, crítico, esquiva, estamina | O jogo não tem. "Perfura" e "crítico" viram bônus por condição dentro do teto do tier; estamina vira chakra. | Não criar 3 sistemas por causa de 5 jutsus. |
| Cegar a tela, tirar minimapa | Não. Vira "escuridão" em volta do alvo, sem tirar a interface. | No celular parece bug. |
| Maestria muda a forma (L2 a L4) | **No piloto, os níveis 2 a 4 só mudam números.** A mudança de forma entra em **1 jutsu** como prova (Chamas da Fênix: 3 para 4 projéteis no L2) e depois se avalia. No PvP o ganho total fica em +15% sobre o L1. | Mudar a forma em todo nível multiplica o trabalho por 4. |
| Recarga -2% por nível de maestria | Entra (máximo -6%). | Barato e dá sensação de progresso. |

## 3. Entregas (cada uma com critério de pronto)

| # | Entrega | Migração | Pronto quando |
|---|---|---|---|
| 0 | **Base nova sem mudar números:** `JutsuDef` passa a ter `form` (linha, cone, anel, zona, leque, buff, escudo, avanço, aviso) e números por jutsu; `cast` e o cliente escolhem pelo `form`. | não | O `pvpSim` e todos os testes dão o mesmo resultado de antes. |
| 1 | **Zona no chão** (dano/lentidão/cura por segundo) e **aviso no chão** (o golpe cai depois de 0,8 s). | não | Teste de zona e de aviso; aparece no celular. |
| 2 | **Fogo com 4 jutsus novos** (seção 4). | **v16**: `INSERT ... ON CONFLICT` dos jutsus novos em `game.jutsus` (o `extract_jutsu` da v10 já sorteia entre vários do mesmo tier). Nenhum código antigo é renomeado ou apagado. | Simulador com Fogo novo passando nos critérios; Extração dá os novos. |
| 3 | **Buff de Básico e escudo** (as regras da seção 2). | não | Testes das regras de teto. |
| 4 | **Clã Uchiha** + linhagem no Criador + missão de despertar + Andarilho; a classe Sombra vira Clã Nara (só a troca de dados; a árvore do Nara vem na 5). | **v17**: coluna `clan`, troca dos jogadores de Sombra. | Simulador: clã x Andarilho entre 45% e 55% de vitórias. |
| 5+ | **Uma classe por vez** (Água, Relâmpago, Terra, Médico, Armas, Ilusão, Taijutsu, Nara), cada uma passando pelo simulador. | um `INSERT` por classe | |

Fica para uma revisão própria: muro no mapa, invocações (Golem, Clone), voo, canalização, armadilha invisível,
inverter controles, teletransporte entre sombras, a classe nova **Vento** (Fūton), Tsukuyomi e Susanoo Perfeito
(como poderes de evento, fora do PvP).

## 4. Piloto: Fogo (Katon)

Hoje: Bola de Fogo, com os tiers 2 a 4 sendo a mesma bola mais forte. Depois: **2 jutsus por tier**; a Extração sorteia
entre os 2 do tier. Dano = base (tier 1 equivalente), como explicado na seção 2.

| Jutsu | Tier | Forma | Base | Maestria (só números no piloto) |
|---|---|---|---|---|
| Gōkakyū no Jutsu (Bola de Fogo) — existe | 1 | linha 9, explode raio 2, queima 3/s 3 s | 25 | +10% velocidade / raio +0,5 / queima +1 s |
| Karyū Endan (Sopro Incinerador) | 1 | cone 3 casas, deixa poça de fogo 1,5 s (zona, 2/s) | 20 | alcance 3,5 / poça 2 s / lentidão 10% 1 s |
| Hōsenka no Jutsu (Chamas da Fênix) | 2 | leque de 3 bolas pequenas (cada alvo leva no máx. 2) | 3 x 10 | **L2: 4 bolas (prova de mudança de forma)** / leque mais aberto / +1 s de queima |
| Haisekishō (Nuvem de Cinzas) | 2 | nuvem em volta (raio 2) que detona 1 s depois | 28 | raio 2,5 / +10% na detonação / escuridão 1 s em quem estava dentro |
| Gōka Messhitsu (Destruição Magnífica) | 3 | onda frontal 5 x 6 | 24 | largura 6 / queima 3/s 3 s / -6% recarga |
| Karyū Hōtan (Míssil Dragão de Fogo) | 3 | projétil grande e lento, linha 10 | 26 | +25% velocidade / divide em 3 fagulhas (8 cada) / -6% recarga |
| Tenrai Gōen (Chuva de Meteoros) | 4 | 3 meteoros com **aviso no chão 0,8 s**, raio 1,5 cada, dentro de um raio de 5 | 3 x 11 | raio 5,5 / chão em chamas 2 s / o último derruba 0,5 s (orçamento) |
| Katon: Lâmina de Fogo | 4 (buff) | Básico +15% (PvP) e dano de fogo por 5 s | — | a regra única de buff de Básico |

Custo e recarga: os do tier (`TIER.cost`, `TIER.cooldown` sobre o Fogo de hoje), ajustados pelo simulador.

## 5. Clãs

### 5.1 Clã Uchiha (primeiro)

**Passiva (Sharingan desperto):** quando o adversário do duelo usa um jutsu tier 4, um ícone mostra **se o tier 4 dele
está pronto** (sem os segundos). **O olho muda de visual a cada tier aprendido** do clã (1 a 3 tomoes, Mangekyō), sem
ganho de poder.

| Jutsu | Tier | Forma | Números | Maestria |
|---|---|---|---|---|
| Sharingan: Olho da Percepção | 1 | 4 s: o próximo golpe físico recebido erra | — | 5 s / -6% recarga / mostra a próxima mira do inimigo |
| Genjutsu: Sharingan (Transe Ocular) | 2 | olhar em linha 4 com **0,4 s de preparo**: atordoa 0,8 s (orçamento) | base 10 | alcance 4,5 / tira 10 de chakra / lentidão 10% 1 s depois |
| Mangekyō: Amaterasu (Chamas Negras) | 3 | queima 3/s por 4 s (base 12 no total equivalente), não sai com Água | 12 | 5 s / custo -10% / -6% recarga |
| Susanoo Esquelético | 4 | escudo (regra única: até 25% da vida, 4 s) + 1 corte frontal | base 15 | escudo +10% (no teto) / corte +10% / empurra ao acabar |

Fora do PvP (poderes de evento ou chefe): Tsukuyomi, Susanoo Perfeito.

### 5.2 Clã Nara (depois; nasce da classe Sombra)

**Passiva:** +10% de alcance nos jutsus de sombra (só os do clã).

| Jutsu | Tier | Forma | Números | Maestria |
|---|---|---|---|---|
| Kage Mane no Jutsu (Possessão da Sombra) | 1 | linha 6, prende 1,5 s (orçamento); é a Sombra de hoje | — | alcance 7 / custo -10% / move o alvo para os lados |
| Kage Nui (Costura de Sombra) | 2 | 3 agulhas em leque, prendem 0,8 s | 3 x 8 | 4 agulhas / atravessa barreira fraca / tira 8 de chakra |
| Kage Kubishibari (Estrangulamento) | 3 | só num alvo preso: 8/s por 2 s; **sem silêncio no PvP** | 16 | 10/s / -50% chakra que o alvo recupera / — |
| Domínio das Sombras | 4 | zona raio 5 por 4 s: lentidão 25%; o 1º que entrar fica preso 0,8 s | 20 no fim | drena 8 de chakra / lanças no fim +10% / -6% recarga |

### 5.3 Andarilho (sem clã)

Escolha com nome própria, não "falta de clã": **+1 espaço no kit B** (5 jutsus) e a Substituição volta 15% mais rápido.
No simulador, Andarilho x clã fica entre 45% e 55%.

## 6. As outras árvores (resumo; detalham-se na entrega de cada classe)

- **Água (Suiton):** Mizurappa (existe), Suiryūdan, Suishōha, Mizuame Nabara (zona de lentidão), Suirō (prende só
  enquanto quem lança fica parado; quebra se ele levar dano), Prisão do Vórtex (puxão 1,0 s + atordoa 0,5 s).
- **Relâmpago (Raiton):** Sandāboruto (a Faísca de hoje), Jibashi, Chidori Senbon, Gian (salta entre alvos), Chidori
  (avanço com carga; recarga mínima 6 s), Kirin (aviso no chão 1,2 s, raio 4).
- **Terra (Doton, amplia a Pedra):** Pele de Pedra (existe), Ganchūrō, Yomi Numa (zona), Kengan (buff de Básico),
  Ganban Kyū. Doryūheki (muro) e o Golem ficam para depois.
- **Médico:** Shōsen (a Cura de hoje), Desintoxicação, Bisturi de Chakra (buff de Básico), Palma Mística Avançada
  (zona de cura 4/s), Byakugō (cura 5/s por 6 s em si; com o fator x0,5 do PvP) e **Soco Tsunade** (decisão do Victor:
  o Médico precisa de dano).
- **Armas (Bukijutsu):** Kunais (existe), Shuriken Kage Bunshin, Sōshūjin, Corte Iai (avanço; recarga mínima 6 s),
  Dança dos Mil Cortes (dano total no teto do tier 4; 50% menos dano recebido durante, sem invulnerabilidade).
- **Ilusão (Genjutsu):** Kai (Dissipação), Narakumi (atordoa, orçamento), Kokuangyō (escuridão), Izanami (prende 1,5 s
  e silêncio no lugar de "congelar recargas"), e mais 2 no detalhamento da classe.
- **Taijutsu:** o PDF não tem árvore. Proposta da revisão: **"Portões do Corpo"**, árvore de combos (avanço, chute
  ciclone, sequência, Portão final com custo de vida). Detalhar na entrega da classe.

## 7. Teste novo

- Todo jutsu e clã novo entra no `pvpSim` antes de ir para o jogo. Casos obrigatórios: Médico x Fogo (< 60 s), clã x
  Andarilho (45 a 55%), combos de controle (Laço + Estrangulamento, Vórtex) dentro do orçamento, buffs de Básico.
