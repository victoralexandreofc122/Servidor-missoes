# Adaptação: Doton (Terra) e Ninjutsu Médico

Fonte: `especificacao-original.pdf`, págs. 7 a 9. Regras: `docs/jutsus-v2.md` seção 2. Números do jogo: `BASE_SKILLS`
e `TIER` em `src/realtime/jutsus.ts`, `PVP_TIER_POWER` (1 / 1,15 / 1,3 / 1,45), `PVP_SHIELD` e `CC_BUDGET` em
`src/realtime/pvpBalance.ts`.

Convenções: "base" = dano (ou cura) do tier 1 equivalente; o tier entra só por `TIER.power` (monstro) e
`PVP_TIER_POWER` (PvP). Casas = metros. Controle em s é o pedido; no PvP passa pelo orçamento (1,5 s por golpe,
2,5 s a cada 15 s). Maestria L2 a L4: só números, ganho total no PvP ≤ +15% sobre o L1, recarga -2% por nível (máx. -6%).
Escudo = regra única (absorve, ≤ 25% da vida máxima, até 4 s, um por vez).

## 1. Doton (Terra), amplia a classe Pedra

| Jutsu (série + português) | Tier | Forma | Números do jogo | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| **Pele de Pedra** (classe Pedra hoje, tier 1) | 1 | Em si | **Mantém os atuais:** custo 15, recarga 6 s, próximo golpe -50% (PvP 0,5 a 0,65 por tier) | +5% / +10% / +15% (PvP) e -2% recarga por nível | Pele de rocha: o próximo golpe perde força. | Nenhum |
| Doton: Doryūheki (Muralha de Terra) | 1 | Muro em linha, 3 casas de largura, 1 de fundo, a até 3 casas à frente | Sem dano; custo 20; recarga 14 s; muro com 15% da vida máxima do conjurador, dura 5 s; bloqueia projéteis e passagem | Vida 17% / largura 4 casas / vida 19% (dura 5 s sempre) | Ergue um muro de rocha que segura projéteis. | **Muro (obstáculo destrutível)**: entidade com vida que bloqueia projéteis e movimento |
| Doton: Moguragakure (Toupeira Oculta) | 1 | Avanço por baixo da terra, até 5 casas | Sem invulnerabilidade: durante o avanço (0,5 s) recebe -50% de dano; ao emergir, base 18 em raio 1, levantado 0,3 s; custo 20; recarga 10 s | Distância 6 / redução vale 0,6 s / levantado 0,4 s | Mergulha e surge à frente, jogando o inimigo pro alto. | Avanço com redução de dano; **levantado** (já previsto) |
| Doton: Ganchūrō (Prisão de Pilares) | 1 | Alvo único, até 6 casas | Base 18; custo 20; recarga 9 s; prende 1,0 s | Prender 1,1 s / dano +7% / dano +15% | Pilares de pedra prendem as pernas do alvo. | Nenhum (usa prender) |
| Doton: Doryūdan (Projétil de Rocha) | 1 | Linha, 8 casas, 2 rochas | Base 24 (12 por rocha); custo 18; recarga 3 s; as 2 rochas no mesmo alvo dão lentidão 20% por 2 s | Velocidade +15% / lentidão 25% / acerto duplo devolve 5 de chakra | Duas rochas em linha; as duas juntas deixam lento. | Nenhum (estamina vira chakra) |
| Doton: Yomi Numa (Pântano do Submundo) | 2 | Zona no chão, raio 3, até 6 casas | Base 18 total ao longo de 4 s; custo 27; recarga 16 s; lentidão 30% por 4 s; 2 s no centro: atordoa 0,5 s (1x por alvo) | Raio 3,5 / lentidão 35% / lama + queimadura do Fogo: prende 1,0 s | Lama que deixa lento; fique no centro e trava. | **Zona persistente** no chão; combo Terra + Fogo |
| Doton: Kengan no Jutsu (Punho de Rocha) | 2 | Em si (buff de Básico) | Básico +15% no PvP (+20% fora) por 5 s; custo 20; recarga 15 s; o 1º soco atordoa 0,5 s | Duração 5 s fixa: +1 de chakra por soco / atordoa 0,6 s / -10% de dano recebido enquanto ativo | Braço de pedra: socos mais fortes e o 1º atordoa. | **Buff de Básico** (regra de um por vez) |
| Doton: Ganban Kyū (Esmagamento de Paredes) | 3 | Alvo único, até 5 casas | Base 28; custo 34; recarga 12 s; prende 1,0 s | Fecha +20% mais rápido / acerto queima 10 de chakra do alvo / destrói Muro de tier 1 e 2 | Duas lajes se fecham e esmagam o alvo. | Interação com Muro (quebra) |
| Doton: Doryū Katsu (Golem de Terra Titânico) | 4 | Invocação a 2 casas | Golem com 40% da vida máxima do conjurador, dura 12 s, provoca monstros (no PvP não força alvo); soco a cada 4 s base 20 em raio 1,5, levantado 0,5 s; custo 44; recarga 45 s | Vida 45% / vida 50% / ao morrer explode base 18 em raio 2 | Ergue um golem de terra que luta ao seu lado. | **Invocação** (aliado com IA, vida e provocação) |

Observações:
- Ganchūrō L4 do PDF ("reduz recarga se acertar primeiro") ficou complicado; vira recarga -6% (a regra geral).
- Yomi Numa: o dano é baixo de propósito; a força dela é a lentidão (30%, dentro do teto de 40%).

## 2. Ninjutsu Médico, amplia a classe Cura

| Jutsu (série + português) | Tier | Forma | Números do jogo | Maestria L2 / L3 / L4 | Texto para o jogador | Sistema novo |
|---|---|---|---|---|---|---|
| **Cura** (classe Cura hoje, tier 1) | 1 | Raio 3 em volta de si | **Mantém os atuais:** custo 30, recarga 4 s, cura 30 (PvP x0,5) | +5% / +10% / +15% (PvP) e -2% recarga por nível | Fecha feridas suas e de quem está perto. | Nenhum |
| Shōsen Jutsu (Palma Mística) | 1 | Aliado colado (1 casa) ou si mesmo | Cura base 30 canalizada em 2 s (anda devagar); custo 25; recarga 8 s; em si mesmo cura 50% | Canalização 1,7 s / cura base 34 / canalização 1,5 s | Canaliza chakra nas mãos e fecha a ferida. | **Canalização** (interrompida por controle) |
| Desintoxicação Celular | 1 | Si ou aliado colado | Remove queimadura e veneno; custo 15; recarga 12 s; cura base 10 | Instantâneo / 2 s sem novo dano contínuo / devolve 5 de chakra | Tira veneno e queimadura do corpo. | **Limpeza de efeito** (remover dano contínuo) |
| Chakra no Bisturi (Bisturi de Chakra) | 1 | Em si (buff de Básico) | Básico +15% no PvP por 5 s; custo 20; recarga 15 s; o 1º golpe sangra base 6 em 3 s | Sangramento base 7 / base 8 / base 9 (5 s fixo) | Lâmina de chakra: golpes cortam e fazem sangrar. | Buff de Básico (regra de um por vez) |
| Passo Medicinal (Aura de Regeneração) | 1 | Aura raio 2 em volta de si, 3 s | Cura 4 por segundo (12 total; PvP x0,5); custo 20; recarga 12 s | Raio 2,5 / 5 por segundo / recarga -6% | Aura curta que regenera quem anda com você. | **Cura ao longo do tempo** |
| Ranshinshō (Distúrbio Nervoso) | 2 | Alvo único, até 5 casas | Base 18; custo 27; recarga 14 s; controles invertidos 1,0 s (peso 1 no orçamento) | 1,1 s / alvo usa jutsu 20% mais devagar por 3 s / lentidão 15% por 2 s depois | Embaralha os nervos: o alvo anda ao contrário. | **Controles invertidos** (novo tipo de controle, peso 1) |
| Soco Tsunade (Chakra Enhanced Punch) | 2 | Corpo a corpo, alvo 1 casa + raio 1,5 em volta | Base 26; custo 27; recarga 9 s; vizinhos levam 50%; levantado 0,5 s no alvo direto | Raio 2 / dano +7% / levantado 0,6 s | Soco carregado de chakra que racha o chão. | Levantado (já previsto) |
| Palma Mística Avançada (Regeneração de Área) | 3 | Zona raio 4, 4 s | Cura base 25 por segundo fora; no PvP x0,5 e cai no corte de 50% após 20% de vida curada; custo 51; recarga 30 s | Raio 4,5 / aliados dentro ignoram lentidão / o último segundo limpa queimadura e veneno | Campo verde que cura todo o time dentro. | Zona persistente + limpeza de efeito |
| Byakugō no Jutsu (Regeneração Mitótica) | 4 | Em si, 10 s | Cura 3% da vida máxima por segundo (PvP x0,5 = 15% total); custo 66; recarga 60 s; sem imunidade | Dano dos jutsus +10% enquanto ativo / controle recebido -30% de duração / ao terminar empurra em raio 2 (1,5 casa) | Marca do Byakugō: o corpo se regenera sozinho. | Cura ao longo do tempo; redução de controle |

## 3. Decisões de equilíbrio

1. **Dano pelo tier 1 equivalente.** PDF 24 → 24; 130 → 28 (130/2,8 ≈ 46, cortado no teto 30 e reduzido por
   prender junto); 90 → 26; 360 do PDF não se aplica aqui. Todas as bases entre 18 e 30 (exceto os efeitos
   secundários: sangramento, explosão do Golem).
2. **Toupeira sem ficar intocável:** vira avanço de 5 casas com -50% de dano durante 0,5 s e levantado curto ao
   sair. Recarga 10 s (avanço com dano exige ≥ 6 s).
3. **Controle:** todo controle ≤ 1,5 s por golpe; nada passa de 1,0 s pedido no tier 1-3. Lama: atordoar 0,5 s
   só 1x por alvo. O combo Terra + Fogo (L4) prende 1,0 s e conta no orçamento.
4. **Escudos/defesa:** Pele de Pedra mantém os números; Muralha e Golem não são escudos (são entidades), por isso
   têm vida em % da vida máxima e duração curta. A Muralha não protege o dono de golpes corpo a corpo.
5. **Buffs de Básico:** Punho de Rocha e Bisturi seguem a regra única (+15% PvP, 5 s, recarga 15 s, um por vez);
   não somam com nenhum outro.
6. **Médico luta, mas não é o melhor lutador:** dano próprio só em 3 jutsus (Bisturi, Ranshinshō base 18, Soco
   Tsunade base 26 a cada 9 s). DPS de jutsu fica perto de 70% do Fogo (Fogo base 25 a cada 1,5 s). O Soco
   Tsunade é a ameaça dele; corpo a corpo, então o Fogo consegue kitar.
7. **Médico não fica imortal:** toda cura x0,5 no PvP; corte de 50% na cura recebida por 4 s depois de uma cura
   acima de 20% da vida; Byakugō cura 15% da vida no PvP em 10 s e perdeu a imunidade a controle (virou -30%
   de duração). Conta rápida (Médico x Fogo, vida 100): cura sustentada do Médico ≈ 1,5 a 2 por s contra ~10 a
   12 de dano por s do Fogo → o Médico cai em ~10 a 15 s de pressão contínua, e o duelo deve fechar abaixo de
   60 s. **Confirmar no simulador** (rev_equilibrio item 4).
8. **Sem armadura, crítico, estamina:** "quebra guarda" vira levantado/atordoar curto; "ignora 40% da defesa"
   vira +7% de dano; "drena estamina" vira queimar chakra; "anula regeneração" não entrou.
9. **Sistemas novos (ordem sugerida):** buff de Básico e levantado (já previstos) → zona persistente → limpeza
   de efeito → cura ao longo do tempo → canalização → controles invertidos → Muro → Invocação (Golem). Muro e
   Invocação são os mais caros e podem ficar para depois do piloto; até lá Muralha e Golem ficam sem uso.
