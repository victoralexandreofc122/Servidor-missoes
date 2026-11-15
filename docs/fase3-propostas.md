# Fase 3: propostas para o Victor escolher (15/11/2026)

Regra do CLAUDE.md (09/11/2026): nome novo só entra depois que o Victor escolhe entre 3 opções.

**Escolhido pelo Victor em 15/11/2026 e aplicado na v63 (migração v38):** Bastião 1A, 2A, 3A, 4C; Áspide 1B, 2A, 3B, 4B;
Garra 1A, 2A, 3C, 4A; Zéfiro 1A, 2B, 3A, 4B; relíquias: todas da opção A.

Para responder, basta a letra de cada item, por exemplo: "Bastião 1A, 2C, 3B, 4A".

---

## 1. Jutsus dos 4 clãs novos (Etapa 4)

Cada clã ganha 4 jutsus, um por tier, como o Clã Umbra (v25). As passivas dos clãs são as do pedido. O valor de cada
jutsu passa pela auditoria dos 100 jutsus (`test/auditoriaJutsus.test.ts`) antes de entrar.

### Clã Bastião: defesa (+15% de resistência a controle, +2 s nos escudos)

| Jutsu | Opção A | Opção B | Opção C |
|---|---|---|---|
| 1 (tier 1, escudo próprio) | **Muralha Interior**: escudo de 40 por 4 s; quem te bate de perto leva 20% do golpe de volta | **Postura do Bastião**: 3 s parado, -60% de dano e provoca os monstros em 5 casas | **Pele de Ferro**: escudo de 30 e imune a empurrão por 5 s |
| 2 (tier 2, proteger aliado) | **Guarda Compartilhada**: escudo de 35 em você e no aliado mirado | **Elo de Pedra**: por 6 s, 30% do dano do aliado mirado vem para você | **Abrigo**: zona de 2 casas por 5 s, aliados dentro levam -25% de dano |
| 3 (tier 3, resposta) | **Muro que Responde**: por 2 s, quem te acertar é empurrado 2 casas e fica lento | **Investida do Baluarte**: avança 4 casas e atordoa o primeiro por 1 s | **Torre Inabalável**: 4 s imune a controle e +30% nos escudos que recebe |
| 4 (tier 4, supremo) | **Fortaleza Viva**: escudo de 120 que se refaz a cada 2 s, até 3 vezes (8 s) | **Bastião Eterno**: zona de 3 casas por 6 s, aliados imunes a controle e -40% de dano | **Juramento do Escudo**: 10 s, você leva -50% de dano e divide metade do dano dos aliados em 6 casas |

### Clã Áspide: veneno (veneno dobrado no 1º segundo; -30% de cura no alvo)

| Jutsu | Opção A | Opção B | Opção C |
|---|---|---|---|
| 1 | **Presa Veloz**: avança 3 casas e envenena (6 s) | **Cuspe da Áspide**: projétil que envenena e deixa 30% lento por 2 s | **Lâmina Envenenada**: os 3 próximos Ataques Básicos envenenam |
| 2 | **Névoa Tóxica**: zona de 2,5 casas por 5 s que envenena quem fica | **Bote Duplo**: 2 golpes rápidos; o 2º dobra se o alvo já está envenenado | **Marca da Serpente**: por 6 s o veneno no alvo dura +50% e a cura dele cai 50% |
| 3 | **Muda de Pele**: tira os efeitos ruins de você e fica intangível por 1,5 s | **Constrição**: prende 1,5 s e aplica um veneno forte | **Sangue Frio**: por 5 s, seus venenos explodem quando acabam (o dano que faltava) |
| 4 | **Coroa de Presas**: 8 projéteis em volta, todos envenenam | **Ninho de Áspides**: 3 serpentes por 8 s que mordem e envenenam | **Veneno Ancestral**: veneno de 10 s no alvo, que pula para inimigos perto quando ele se cura |

### Clã Garra: invocações (+30% de vida nas invocações; +10% de velocidade no mestre)

| Jutsu | Opção A | Opção B | Opção C |
|---|---|---|---|
| 1 | **Chamado da Matilha**: invoca uma fera pequena por 10 s | **Instinto Selvagem**: +20% de velocidade por 5 s e o próximo golpe das invocações x1,5 | **Rastro de Caça**: marca o alvo; suas invocações dão +30% de dano nele por 6 s |
| 2 | **Uivo de Comando**: as invocações avançam no alvo e atordoam 0,5 s | **Pele Partilhada**: cura 40 nas invocações e 20 em você | **Salto da Fera**: você salta 4 casas para perto da sua invocação |
| 3 | **Fúria do Bando**: 6 s com as invocações +40% mais rápidas no ataque | **Garras Gêmeas**: 2 garras por 6 s cortando em volta de você | **Troca Instintiva**: troca de lugar com a sua invocação |
| 4 | **Rei da Matilha**: invoca uma fera grande por 15 s (40% da sua vida) | **Caçada Ancestral**: todas as invocações ganham escudo e +50% de dano por 8 s | **Forma da Garra**: 10 s como fera, +30% de velocidade e Ataque Básico em cone |

### Clã Zéfiro: esquiva (5% de esquiva natural; -15% de recarga em mobilidade)

| Jutsu | Opção A | Opção B | Opção C |
|---|---|---|---|
| 1 | **Passo do Vento**: avanço de 3 casas e 0,5 s de esquiva total | **Brisa Fugidia**: o próximo golpe que você levar em 3 s é esquivado | **Corrente Ascendente**: salta 3 casas por cima de obstáculos |
| 2 | **Rajada Cortante**: linha de 5 casas que empurra | **Véu de Ar**: 4 s com +25% de esquiva | **Redemoinho**: gira, golpe em volta e tira a lentidão de você |
| 3 | **Eco do Vento**: volta para onde estava 3 s atrás | **Lâminas do Zéfiro**: 3 golpes rápidos em linha, avançando | **Céu Aberto**: 5 s com os jutsus de mobilidade sem recarga (até 3 usos) |
| 4 | **Tempestade Silenciosa**: 6 s quase invisível, 50% de esquiva e +40% de velocidade | **Mil Passos**: salta em até 5 inimigos em volta, golpeando cada um | **Olho do Furacão**: zona de 3 casas por 5 s que empurra os inimigos para fora e deixa lentos |

Depois da escolha: migração v38 (os 4 clãs no Criador e na tabela dos clãs, os 16 jutsus), as passivas, a auditoria e as
imagens.

---

## 2. Nomes das relíquias (Etapa 3)

Hoje elas estão com nomes provisórios e descritivos ("Relíquia Comum de Vida"). Três opções para cada uma:

| Relíquia (efeito) | Opção A | Opção B | Opção C |
|---|---|---|---|
| 🟢 +8% de vida máxima | Amuleto do Fôlego | Conta de Seiva | Fita do Sangue Quente |
| 🟢 +8% de chakra máximo | Amuleto da Corrente | Conta de Brasa Azul | Fita do Fluxo |
| 🟢 +5% no Ataque Básico | Amuleto do Punho | Conta de Aço | Fita do Golpe Firme |
| 🔵 Controles duram -15% | Selo da Firmeza | Pedra do Passo Certo | Nó do Equilíbrio |
| 🔵 -8% de dano recebido | Selo da Couraça | Pedra Escudo | Nó de Ferro |
| 🔵 +15% de vida máxima | Selo do Vigor | Pedra Viva | Nó da Raiz |
| 🟣 Básico devolve 5% como vida | Presa Rubra | Cálice do Golpe | Brasão da Sede |
| 🟣 Escudo abaixo de 30% de vida | Último Fôlego | Cálice da Teimosia | Brasão do Sobrevivente |
| 🟣 Jutsus -10% de chakra | Fluxo Sereno | Cálice da Calma | Brasão da Economia |
| 🟡 Renasce com 30% (1x por Era) | Coração da Fênix Cinza | Brasa que Não Apaga | Segunda Aurora |
| 🟡 Básico sempre queima | Punho da Chama Antiga | Cinza Viva | Marca do Incêndio |

---

## 3. Para conferir (não são nomes novos, mas é texto seu)

- **A Crônica das Eras** (o Cronista, `src/realtime/worldProgress.ts`): 6 capítulos, um por marco do mundo. É um primeiro
  texto: diga se quer mudar a lore.
- **Títulos dos Portadores**: seguem "Portador da/do/das ..." com os nomes dos Titãs que você deu.
