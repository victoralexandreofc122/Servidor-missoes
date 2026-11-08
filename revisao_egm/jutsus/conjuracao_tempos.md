# Tempo de conjuração dos jutsus (proposta Goldfish, 2026-11-03)

Base: `docs/jutsus-v2.md` seção 2, as 5 adaptações `adapt_*.md` (94 jutsus) e `docs/habilidades.md` seção 2
(a proposta antiga de 0,8 s só nos tier 4). Hoje tudo sai na hora; esta proposta amplia aquela ideia em faixas.

## 1. Regra geral

### Faixas

| Faixa | Tempo | Para quem | Aviso ao oponente |
|---|---|---|---|
| Instantâneo | 0 | defesa, fuga, buffs, o "pão com manteiga" de cada árvore | nenhum (só a animação curta de sempre) |
| Rápido | 0,2-0,3 s | tier 1-2 de dano com controle leve ou área pequena | 2 selos nas mãos + brilho da cor do elemento no personagem |
| Médio | 0,5-0,6 s | tier 2-3 com área média, controle de 1 s ou dano alto | selos + círculo de chakra no chão sob quem conjura + marca no alvo/área (contorno fraco) |
| Longo | 0,8-1,0 s | tier 3-4 com área grande, controle forte ou dano máximo | tudo acima + área de efeito desenhada no chão desde o 1º quadro + som de selos |
| Ritual | 1,2 s | só tier 4 (no máximo 1 por árvore) | tudo acima + barra de conjuração visível sobre a cabeça |

Teto: no PvP **nada passa de 1,2 s**. Fora do PvP (monstros, chefes) os tempos são os mesmos (um número só, fácil de aprender).

### Critérios (somar pontos e cair na faixa)

- Tier: 1 = 0, 2 = 1, 3 = 2, 4 = 3.
- Área: raio ≥ 3 ou vários alvos = +1; raio ≥ 4 = +2.
- Controle: prender/atordoar/levantar ≥ 1 s ou puxão = +1; ≥ 1,5 s = +2.
- Dano: base ≥ 28 = +1.
- **Corte:** é defesa/fuga (escudo, Substituição, recuo, salto, muro, Kai, contra-ataque) = **sempre 0**.
- Pontos 0-1 = instantâneo; 2 = rápido; 3 = médio; 4 = longo; 5+ = ritual (se tier 4) ou longo.
- Ajuste fino de design (marcado na tabela com *): avanços com dano, rajadas corpo a corpo e jutsus que **já têm aviso no chão** (meteoros, Kirin, Kunai Explosiva) ficam uma faixa abaixo, porque o aviso já é o tempo de reação do oponente; não se soma conjuração longa em cima de aviso longo.

### O que interrompe

- **Interrompe:** atordoar, levantado, empurrão, puxão, silêncio, prender (Sombra, Pilares, Estaca). É a função nova desses controles: virar resposta à conjuração.
- **Não interrompe:** dano comum, lentidão, queimadura, escuridão. Exceção: Tsukuyomi (ritual) falha se levar qualquer dano, como já está na adaptação.
- Interrompido: o jutsu não sai, **volta 50% do chakra** e a recarga fica em **1,5 s** (não a recarga cheia). Castigo leve: perder tempo já é o preço.
- O próprio jogador pode cancelar andando para trás/rolando? Não: cancelar só com Substituição ou outro instantâneo de fuga (sai do jutsu, chakra volta 50%).
- Interromper conta no **orçamento de controle** como sempre (nada de controle extra de graça).
- Lag: a decisão "interrompeu ou não" usa a compensação de `docs/netcode.md` (o servidor julga pelo tempo do golpe).
- Teto de interrupções: o duelo de 50 s tem pouco controle; por isso **só médio, longo e ritual** dão espaço real para interromper. Rápido (≤ 0,3 s) praticamente não se interrompe por reação, só por controle que já estava a caminho.

### Movimento durante a conjuração

| Tipo | Movimento |
|---|---|
| Rápido | anda a 50% |
| Médio de projétil/linha/olhar (mira na direção) | anda a 50%; a direção trava no último 0,1 s |
| Médio de zona/alvo à distância | anda a 50% |
| Longo e ritual | **parado** (raiz no chão: é o preço do poder e o que dá chance de punir) |
| Golpe corpo a corpo com conjuração | parado (o avanço/golpe sai no fim) |
| Canalizados que já existem (Palma Mística) | seguem a regra própria (anda devagar) |

### Recompensa da conjuração (para não ser só castigo)

- Médio: o jutsu leva **+5% de dano** ou **+0,1 s de controle** sobre o número da adaptação (dentro do teto do tier e do orçamento).
- Longo: **+10% de dano** ou **+15% de área** (respeitando raio 5 / linha 10).
- Ritual: **+15% de dano** e o efeito sai **sem projétil a desviar** (cai direto onde o aviso mostrou) ou ganha um efeito extra já previsto na maestria.
- Toda conjuração ≥ 0,5 s tem **recarga 10% menor** (o tempo parado já é custo).
- O que **já tinha preparo** na adaptação (Transe Ocular 0,4, Narakumi 0,3, Izanami 0,5, Tsukuyomi 0,8) troca o "preparo" pelo tempo desta tabela: um sistema só.
- No PvP o `pvpSim` deve rodar com os tempos para conferir que as classes de conjuração longa (Ilusão, Nara, Fogo) não caem fora de 45-55%.

## 2. Tabela dos 94 jutsus

Anda? = "sim" (normal, instantâneo), "50%" ou "parado". * = ajuste fino explicado nos critérios.

### Terra (Doton) - 9

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Terra | Pele de Pedra | 1 | 0 | sim | defesa |
| Terra | Muralha de Terra | 1 | 0 | sim | defesa, tem que ser resposta |
| Terra | Toupeira Oculta | 1 | 0 | sim | fuga |
| Terra | Prisão de Pilares | 1 | 0,3 | 50% | prende 1 s à distância |
| Terra | Projétil de Rocha | 1 | 0 | sim | dano básico da árvore |
| Terra | Pântano do Submundo | 2 | 0,5 | 50% | zona raio 3 com lentidão longa |
| Terra | Punho de Rocha | 2 | 0 | sim | buff de Básico |
| Terra | Esmagamento de Paredes | 3 | 0,6 | 50% | prende 1 s + base 28 |
| Terra | Golem de Terra Titânico | 4 | 1,2 | parado | ritual, invocação grande |

### Médico - 9

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Médico | Cura | 1 | 0,3 | 50% | cura em área; resposta, mas não instantânea para dar janela |
| Médico | Palma Mística | 1 | 0 | canal | já é canalizada 2 s |
| Médico | Desintoxicação Celular | 1 | 0 | sim | limpeza é resposta |
| Médico | Bisturi de Chakra | 1 | 0 | sim | buff de Básico |
| Médico | Aura de Regeneração | 1 | 0 | sim | cura pequena, ritmo |
| Médico | Distúrbio Nervoso | 2 | 0,3 | 50% | controle 1 s em alvo único |
| Médico | Soco Tsunade | 2 | 0,3* | parado | corpo a corpo, levantado; faixa baixa por ser colado |
| Médico | Regeneração de Área | 3 | 0,8 | parado | zona raio 4, cura grande |
| Médico | Regeneração Mitótica | 4 | 1,0 | parado | cura máxima; longo para ser punível |

### Fogo (Katon) - 11

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Fogo | Bola de Fogo | 1 | 0 | sim | o jutsu de ritmo |
| Fogo | Sopro Incinerador | 1 | 0 | sim | cone curto, dano baixo |
| Fogo | Névoa Inflamável | 1 | 0,2 | 50% | zona com escuridão |
| Fogo | Linha de Fogo Rasante | 1 | 0 | sim | linha curta, dano básico |
| Fogo | Chamas da Fênix | 2 | 0,2 | 50% | leque, vários alvos |
| Fogo | Chamas do Dragão Guiado | 2 | 0,3 | 50% | linha instantânea 8 sem desvio |
| Fogo | Nuvem de Cinzas Ardentes | 2 | 0* | sim | já tem aviso de 1 s no chão |
| Fogo | Lâmina de Fogo | 2 | 0 | sim | buff de Básico |
| Fogo | Destruição Magnífica | 3 | 0,6 | 50% | cone 120° base 28 |
| Fogo | Míssil Dragão de Fogo | 3 | 0,6 | 50% | base 30 + explosão |
| Fogo | Chuva de Meteoros Flamejantes | 4 | 0,5* | parado | raio 4, mas já tem aviso de 0,8 s por meteoro |

### Água (Suiton) - 9

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Água | Jato d'Água Frontal | 1 | 0 | sim | jutsu de ritmo |
| Água | Dragão d'Água Básico | 1 | 0 | sim | projétil básico |
| Água | Muro de Água | 1 | 0 | sim | defesa |
| Água | Ocultação na Névoa | 1 | 0 | sim | fuga |
| Água | Onda de Choque Aquática | 2 | 0* | sim | anel que empurra: resposta de quem é cercado |
| Água | Clone de Água | 2 | 0 | sim | distração/fuga |
| Água | Xarope Pegajoso | 2 | 0,2 | 50% | zona pequena de lentidão |
| Água | Prisão de Água | 3 | 0,6 | 50% | prende 1,5 s |
| Água | Prisão Absoluta do Vórtex Negro | 4 | 1,2 | parado | ritual: raio 5 + puxão |

### Nara - 8

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Nara | Possessão da Sombra | 1 | 0,3 | 50% | prende; marca da classe, curta para não travar o ritmo |
| Nara | Reflexo Tático | 1 | 0 | sim | fuga |
| Nara | Costura de Sombra | 2 | 0,3 | 50% | leque que prende 0,8 s |
| Nara | Armadilha de Chão | 2 | 0 | sim | armadilha: o aviso é a própria armadilha |
| Nara | Estrangulamento | 3 | 0 | sim | só em alvo já preso; conjuração jogaria fora o combo |
| Nara | Shuriken de Sombra | 3 | 0,5 | 50% | linha 10 que prende 1 s |
| Nara | Agarre de Sombra Múltiplo | 4 | 0,8 | parado | prende 2 alvos |
| Nara | Campo Absoluto Nara | 4 | 1,0 | parado | zona raio 5 |

### Armas - 8

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Armas | Chuva de Kunais | 1 | 0 | sim | jutsu de ritmo |
| Armas | Shuriken Kage Bunshin | 1 | 0 | sim | projétil básico |
| Armas | Lâminas Flutuantes | 2 | 0 | sim | área em si, dano baixo |
| Armas | Shuriken Gigante | 2 | 0,2 | 50% | bumerangue, dois acertos |
| Armas | Corte Iai da Lua Crescente | 3 | 0,2* | parado | avanço com dano; iai pede pausa curta |
| Armas | Kunai Explosiva | 3 | 0* | sim | já tem aviso de 0,8 s no chão |
| Armas | Dança dos Mil Cortes | 4 | 0,5* | parado | a dança já dura 1,6 s |
| Armas | Dragões Gêmeos Ascendentes | 4 | 0,5* | parado | já tem aviso de 1 s |

### Ilusão (Genjutsu) - 8

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Ilusão | Ilusão | 1 | 0,5 | 50% | controle 1,5 s em anel raio 3 |
| Ilusão | Dissipação (Kai) | 1 | 0 | sim | limpeza, resposta |
| Ilusão | Visão do Inferno | 2 | 0,3 | 50% | troca o preparo 0,3; atordoa 1 s |
| Ilusão | Estaca da Ilusão | 2 | 0,3 | 50% | prende 1 s |
| Ilusão | Noite Eterna | 3 | 0,5 | 50% | escuridão 3 s |
| Ilusão | Árvore Prendedora | 3 | 0,6 | 50% | prende 1,2 s |
| Ilusão | Izanami | 4 | 1,0 | parado | prende 1,5 + silêncio |
| Ilusão | Templo do Nirvana | 4 | 1,0 | parado | zona raio 4 |

### Relâmpago (Raiton) - 9

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Relâmpago | Faísca Rasante | 1 | 0 | sim | jutsu de ritmo (atordoa só 0,4 s) |
| Relâmpago | Corrente Rasteira | 1 | 0 | sim | linha, dano básico |
| Relâmpago | Shuriken do Trovão | 1 | 0 | sim | projétil básico |
| Relâmpago | Impulso Estático | 1 | 0 | sim | fuga |
| Relâmpago | Agulhas de Trovão | 2 | 0,2 | 50% | leque de 5 |
| Relâmpago | Lança de Raio | 2 | 0,2 | 50% | ricochete |
| Relâmpago | Fluxo Elétrico | 2 | 0 | sim | aura em si: resposta de quem é colado |
| Relâmpago | Chidori | 3 | 0,5* | parado | avanço base 30 + atordoa; o carregar é icônico |
| Relâmpago | Kirin | 4 | 0,8* | parado | já tem aviso de 1 s; total ~1,8 s até o golpe |

### Vento (Fūton) - 8

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Vento | Palma do Vendaval | 1 | 0 | sim | empurrão: resposta |
| Vento | Shuriken do Vento | 1 | 0 | sim | projétil básico |
| Vento | Véu de Vento | 1 | 0 | sim | escudo |
| Vento | Passo Aéreo | 1 | 0 | sim | fuga |
| Vento | Esferas de Vácuo | 2 | 0,2 | 50% | rajada de 3 |
| Vento | Lâmina em Arco | 2 | 0,3 | 50% | linha larga base 28 |
| Vento | Tornado Cortante | 3 | 0,6 | 50% | levanta 0,8 s em área |
| Vento | Estrela Espiral | 4 | 1,2 | parado | ritual: base 30 + corte de cura |

### Uchiha - 7

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Uchiha | Olho da Percepção | 1 | 0 | sim | defesa |
| Uchiha | Transe Ocular | 1 | 0,3 | 50% | troca o preparo 0,4; atordoa 0,8 s |
| Uchiha | Olho da Cópia | 2 | 0 | sim | contra-ataque é resposta |
| Uchiha | Amaterasu | 3 | 0,5 | 50% | queima negra longa |
| Uchiha | Susanoo Esquelético | 3 | 0 | sim | escudo |
| Uchiha | Susanoo Perfeito | 4 | 0,5 | parado | escudo + transformação: médio, nunca resposta instantânea a tudo |
| Uchiha | Tsukuyomi | 4 | 1,2 | parado | ritual; falha se levar dano |

### Taijutsu - 8

| Árvore | Jutsu | Tier | Tempo | Anda? | Por quê |
|---|---|---|---|---|---|
| Taijutsu | Golpe Avançado | 1 | 0 | sim | jutsu de ritmo |
| Taijutsu | Rasteira da Folha | 1 | 0 | sim | lentidão curta |
| Taijutsu | Chute Ciclone | 2 | 0 | sim | anel que empurra: resposta |
| Taijutsu | Sombra da Folha Dançante | 2 | 0,2 | 50% | avanço + levantado |
| Taijutsu | Cem Golpes | 3 | 0* | sim | a sequência de 1 s já é o tempo |
| Taijutsu | Lótus Primária | 3 | 0,3* | parado | avanço base 28; já paga vida |
| Taijutsu | Abertura dos Portões | 4 | 0,5 | parado | buff tier 4, abrir o portão |
| Taijutsu | Pavão da Manhã | 4 | 0,6* | parado | rajada base 30 em cone |

Contagem: 9 + 9 + 11 + 9 + 8 + 8 + 8 + 9 + 8 + 7 + 8 = **94**. Instantâneos: 44 (inclui a Palma Mística, que é canalizada); rápidos (0,2-0,3 s): 21; médios (0,5-0,6 s): 18; longos (0,8-1,0 s): 7; rituais (1,2 s): 4 (Golem, Vórtex Negro, Estrela Espiral, Tsukuyomi). Nenhum passa de 1,2 s.
