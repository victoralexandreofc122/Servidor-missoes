# Adaptação Goldfish: Clã Uchiha e Taijutsu (Portões do Corpo)

* **Fonte:** PDF do Victor, págs. 11 e 12 (árvore "Clã Uchiha"); o PDF não tem Taijutsu (árvore proposta aqui).
* **Regras seguidas:** `docs/jutsus-v2.md` seção 2 e seção 5; revisões `rev_equilibrio`, `rev_escopo`, `rev_fantasia`.
* **Números conferidos em:** `src/realtime/jutsus.ts` (`BASE_SKILLS`, `TIER`) e `src/realtime/pvpBalance.ts`
  (`PVP_TIER_POWER` 1 / 1,15 / 1,3 / 1,45; `CC_BUDGET` 1,5 s por golpe e 2,5 s a cada 15 s; `PVP_COST_COOLDOWN`
  taijutsu x4).

Como ler as tabelas:
- **Base** = dano equivalente ao tier 1 (18 a 30). O tier entra só pela curva: `TIER.power` contra monstros e
  `PVP_TIER_POWER` no PvP. Ex.: Tsukuyomi base 30 vira 30 x 1,45 = 43 no PvP (L1), 84 contra monstros.
- **Custo e recarga** já são os finais do jutsu (valem dentro e fora do PvP), salvo nota. A recarga cai 2% por nível
  de maestria (máx. -6%), dentro do +15% total do L4.
- **Controle** = segundos que entram no orçamento (peso 1, salvo nota). "Levantado" conta como atordoado e pode
  levar dano. Lentidão total máx. 40%.
- **Escudo** = a regra única: até 25% da vida máxima, até 4 s, um ativo por vez, dano no escudo fora da rede de
  segurança.
- **Maestria L2 a L4:** só números (regra do piloto), exceto quando dito.

## 1. Clã Uchiha

### Passiva: Sharingan desperto

- Quando o adversário do duelo usa um jutsu de tier 4, um ícone no canto mostra **se o tier 4 dele está pronto de
  novo** (sim ou não, sem os segundos). Nada mais: não mostra recargas, chakra nem mira.
- **O olho muda de visual a cada tier aprendido do clã**, sem ganho de poder: tier 1 = 1 tomoe, tier 2 = 3 tomoes,
  tier 3 = Mangekyō, tier 4 = Mangekyō Eterno (brilho mais forte). É só arte (camada do rosto no `rigArt.js`).

### Tabela

| Jutsu (série + português) | Tier | Forma | Números do jogo | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| Sharingan: Olho da Percepção | 1 | buff em si | sem dano; custo 15; recarga 12 s; 4 s: o **próximo golpe físico** recebido (Básico, Taijutsu, Armas) causa -50% | 5 s / -6% recarga / L4: mostra uma seta da direção da próxima mira do inimigo por 1 s | "Lê o golpe: o próximo ataque físico dói metade." | carga de redução de 1 golpe (reusa a `reduction` da Pele de Pedra, filtrada por físico) |
| Genjutsu: Sharingan (Transe Ocular) | 1 | olhar em linha 4 casas, **preparo 0,4 s** (o olho brilha) | base 18; custo 20; recarga 8 s; atordoa 0,8 s | alcance 4,5 / tira 10 de chakra / lentidão 10% 1 s depois do transe | "Encara o inimigo e o paralisa por um instante." | preparo curto antes do golpe (o mesmo "aviso" da entrega 1, com 0,4 s) |
| Sharingan: Olho da Cópia (Previsão) | 2 | postura de contra-ataque em si | base 20; custo 27; recarga 14 s; 3 s: o próximo golpe físico recebido é devolvido com 1 corte (base 20) e o dano recebido dele cai 10%; sem controle | 3,5 s / dano físico recebido -15% na postura / L4: contra-ataque que acerta tira 1 s da recarga deste jutsu (no lugar de -30% de todas) | "Prevê o golpe físico e devolve na hora." | postura de contra-ataque (gatilho "ao receber golpe físico"); a "chance" do PDF vira certeza de 1 golpe |
| Mangekyō: Amaterasu (Chamas Negras) | 3 | olhar em linha 6 casas, acerta o 1º alvo | base 18 (impacto 6 + queima negra 3/s por 4 s); custo 34; recarga 10 s; sem controle | queima 5 s / custo -10% / -6% recarga | "Chamas negras que a água não apaga." | queimadura que não sai com Água (flag `semApagar` no efeito que já existe) |
| Susanoo Esquelético (Costelas Protetoras) | 3 | escudo em si + corte frontal (arco 1,5 casas) | base 18 no corte; custo 34; recarga 20 s; escudo 20% da vida máx. por 4 s | escudo 25% (o teto) / golpe corpo a corpo no escudo empurra o atacante 1 casa (empurrão, sem controle) / corte +10% | "Costelas de chakra te protegem e cortam." | escudo com vida (entrega 3) |
| Susanoo Perfeito (Guerreiro Titânico) | 4 | transformação 5 s em si: escudo + Básico vira espada | base 30 no golpe final; custo 44; recarga 30 s; escudo 25% da vida por 4 s (o mesmo escudo, não soma com o Esquelético); Básico +15% e alcance 2 casas por 5 s (a regra única de buff de Básico); ao acabar, golpe final em onda frontal 5 x 3 que levanta 0,5 s | Básico 10% mais rápido (dentro do +15% total) / golpe final levanta 0,7 s / -6% recarga | "Vira um guerreiro de chakra com espada e escudo." | modo transformação (escudo + buff de Básico + golpe ao fim, juntando 3 sistemas que já vêm antes); visual grande |
| Mangekyō: Tsukuyomi (Mundo dos Sonhos) | 4 | olhar em linha 5 casas, **preparo 0,8 s** com aviso no alvo; **se quem lança levar dano no preparo, falha** e volta metade da recarga | base 30; custo 44; recarga 30 s; atordoa 1,5 s (o máximo por golpe) e o dano cai no fim | +10% no dano / tira 20% do chakra atual do alvo / L4: escuridão em volta do alvo 1 s depois (sem tirar a interface) | "Prende a mente do alvo num pesadelo." | preparo interrompível por dano |

**Dentro x fora do PvP (Susanoo Perfeito e Tsukuyomi entram nos dois, decisão do Victor):**
- **Susanoo Perfeito:** fora do PvP dura 8 s (como no PDF) e o golpe final derruba os monstros num raio de 5; o escudo
  segue a regra única (25%, 4 s). No PvP: 5 s, sem "imune a controle" (o controle recebido entra normal), sem
  "dano massivo" (só o buff de Básico de +15%), sem cura com chakra (o L4 do PDF vira -6% de recarga).
- **Tsukuyomi:** fora do PvP atordoa 3 s em monstros comuns e 1 s no chefe. No PvP: 1,5 s no orçamento, o dano
  280 do PDF vira base 30 (43 no PvP), o "drena 80% do chakra" vira 20% e a "cegueira mental" vira escuridão de 1 s.

## 2. Taijutsu: Portões do Corpo

Ideia: o lutador que encurta a distância, emenda golpes e, no topo, **abre os Portões pagando com a própria vida**.
Os nomes dos tiers 2 a 4 de hoje (Chute Ciclone, Cem Golpes, Punho do Céu) continuam, nos mesmos códigos, agora com
forma própria. O **tier 1 de hoje (`taijutsu`) mantém todos os números**.

| Jutsu (série + português) | Tier | Forma | Números do jogo | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| Taijutsu (Golpe Avançado) — existe | 1 | passo curto até o mais perto (2,5 casas) + golpe em círculo de 1 casa | **iguais aos de hoje:** dano 35; custo 5; recarga 0,5 s; no PvP x4 (custo 20, recarga 2 s) | +10% dano / alcance 3 / -6% recarga | "Avança e soca o inimigo mais perto." | nenhum |
| Konoha Reppū (Rasteira da Folha) | 1 | chute baixo em arco frontal de 1,5 casas | base 20; custo 10; recarga 4 s; lentidão 30% por 1 s | lentidão 1,5 s / +10% dano / -6% recarga | "Rasteira que deixa o inimigo lento." | nenhum (cone curto, o mesmo do Sopro do Fogo) |
| Konoha Senpū (Chute Ciclone) | 2 | giro em volta, anel de raio 1,5 | base 24; custo 14; recarga 5 s; empurra 1,5 casa (sem controle) | raio 2 / +10% dano / empurra 2 | "Gira e chuta tudo em volta." | nenhum (anel = forma da entrega 0) |
| Kage Buyō (Sombra da Folha Dançante) | 2 | avanço 4 casas que para no 1º alvo e o chuta para cima | base 22; custo 20; recarga 8 s; levantado 0,6 s | avanço 4,5 / levantado 0,7 s / -6% recarga | "Dispara e chuta o inimigo para o alto." | controle "levantado" (já previsto na seção 2) |
| Cem Golpes (Konoha Renkyaku) | 3 | sequência de 3 toques na frente (raio 1) em 1 s; o último empurra 2 casas | base 24 (3 x 8); custo 24; recarga 7 s; sem controle | 4 toques (4 x 6,5, mesmo total) / +10% dano / -6% recarga | "Três golpes seguidos; o último arremessa." | golpe em vários toques no mesmo alvo (reusa o controle por lançamento das kunais) |
| Omote Renge (Lótus Primária) — Portão da Abertura | 3 | avanço 3 casas + agarra e cai em cima do alvo | base 28; custo 20 + **5% da vida atual**; recarga 12 s; levantado 0,8 s e o dano cai no fim | +10% dano / custo de vida 4% / -6% recarga | "Abre o 1º Portão: agarra e esmaga no chão." | custo de vida (nunca mata: mínimo 1 de vida) |
| Hachimon Tonkō (Abertura dos Portões) | 4 | buff em si | sem dano; custo 10% da vida atual (sem chakra); recarga 20 s; 5 s: Básico +15% (regra única, troca outro buff de Básico) e +15% de velocidade de movimento | 6 s de velocidade (o +15% de Básico não sobe) / custo de vida 8% / -6% recarga | "Abre os Portões: mais forte e rápido, custa vida." | buff de Básico (entrega 3) + custo de vida |
| Punho do Céu (Asa Kujaku: Pavão da Manhã) | 4 | rajada de 5 socos em cone frontal de 3 casas; cada alvo leva no máx. 3 | base 30 (5 x 6); custo 30 + 5% da vida atual; recarga 12 s; sem controle | cone 3,5 / +10% dano / L4: com Portões abertos, o último soco empurra 2 casas | "Socos tão rápidos que pegam fogo." | leque de vários golpes (o mesmo da Fênix) + custo de vida |

**Fator x4 do PvP:** o `PVP_COST_COOLDOWN.taijutsu = 4` vale só para o código antigo `taijutsu` (mecânica barata e
rápida). Os 7 jutsus novos já nascem com custo e recarga do duelo e ficam fora desse fator.

## 3. Decisões de equilíbrio

1. **Clã não pode ganhar do Andarilho.** O kit do clã tem os mesmos 4 espaços; o Andarilho tem 5 e Substituição 15%
   mais rápida. Os dois tier 4 do Uchiha têm recarga de 30 s (o maior do jogo) e a passiva é só informação de sim/não.
   Simulador: Uchiha x Andarilho com a mesma classe entre 45% e 55%; se passar de 55%, primeiro sobe a recarga do
   Tsukuyomi para 35 s.
2. **Nada de invulnerabilidade.** "Esquiva" (Olho da Percepção) virou -50% em 1 golpe; "contra-ataque por chance"
   virou 1 golpe certo e pequeno; "imune a CCs" do Susanoo Perfeito saiu.
3. **Escudo único:** Esquelético (20%, L2 25%) e Perfeito (25%) usam o mesmo escudo; lançar um troca o outro. O Uchiha
   nunca passa de 25% da vida em escudo.
4. **Orçamento de controle:** Transe 0,8 s; Tsukuyomi 1,5 s (máximo por golpe, com preparo de 0,8 s interrompível e
   recarga 30 s); golpe final do Susanoo 0,5 s; Kage Buyō 0,6 s; Omote Renge 0,8 s. Combo mais forte do Uchiha
   (Transe + Tsukuyomi) = 2,3 s, dentro dos 2,5 s por 15 s. Do Taijutsu (Kage Buyō + Omote Renge) = 1,4 s.
5. **Dano no teto:** toda base fica entre 18 e 30 (Amaterasu soma impacto + queima = 18; Asa Kujaku 5 x 6 = 30;
   Cem Golpes 3 x 8 = 24). Tsukuyomi = 43 no PvP, igual ao teto de qualquer tier 4.
6. **Avanço com dano:** Kage Buyō 8 s, Omote Renge 12 s, todos ≥ 6 s. **Exceção herdada:** o Golpe Avançado de tier
   1 (dano 35, recarga 2 s no PvP) mantém os números por decisão do dono; o passo de 2,5 casas é encostar, não
   perseguir. Se o simulador mostrar perseguição infinita, sobe a recarga dele no PvP para 6 s (o fator x4 vira x12),
   sem mexer fora do PvP.
7. **Custo de vida dos Portões** é a troca do Taijutsu: Hachimon (10%) + Asa Kujaku (5%) + Omote Renge (5%) gastam
   ~20% da vida atual por ciclo. Nunca mata (mínimo 1), e a vida gasta não conta na rede de segurança.
8. **Um buff de Básico por vez:** Hachimon e Susanoo Perfeito são buffs de Básico de +15%; com Taijutsu como classe e
   Uchiha como clã, o segundo troca o primeiro.
9. **Testes obrigatórios no `pvpSim`:** Uchiha x Andarilho (45 a 55%); Transe → Tsukuyomi dentro do orçamento;
   Tsukuyomi interrompido por dano; Susanoo Perfeito + Hachimon (só um buff vale); Taijutsu x Fogo e Taijutsu x
   Médico (< 60 s); custo de vida nunca abaixo de 1.
10. **Nomes da série:** ficam (decisão do Victor, risco de marca aceito); reavaliar antes de qualquer item pago.
