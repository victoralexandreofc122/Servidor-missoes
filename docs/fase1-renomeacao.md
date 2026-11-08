# Fase 1: auditoria de nomes e propostas de renomeação

* **Status:** só proposta. **Nenhum nome foi alterado no código, no banco, nos testes nem nos docs de referência.**
  Aplicar só depois da aprovação do Victor, item a item (Tarefa 2).
* **Data:** 08/11/2026. **Base:** branch `ccr-2afc1981-eq01zm` (Fase 0 + v20). Fonte dos números: busca no código, nos SQL e na UI.
* Os IDs internos (`fire_endan`, `rubro_chamas`, `akatsuki_*`, `vale_estatuas`...) **não mudam**: só o texto que o jogador vê.

## 0. O que a auditoria encontrou (leia primeiro)

1. **"Clã Uchiha", "Clã Nara" e "Soco Tsunade" já não aparecem no jogo.** Os clãs jogáveis são **Rubro**, **Umbra** e **Andarilho** (v19) e o
   Soco Tsunade já virou **Punho Sísmico** (`heal_2`, v18). Esses três nomes da série só sobrevivem em documentos internos
   (`revisao_egm/jutsus/*.md`, `README.md` linha 234, `docs/endgame-visao.md` linhas 16 e 235). Então o que falta na Categoria B é
   **decidir se os nomes novos atuais ficam** (proponho as opções mesmo assim) e limpar esses docs.
2. **A Akatsuki NÃO é só interna: ela é visível ao jogador em muitos lugares** (aba "Akatsuki" do painel, convite, mensagens de chat,
   avisos globais, erros, "Manto da Akatsuki" com o ícone de nuvem ☁️ e os 10 poderes, que copiam um membro da série cada).
   É o item **mais urgente** da fase (seção 4).
3. **A sua tabela da Categoria A troca duas aldeias em relação ao que já está no jogo** (v17, já rodada no Neon):

   | Aldeia antiga | Pela sua tabela | **Hoje no código e no banco** |
   |---|---|---|
   | Folha (`vila_1`) | Chama Eterna | Chama Eterna (igual) |
   | Névoa (`vila_3`) | Maré Oculta | Maré Oculta (igual) |
   | **Nuvem (`vila_4`)** | **Vento Cortante** | **Rocha Antiga** |
   | **Areia (`vila_5`)** | **Rocha Antiga** | **Vento Cortante** |

   Pela arte, a sua ordem combina melhor: a vila que hoje se chama Rocha Antiga tem bandeira com uma nuvem branca (`public/mapArt.js:2590`) e a que hoje
   se chama Vento Cortante é um deserto de cactos e jarros de barro. O que está no código foi decidido na sessão do Conjunto A, sem essa conferência.
   **Preciso que você confirme qual é a certa.**
   Se for a sua tabela, vira uma migração v21 que só troca os nomes de `vila_4` e `vila_5` (e as passivas, que hoje são de teste:
   Rocha = +10% de dano de jutsu e Vento = +10% de dano de armas; as passivas finais do documento canônico são da Fase 2).
   Não toquei em nada disso.
4. **O jogo já usa a ordem Nuvem/Areia → Rocha/Vento na UI.** Trocar é só texto, mas quem já escolheu essas vilas veria o nome mudar.
5. **Quase todos os nomes de jutsu já são em português**, não japoneses (foram adaptados na v18). O problema que sobra é de **tradução direta**:
   ~40 nomes são a tradução literal de um jutsu famoso (Dragão d’Água = Suiryūdan, Clone de Água = Mizu Bunshin, Chamas Negras = Amaterasu...).
   Eles são reconhecíveis por quem conhece a série, então entram na proposta (seção 3).

## 1. Categoria A: já decididos (aplicar depois da aprovação)

| Atual | Novo | Situação no código |
|---|---|---|
| Vontade do Fogo | Herança do Fogo | **já aplicado** (UI, título, docs; sobra a conferir `DEPLOY.md`/comentários antigos) |
| Vila da Folha | Aldeia da Chama Eterna | **já aplicado** (v17) |
| Vila da Névoa | Aldeia da Maré Oculta | **já aplicado** (v17) |
| Vila da Nuvem | (sua tabela: Vento Cortante) | aplicado como **Rocha Antiga**: ver achado 3 |
| Vila da Areia | (sua tabela: Rocha Antiga) | aplicado como **Vento Cortante**: ver achado 3 |

Os IDs (`vila_nevoa`, `vila_nuvem`, `vila_areia`, `theme: 'folha'`) ficam como estão: são internos e trocar exigiria migrar mapas e
posições salvas, sem ganho nenhum para o jogador.

## 2. Categoria B: precisam de 3 opções

### 2.1 Clã Uchiha (hoje: **Clã Rubro**, `rubro`)

* **Onde aparece:** `src/realtime/jutsusClasses.ts` (CLANS, CLAN_JUTSUS, CLAN_TREE), `src/realtime/gameWorld.ts` (`CLAN_NAMES`, `CLAN_HINT`), chat `/linhagem rubro`,
  `db/schema_v19_clas.sql` (`clan` e `clan_code` = `'rubro'`). Os jutsus do clã estão na seção 3.
* **"Rubro" é original**: palavra comum em português (vermelho vivo), sem relação com marca. Preserva a fantasia do olho vermelho.
* **O que ainda lembra a série** não é o nome do clã, e sim o conjunto: olho que lê golpes + chamas negras + guardião espectral + lua que ilude.
  Por isso a seção 3 renomeia os jutsus do clã.

| # | Opção | Por quê |
|---|---|---|
| 1 | **Clã Rubro** (manter) | já é original e já está em tudo; esforço zero |
| 2 | Clã Íris Rubra | deixa o olho explícito no nome, mantém "rubro" |
| 3 | Clã Olho de Brasa | junta olho e fogo (a fantasia que você pediu) |
| 4 | Clã Espelho Rubro | "espelho" carrega a ideia de cópia |

**Recomendo manter Clã Rubro.** Esforço de trocar: MÉDIO (o código `rubro` é gravado em `game.players.clan` e `game.jutsus.clan_code`;
trocar só o nome exibido é BAIXO, trocar o código exigiria migrar a coluna e a constraint `ck_players_clan`).

### 2.2 Clã Nara (hoje: **Linhagem Umbra**, `umbra`)

* **"Umbra" é original**: palavra latina para "sombra", sem clã da série com esse nome. **Pedido do Victor: verificar** → verificado: **não é referência à série, manter**.
  (Aparece em outras obras como palavra comum, por exemplo bruxas Umbra em jogos de ação; não é marca registrada de ninja. Vale uma conferência jurídica antes de vender algo com esse nome, como com qualquer nome.)
* **Onde aparece:** os mesmos arquivos do Rubro (`umbra`), `CLAN_TREE.umbra = shadow, shadow_2, shadow_estrangular, shadow_4`. A árvore dele reaproveita jutsus da classe Sombra, cujos nomes entram na seção 3.

| # | Opção | Por quê |
|---|---|---|
| 1 | **Linhagem Umbra** (manter) | original; sombra + controle |
| 2 | Clã Fio de Sombra | liga sombra e controle (os jutsus prendem) |
| 3 | Clã Estrategos da Penumbra | liga sombra e inteligência (a fantasia do Nara) |
| 4 | Clã Tecelão da Noite | "tecer" = prender com sombra |

**Recomendo manter Umbra.** Esforço: BAIXO (só texto) ou MÉDIO (se mudar o código `umbra`).

### 2.3 Vale das Estátuas (hoje: **Vale dos Guardiões**, arena do rankeado)

* **Onde aparece:** `src/realtime/maps.ts:1327` (`name`), `public/index.html:103` (comentário), botão e avisos do rankeado no `public/game.js`. O ID `vale_estatuas` é interno (fica).
* O nome atual já é original. Mas "Guardiões" colide com o jutsu "Guardião Espectral" (que vai mudar na seção 3) e não diz que é uma arena.

| # | Opção | Por quê |
|---|---|---|
| 1 | **Vale dos Guardiões** (manter) | já original e já aplicado |
| 2 | Arena das Quatro Heranças | ligada ao título do jogo e às 4 aldeias |
| 3 | Coliseu do Vale Aberto | descreve a arena (anfiteatro no vale) |
| 4 | Vale das Quatro Marcas | cada aldeia deixa uma marca no vale |

**Recomendo Arena das Quatro Heranças** (diz o que é e reforça a marca). Esforço: BAIXO (1 linha em `maps.ts` + textos da UI + 1 teste de nome, sem migração).

### 2.4 Soco Tsunade (hoje: **Punho Sísmico**, `heal_2`, Cura T2)

* **Onde aparece:** `src/realtime/jutsusClasses.ts` (CLASS_V2.heal_2), `db/schema_v18_jutsus_classes.sql`. O nome "Soco Tsunade" só existe em docs internos.
* "Punho Sísmico" já é original e descreve o golpe (soco que abala o chão).

| # | Opção | Por quê |
|---|---|---|
| 1 | **Punho Sísmico** (manter) | já original; descreve soco que derruba |
| 2 | Punho do Pulso Vital | liga o soco ao chakra de cura da classe |
| 3 | Golpe Tectônico | ênfase no abalo do chão |
| 4 | Impacto de Chakra | descreve o soco carregado de chakra |

**Recomendo manter Punho Sísmico.** Esforço: zero (ou BAIXO se trocar: `jutsusClasses.ts` + v21 + 1 teste).

### 2.5 Organização vilanesca (hoje **Akatsuki**, visível ao jogador)

**Atenção: o nome Akatsuki já aparece para o jogador.** Lugares (arquivo:linha):

* `public/index.html:339` aba "Akatsuki"; `:377` "☁️ Convite da Akatsuki"; `:404` botão "Poder da Akatsuki".
* `public/endgame.js:49` prefixo ☁ no nome de membros; `:295`, `:302-304` expulsar/sair da Akatsuki; `:352` texto do convite.
* `src/realtime/gameWorld.ts:393` ("a Akatsuki"), `:1594`, `:1608` (mensagens do admin), `:5412` (aviso global "entrou para a Akatsuki"),
  `:5420`, `:5428` (avisos), `:5585` (anúncio de caça ao Kage), `:5598` ("O Manto da Akatsuki é só dos membros").
* `src/realtime/items.ts:109` item "Manto da Akatsuki" com o ícone de nuvem ☁️ (a marca visual do grupo da série).
* `src/errors/errorTranslator.ts:68`, `:97-102` mensagens de erro.
* Poderes: `src/realtime/akatsuki.ts:34-43` (10 poderes, seção 3.2).
* Código interno que **pode ficar**: arquivo `akatsuki.ts`, funções SQL `game.akatsuki_*`, módulo `'akatsuki'` em `game.modules`, mensagens do protocolo `akatsuki_*`.

| # | Opção | Por quê |
|---|---|---|
| 1 | **Os Cinzas** | já existe no Arco 1: ninjas expulsos cuja bandana foi queimada (líder Kagerō); casa com os renegados |
| 2 | Ordem do Eclipse | soa ameaçador e original; combina com o Manto "do Eclipse" |
| 3 | Legião Sem Aldeia | descreve quem são (renegados sem aldeia) |
| 4 | Véu Negro | curto e sinistro (cuidado: evitar ligação com "Véu" dos jutsus de Vento) |

**Recomendo "Os Cinzas"**: aproveita lore já escrito. O Manto vira "Manto Cinza" e o ícone ☁️ sai (sugestão: 🌑 ou 🔥 apagado).
Esforço: **MÉDIO-ALTO** (≈9 arquivos de código + 4 na UI + 4 testes + docs; banco: v21 só se existir texto salvo, e hoje o nome exibido não está no banco).

## 3. Categoria C: nomes visíveis que lembram a série

### 3.1 Jutsus (catálogo de 96)

Auditei os **96 nomes exibidos**. Critério: ALTO = tradução direta de um jutsu famoso; MÉDIO-ALTO e MÉDIO = reconhecível por quem conhece; BAIXO = descritivo ou genérico.
Resultado: **38 nomes para trocar** (21 ALTO, 9 MÉDIO-ALTO, 8 MÉDIO); **58 ficam** (BAIXO).
Esforço de cada troca: **BAIXO** (1 linha em `jutsus.ts` ou `jutsusClasses.ts`, 1 linha na migração v21, 0 a 2 testes que citam o nome). O ID (código) não muda.

| Nome atual | Código | Onde | Referência na série | Risco | Opção 1 | Opção 2 | Opção 3 | Recomendo |
|---|---|---|---|---|---|---|---|---|
| Chamas Negras | `rubro_chamas` | Clã Rubro T3 (`jutsusClasses.ts:240`) | Amaterasu (as "Chamas Negras") | ALTO | Brasa Sem Luz | Fogo do Eclipse | Chama Sem Reflexo | **Brasa Sem Luz** |
| Lua Ilusória | `rubro_lua` | Clã Rubro T4 (`jutsusClasses.ts:246`) | Tsukuyomi (a lua que prende em ilusão) | ALTO | Mundo Espelhado | Véu Escarlate | Sono da Íris | **Mundo Espelhado** |
| Guardião Espectral | `rubro_guardiao` | Clã Rubro T4 (`jutsusClasses.ts:242`) | Susanoo Esquelético (costelas protetoras) | MÉDIO-ALTO | Sentinela Espectral | Costelas de Cinza | Escudo do Espectro | **Sentinela Espectral** |
| Guardião Espectral Completo | `rubro_completo` | Clã Rubro T4 (`jutsusClasses.ts:249`) | Susanoo Perfeito (guerreiro titânico) | ALTO | Colosso Espectral | Sentinela Plena | Titã de Brasa | **Colosso Espectral** |
| Olho da Percepção | `rubro_olho` | Clã Rubro T1 (`jutsusClasses.ts:236`) | Sharingan (olho que lê golpes) | MÉDIO | Olhar Rubro | Íris de Brasa | Visão Predadora | **Olhar Rubro** |
| Palma Mística | `heal_palma` | Cura T1 (`jutsusClasses.ts:118`) | Shōsen Jutsu ("Mystical Palm") | ALTO | Palma Curadora | Mão Restauradora | Toque Serenante | **Palma Curadora** |
| Bisturi de Chakra | `heal_bisturi` | Cura T1 (`jutsusClasses.ts:113`) | Chakra Scalpel | ALTO | Corte Cirúrgico | Lâmina Pulsante | Fio Cirúrgico | **Corte Cirúrgico** |
| Distúrbio Nervoso | `heal_disturbio` | Cura T2 (`jutsusClasses.ts:120`) | Ranshinshō ("Disturbing Nerves") | MÉDIO-ALTO | Descontrole Muscular | Choque Nervoso | Pulso Desordenado | **Descontrole Muscular** |
| Regeneração Mitótica | `heal_4` | Cura T4 (`jutsusClasses.ts:127`) | Byakugō ("Mitotic Regeneration") | ALTO | Renovação Celular | Vida Reflorescente | Florescer do Selo | **Renovação Celular** |
| Costura de Sombra | `shadow_2` | Sombra T2 (`jutsusClasses.ts:202`) | Kage Nui ("Shadow Sewing") | ALTO | Agulhas de Sombra | Linha de Sombra | Alfinetes da Noite | **Agulhas de Sombra** |
| Shuriken de Sombra | `shadow_3` | Sombra T3 (`jutsusClasses.ts:209`) | Kage Mane Shuriken | ALTO | Lâmina Umbral | Estrela de Sombra | Disco Negro | **Lâmina Umbral** |
| Estrangulamento da Sombra | `shadow_estrangular` | Sombra T3 (`jutsusClasses.ts:207`) | Kage Kubishibari ("Shadow Neck Bind") | ALTO | Garrote de Sombra | Laço Sufocante | Aperto Sombrio | **Garrote de Sombra** |
| Agarre Múltiplo | `shadow_agarre` | Sombra T4 (`jutsusClasses.ts:211`) | Kage Tsukami ("Shadow Grasp") | MÉDIO-ALTO | Rede de Sombra | Mãos Sombrias | Tentáculos de Sombra | **Rede de Sombra** |
| Templo do Nirvana | `illusion_templo` | Ilusão T4 (`jutsusClasses.ts:163`) | Nehan Shōja ("Temple of Nirvana") | ALTO | Santuário das Penas | Jardim de Penas | Véu de Penas | **Santuário das Penas** |
| Árvore Prendedora | `illusion_3` | Ilusão T3 (`jutsusClasses.ts:159`) | Jubaku Satsu ("Tree Binding Death") | MÉDIO-ALTO | Raízes do Pesadelo | Galhos Prisioneiros | Floresta Ilusória | **Raízes do Pesadelo** |
| Laço do Destino | `illusion_4` | Ilusão T4 (`jutsusClasses.ts:161`) | Izanami (prende em um laço de tempo) | MÉDIO | Ciclo Sem Fim | Laço do Tempo | Eterno Retorno | **Ciclo Sem Fim** |
| Pântano do Submundo | `stone_2` | Pedra T2 (`jutsusClasses.ts:102`) | Yomi Numa ("Swamp of the Underworld") | ALTO | Lamaçal Profundo | Charco Abissal | Brejo das Sombras | **Lamaçal Profundo** |
| Toupeira Oculta | `stone_toupeira` | Pedra T1 (`jutsusClasses.ts:100`) | Moguragakure ("Hiding Like a Mole") | MÉDIO | Escavação Furtiva | Passagem Subterrânea | Rastro de Terra | **Escavação Furtiva** |
| Chamas da Fênix | `fire_2` | Fogo T2 (`jutsus.ts:149`) | Hōsenka ("Phoenix Sage Fire") | ALTO | Revoada de Brasas | Pétalas de Fogo | Fênix Fragmentada | **Revoada de Brasas** |
| Destruição Magnífica | `fire_3` | Fogo T3 (`jutsus.ts:162`) | Gōka Messhitsu ("Great Fire Annihilation") | ALTO | Varredura Flamejante | Onda Incandescente | Maré de Brasas | **Varredura Flamejante** |
| Míssil Dragão de Fogo | `fire_hotan` | Fogo T3 (`jutsus.ts:165`) | Karyū Hōtan ("Dragon Fire Missile") | MÉDIO-ALTO | Projétil Dracônico | Dragão de Brasa | Meteoro Dracônico | **Projétil Dracônico** |
| Nuvem de Cinzas Ardentes | `fire_haiseki` | Fogo T2 (`jutsus.ts:155`) | Haisekishō ("Ash Pile Burning") | MÉDIO-ALTO | Cinzas Detonantes | Véu de Cinzas | Nuvem de Brasas | **Cinzas Detonantes** |
| Chamas do Dragão Guiado | `fire_ryuka` | Fogo T2 (`jutsus.ts:152`) | Ryūka ("Dragon Fire") | MÉDIO | Lança de Fogo | Raio de Brasa | Chama Reta | **Lança de Fogo** |
| Dragão d’Água | `water_dragao` | Água T1 (`jutsusClasses.ts:52`) | Suiryūdan ("Water Dragon Bullet") | ALTO | Serpente d’Água | Jato Dracônico | Torrente Dracônica | **Serpente d’Água** |
| Clone de Água | `water_clone` | Água T2 (`jutsusClasses.ts:56`) | Mizu Bunshin ("Water Clone") | ALTO | Duplo de Água | Reflexo Líquido | Espelho d’Água | **Duplo de Água** |
| Prisão de Água | `water_3` | Água T3 (`jutsusClasses.ts:66`) | Suirō ("Water Prison") | ALTO | Cárcere Líquido | Bolha Aprisionadora | Esfera d’Água | **Cárcere Líquido** |
| Ocultação na Névoa | `water_nevoa` | Água T1 (`jutsusClasses.ts:58`) | Kirigakure no Jutsu ("Hidden Mist") | ALTO | Véu de Bruma | Neblina Densa | Manto de Névoa | **Véu de Bruma** |
| Onda de Choque Aquática | `water_2` | Água T2 (`jutsusClasses.ts:61`) | Suishōha ("Water Shockwave") | MÉDIO-ALTO | Estouro de Maré | Onda Explosiva | Maré Repentina | **Estouro de Maré** |
| Xarope Pegajoso | `water_xarope` | Água T2 (`jutsusClasses.ts:63`) | Mizuame Nabara ("Starch Syrup") | ALTO | Poça Viscosa | Maré Grudenta | Melaço Inflamável | **Poça Viscosa** |
| Dragões Gêmeos | `weapons_dragoes` | Armas T4 (`jutsusClasses.ts:147`) | Sōshōryū ("Twin Rising Dragons") | ALTO | Ascensão Dupla | Serpentes de Aço | Torre de Lâminas | **Ascensão Dupla** |
| Shuriken Gigante de Chakra | `weapons_gigante` | Armas T2 (`jutsusClasses.ts:138`) | Fūma Shuriken (também o item "Shuriken Gigante") | MÉDIO-ALTO | Shuriken Colossal | Estrela Colossal | Disco de Chakra | **Shuriken Colossal** |
| Shuriken Multiplicada | `weapons_multi` | Armas T1 (`jutsusClasses.ts:133`) | Shuriken Kage Bunshin ("Multi-Shadow Clone Shuriken") | MÉDIO | Shuriken Espelhada | Shuriken em Dobro | Chuva Dupla | **Shuriken Espelhada** |
| Agulhas de Trovão | `lightning_2` | Relâmpago T2 (`jutsusClasses.ts:79`) | Chidori Senbon ("Chidori Needles") | MÉDIO | Farpas de Trovão | Chuva de Faíscas | Espinhos Elétricos | **Farpas de Trovão** |
| Fluxo Elétrico | `lightning_fluxo` | Relâmpago T2 (`jutsusClasses.ts:83`) | Chidori Nagashi ("Chidori Current") | MÉDIO | Descarga Envolvente | Aura Voltaica | Campo Estático | **Descarga Envolvente** |
| Dragão do Trovão | `lightning_4` | Relâmpago T4 (`jutsusClasses.ts:87`) | Kirin (o dragão-raio do céu) | MÉDIO | Julgamento do Trovão | Besta do Trovão | Cometa Elétrico | **Julgamento do Trovão** |
| Esferas de Vácuo | `wind_2` | Vento T2 (`jutsus.ts:118, jutsusClasses.ts:190`) | Shinkūgyoku ("Vacuum Sphere") | ALTO | Balas de Vento | Esferas de Ar | Projéteis do Ciclone | **Balas de Vento** |
| Palma do Vendaval | `wind` | Vento T1 (`jutsus.ts:118`) | Reppūshō ("Gale Palm") | MÉDIO-ALTO | Rajada Aberta | Palma Ventania | Golpe de Rajada | **Rajada Aberta** |
| Estrela Espiral | `wind_4` | Vento T4 (`jutsus.ts:118, jutsusClasses.ts:196`) | Rasenshuriken ("Spiral Shuriken") | ALTO | Disco do Furacão | Estrela de Vento | Olho do Ciclone | **Disco do Furacão** |

Cada opção é descritiva em português (o que o golpe faz). A recomendada é a que melhor descreve o efeito na tela e não repete nenhum dos 96 nomes atuais.

**Nomes mantidos (risco BAIXO):**

* Teleporte Curto, Substituição: termos genéricos de jogo; "Substituição" é o nome do golpe de troca em qualquer RPG ninja (a história do Arco 1 já usa o tronco). Risco BAIXO; se quiser trocar: Troca de Lugar, Troca Rápida, Tronco Falso.
* Cura, Aura de Regeneração, Desintoxicação Celular, Regeneração de Área, Punho Sísmico: descritivos; Punho Sísmico é o antigo "Soco Tsunade", já com nome original.
* Sombra, Reflexo Tático, Sombra Oculta, Domínio das Sombras: descritivos.
* Ilusão, Dissipação, Visão do Abismo, Estaca da Ilusão, Noite Eterna: descritivos (Dissipação e Visão do Abismo lembram golpes da série, mas são palavras comuns; risco BAIXO).
* Pedra, Muralha de Terra, Prisão de Pilares, Projétil de Rocha, Punho de Rocha, Esmagamento de Paredes, Golem de Terra Titânico, Coração de Montanha: descritivos de terra.
* Fogo, Sopro Incinerador, Névoa Inflamável, Linha de Fogo Rasante, Lâmina de Fogo, Chuva de Meteoros: descritivos.
* Água, Muro de Água, Prisão do Vórtice: descritivos.
* Taijutsu, Rasteira Baixa, Chute Ciclone, Chute Ascendente, Cem Golpes, Mergulho Esmagador, Despertar do Corpo, Punho do Céu: descritivos (Despertar do Corpo e Cem Golpes lembram técnicas da série, mas já são genéricos).
* Chuva de Kunais, Lâminas Flutuantes, Corte Relâmpago, Kunai Explosiva, Dança dos Mil Cortes: descritivos; kunai e shuriken são armas reais.
* Faísca Rasante, Corrente Rasteira, Shuriken do Trovão, Impulso Estático, Lança Saltadora, Investida Elétrica: descritivos.
* Shuriken do Vento, Véu de Vento, Passo Aéreo, Lâmina em Arco, Tornado Cortante: descritivos.
* Transe Ocular: descritivo (hipnose pelo olhar); risco BAIXO.

### 3.2 Poderes da Akatsuki (10 poderes, `src/realtime/akatsuki.ts:34-43`)

Cada poder copia um membro da série (todos os 10). Vão trocar junto com o nome da organização.

| Vaga | Atual | Referência | Opção 1 | Opção 2 | Opção 3 | Recomendo |
|---|---|---|---|---|---|---|
| 1 | Atração do Vazio | Pain (Shinra Tensei: empurra e puxa) | Gravidade Invertida | Puxão do Abismo | Vórtice Sombrio | **Gravidade Invertida** |
| 2 | Lâmina Sanguessuga | Kisame (Samehada devora chakra) | Lâmina Faminta | Espada Devoradora | Fio Drenador | **Lâmina Faminta** |
| 3 | Foice do Pacto | Hidan (foice e ritual de sangue) | Pacto de Sangue | Foice do Juramento | Ceifa Rubra | **Pacto de Sangue** |
| 4 | Argila Viva | Deidara (argila explosiva) | Escultura Detonante | Barro Explosivo | Pó Instável | **Escultura Detonante** |
| 5 | Fios de Marionete | Sasori (marionetes de fios de chakra) | Fios do Titereiro | Teia de Controle | Cordas do Mestre | **Fios do Titereiro** |
| 6 | Corvos da Ilusão | Itachi (corvos e genjutsu) | Revoada Sombria | Bando da Noite | Asas do Pesadelo | **Revoada Sombria** |
| 7 | Cinco Corações | Kakuzu (cinco corações) | Vidas Costuradas | Coração Remendado | Pulso Quíntuplo | **Vidas Costuradas** |
| 8 | Raízes Gêmeas | Zetsu (corpo de planta) | Passo Radicular | Raízes Vorazes | Brotar Distante | **Passo Radicular** |
| 9 | Chuva de Papel | Konan (lâminas de papel) | Tempestade de Páginas | Lâminas de Pergaminho | Revoada de Origami | **Tempestade de Páginas** |
| 10 | Máscara Intangível | Tobi (intangibilidade) | Forma Fantasma | Véu Etéreo | Máscara Sem Corpo | **Forma Fantasma** |

**Item relacionado:** `manto_akatsuki` "Manto da Akatsuki" (`items.ts:109`) → opções: **Manto Cinza**, Capa dos Cinzas, Manto do Eclipse. Esforço: BAIXO, junto da organização.

### 3.3 NPCs, bosses, locais, itens, títulos

| Categoria | Nomes visíveis | Veredito |
|---|---|---|
| NPCs | Mestre, Diretor da Academia, Professora Aya, Professor Daichi, Professor Kenji, Professora Mei, Ferreiro Tetsu, Costureira Hana, Sábio Ren, Posto de Viagem | originais ou genéricos (nomes japoneses comuns): manter |
| Bosses e monstros | Rei Lodo, lodos/slimes, Lodo Sombrio, Lodo Escuro | originais: manter |
| Locais | Aldeias (4), Floresta, Caverna do Lodo, Clareira Queimada, Poço sob a Praça, Zona de Conflito, Refúgio dos Renegados, Armaria, Alfaiataria, Casa dos Pergaminhos, Academia | originais: manter. Só o Vale tem proposta (2.3) |
| Itens | Kunai de Treino, Kunai, Espada Curta, Shuriken Gigante, Espada Longa, capas, sandálias, botas, casacos, Manto do Kage, Manto do Campeão | genéricos; **"Shuriken Gigante"** (código `fuma_shuriken`) acompanha o jutsu "Shuriken Gigante de Chakra" (item 3.1). Manto da Akatsuki: ver 3.2 |
| Títulos | Discípulo do Mestre, Aprendiz Dedicado, Sombra Ascendente, "Guardião da Chama" (Arco 1), Campeão, Elite | originais: manter. "Sombra Ascendente" é neutro |
| Corte de cabelo | "Espetado" (`public/game.js:3977`; no código `rigArt.js:814` o comentário diz "estilo Naruto") | o nome "Espetado" é genérico: manter; o comentário do código pode ser neutralizado na Tarefa 2 |

### 3.4 Termos de mundo que vêm da série e ficam (decisão já tomada)

* **Kage** (e Manto do Kage), **ANBU**: mantidos por decisão do autor (`docs/endgame-visao.md`).
* **Genin, Chunin, Jounin, Chakra, Jutsu, Ninja, Kunai, Shuriken, Renegado**: ranks e termos genéricos do universo ninja. Risco reconhecido em `docs/design-do-jogo.md` seção 22; sem proposta, a menos que você peça.
* O nome **Hokage** não aparece mais para o jogador (só em IDs internos: tabela `game.hokage_candidates`, rank `HOKAGE`, mensagem de protocolo `hokage_apply`). Pode ficar.

### 3.5 Lore, missões e diálogos

* `docs/historia/arco-1.md` (A Chama Apagada): **sem nomes da série**. Lodo Ancestral, Pedras-Selo, Pergaminho em Chamas, Os Cinzas, Kagerō, Guardião da Chama são originais.
  Ponto de atenção: "Os Cinzas" é o nome que proponho para a organização (2.5), então o lore e o jogo ficam coerentes.
* Missões e diálogos no banco/código (Mestre, Diretor, Sala de Missões): sem referências encontradas.
* Documentos internos com nomes da série (não são visíveis ao jogador, mas vão para o GitHub): `revisao_egm/jutsus/*.md` (nomes originais dos jutsus nas tabelas de adaptação),
  `docs/brainstorm-pvp-invocacoes.md`, `docs/design-do-jogo.md`, `docs/endgame.md`, comentários em `public/rig.js`, `public/rigArt.js`, `public/pixelHero.js`, `arte/personagem-chibi/gerador/*.py`.
  Sugiro **não reescrever** esses (histórico de design) e só limpar os que o README e o `endgame-visao.md` repetem.

## 4. Estimativa de esforço (resumo)

| Frente | Esforço | O que mexe | Testes que quebram | Migração |
|---|---|---|---|---|
| Akatsuki (nome, Manto, ícone, UI, avisos, erros) | **Médio-alto** | ≈9 arquivos em `src/`, 4 em `public/`, docs | ≈4 (textos de aviso) | só se houver texto salvo no banco (hoje não) |
| 10 poderes da organização | Baixo | `akatsuki.ts` | 1 a 2 | não |
| 38 jutsus (nome exibido) | Baixo por item, **médio no total** | `jutsus.ts`, `jutsusClasses.ts` | ≈1 por jutsu citado (≈20 testes) | **v21**: um UPDATE em `game.jutsus.name` por jutsu (uma migração só, idempotente) |
| Clã Rubro / Umbra (só se trocar o nome) | Baixo (texto) / Médio (código) | `jutsusClasses.ts`, `gameWorld.ts` | ≈3 | só se trocar o código |
| Vale | Baixo | `maps.ts` + UI | 1 | não |
| Aldeias Nuvem/Areia (se trocar a ordem) | Baixo (texto) + passivas | `villages.ts`, `maps.ts` | ≈2 | **v21**: UPDATE de 2 linhas em `game.villages` |
| Docs (README, `endgame-visao.md`, `CLAUDE.md`) | Baixo | linhas citadas na seção 0 | 0 | não |

Uma regra de teste para impedir que nomes da série voltem a vazar (já sugerida na revisão de fantasia): `test/nomes.test.ts` com a lista proibida (Sharingan, Susanoo, Amaterasu,
Tsukuyomi, Izanami, Chidori, Rasengan/Rasenshuriken, Kirin, Byakugō, Kage Mane, Kage Bunshin, Akatsuki, Uchiha, Nara, Tsunade...) conferida contra todo nome exibido. Entra na Tarefa 2.

## 5. Ordem sugerida de aplicação (para destravar a monetização)

1. **Confirmar a ordem das aldeias** (achado 3): decisão sua, esforço mínimo, mas muda tudo que vem depois.
2. **Akatsuki** (nome, Manto, ícone, 10 poderes): é o que tem mais reconhecimento e está em toda a UI. Em seguida a coerência com "Os Cinzas" no lore.
3. **Os 4 jutsus do Clã Rubro** (Chamas Negras, Lua Ilusória, Guardião Espectral, Guardião Espectral Completo) + Olho da Percepção: o clã inteiro lembra a série.
4. **Jutsus de risco ALTO** (tradução direta): numa única migração v21.
5. **Jutsus MÉDIO-ALTO e MÉDIO**.
6. **Vale** (nome da arena) e limpeza dos docs (README, `endgame-visao.md`).
7. **Teste anti-vazamento** (`nomes.test.ts`), no fim, para travar o que foi aplicado.

Tudo em **uma migração v21** (idempotente, em `BEGIN; ... COMMIT;`, sem `DO $$`), rodada no Neon antes do código, como as outras.

## 6. Selos (conjuração): como funcionam hoje (pedido do Victor para o item #12)

**O que é:** alguns jutsus têm um tempo de preparo (os "selos") antes de sair. Hoje **47 dos 96** têm selos e **49 saem na hora**.

| Selos | Quantos | Exemplos |
|---|---|---|
| 0,2 s | 9 | Chamas da Fênix, Névoa Inflamável, Esferas de Vácuo |
| 0,3 s | 9 | Chamas do Dragão Guiado, Punho Sísmico, Costura de Sombra |
| 0,4 s | 1 | Transe Ocular |
| 0,5 s | 10 | Chuva de Meteoros, Shuriken de Sombra, Guardião Espectral Completo |
| 0,6 s | 6 | Destruição Magnífica, Míssil Dragão de Fogo, Prisão de Água |
| 0,8 s | 4 | Regeneração de Área, Dragão do Trovão, Agarre Múltiplo, Lua Ilusória |
| 1,0 s | 4 | Regeneração Mitótica, Domínio das Sombras, Laço do Destino, Templo do Nirvana |
| 1,2 s | 3 | Prisão do Vórtice, Estrela Espiral, Golem |
| 2,0 s | 1 | Palma Mística (canalização) |

**Animação (feita):** uma barra na cor do elemento sobre a cabeça do ninja (e uma maior perto dos botões); o boneco faz a pose de selos
de mão (`public/pixelHero.js`: mãos juntas no peito, troca de selo, solta abrindo os braços). Quando sai, a barra some.

**Movimento:** durante os selos o ninja anda a 50% da velocidade; nos selos longos (0,8 s ou mais) e na Chuva de Meteoros fica parado.
**Outros jutsus:** nenhum outro jutsu nem o Ataque Básico sai durante os selos. **Substituição e Teleporte** cancelam os selos (gastam metade do chakra).

**O que interrompe ("Interrompido!"):** atordoamento, silêncio, sono e empurrão de 1,5 casa ou mais. **Dano comum não interrompe**
(exceção: a Lua Ilusória cancela se tomar dano). Se o controle e o fim dos selos caem no mesmo instante, **o controle vence**.
**Custo de ser interrompido:** metade do chakra, recarga de 1,5 s e **3 s de Concentração** (a próxima conjuração não pode ser interrompida).
**Recompensa por conjurar:** selos de 0,5 s ou mais dão +5% de dano (0,5 a 0,6 s), +10% (0,8 a 1,0 s) ou +15% (1,2 s) e a recarga cai 10%.

**O que está pendente (#12):** os jutsus de sempre do tier 1 **não têm selos**: Cura, Ilusão e Sombra (a "Possessão"). A tabela de design pedia Cura 0,3 s,
Ilusão 0,5 s e Sombra 0,3 s. Ficaram desligados (`CAST_OF_EXISTING` em `jutsusClasses.ts` está vazio) porque o rankeado atual depende desses três e
a Ilusão (o controle mais usado) é o jutsu que todo jogador novo tem. Ligar é uma linha de código, mas **muda o equilíbrio do PvP** (testes de `pvpSim`, rankeado e os testes de `combat`).

**Minha recomendação: não entra na Fase 1.** A regra da fase é "só troca de nome" (sem mecânica nova), e mexer nesses três jutsus mexe no rankeado.
Sugiro deixar para a **Fase 2**, junto do balanceamento dos torneios e do modo separado de Jounin, quando o `pvpSim` será revisitado de qualquer forma.

## 7. Decisões que preciso de você

1. **Aldeias:** a ordem certa é a sua tabela (Nuvem→Vento, Areia→Rocha) ou a que está no jogo (Nuvem→Rocha, Areia→Vento)?
2. **Akatsuki:** qual das opções (recomendo "Os Cinzas") e se aceita trocar também os 10 poderes e o Manto.
3. **Clãs:** manter Rubro e Umbra (recomendado) ou trocar.
4. **Vale:** manter ou usar "Arena das Quatro Heranças".
5. **Jutsus:** aprovar as recomendações de uma vez, ou item a item (por classe é mais rápido).
6. **Selos (#12):** Fase 2 (recomendado) ou Fase 1.
7. **Docs internos** (`revisao_egm/jutsus/*.md` etc.): deixar como histórico ou limpar.

