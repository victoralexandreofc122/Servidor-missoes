# Fim de jogo: vilas, política, PvP, renegados e Akatsuki

Especificação dos sistemas de fim de jogo do **Vontade do Fogo** (pedido do Victor, 24/10/2026). O
[design geral](design-do-jogo.md) continua valendo; onde este documento muda uma decisão de lá, ele avisa.

**Regra de ouro:** o servidor é a autoridade sobre vila, Kage, guerra, aliança, renegado, ranking e Akatsuki. O
cliente só pede e mostra. As regras que não podem ser burladas ficam no **banco** (funções e travas da migração v11).

**Estado (v16, 24/10/2026): os seis módulos estão implementados** e ligam pela população (ou pelo admin). Onde mora
cada parte:

| Parte | Servidor | Cliente | Testes |
|---|---|---|---|
| Regras (vila, Kage, diplomacia, renegado, Elo, recompensa, Akatsuki, capas, manutenção) | `db/schema_v11_endgame.sql` | | `test/v11.integration.test.ts` |
| Leitura e escrita do banco | `src/realtime/endgameStore.ts`, `admin.ts` | | `v11.integration`, `v16` |
| Ativação pela população | `src/realtime/endgame.ts` | | `test/endgame.test.ts` |
| Contas puras (relação, inimigo na Zona, acesso, preço) | `src/realtime/villages.ts` | `public/politics.js` (a mesma conta) | `test/endgame.test.ts` |
| Mapas (4 vilas, Zona, Refúgio), Postos de Viagem | `maps.ts`, `config.ts` | `mapArt.js`, `world.js` (temas) | `maps.test`, `v16` |
| Mundo: passivas, acesso, viagem, PvP da Zona, poderes, capas | `gameWorld.ts` | `endgame.js` (painéis, capa no boneco) | `test/v16.test.ts` |

---

## 0. Ativação por população

Os módulos 1 a 4 só ligam quando o servidor tem gente suficiente para eles fazerem sentido. Com pouca gente, uma
guerra entre vilas vazias ou um ranking de 3 jogadores deixam o jogo pior, não melhor.

| Módulo | Liga com (jogadores ativos na semana) | Depende de |
|---|---|---|
| 1. Vilas e política | 30 | nada |
| 2. PvP e temporadas | 60 | 1 |
| 3. Renegados | 100 | 2 |
| 4. Akatsuki | 150 | 3 |
| 5. Paperdoll avançado | sempre | nada |
| 6. Modo Administrador | sempre (já existe) | nada |

- **Jogador ativo:** conta que entrou no jogo nos últimos 7 dias, já fora da Academia e que não é admin
  (`players.last_seen_at`).
- **Uma vez ligado, fica ligado.** Se a população cair, o mundo não "desfaz" vilas, Kages e renegados.
- **O admin força** qualquer módulo (`/admin fimdejogo <módulo> ligar|desligar|auto`, ou o Painel do Admin), para testar. Fica na auditoria.
- **Sem a migração v11** no banco, o jogo sobe igual e todos os módulos ficam desligados (o log avisa).

---

## 1. Vilas e política

### 1.1 As quatro vilas

| Código | Vila | Cores (já no Criador) | Passiva |
|---|---|---|---|
| `vila_1` | Folha | verde e azul-marinho | +10% de cura (jutsus de cura) |
| `vila_3` | Névoa | azul-celeste | +10% de velocidade |
| `vila_4` | Nuvem | vinho e preto | +10% de dano dos jutsus |
| `vila_5` | Areia | laranja e marrom | +10% de dano com armas |

A Vila da Pedra (`vila_2`, +10% de vida) existiu até a v13: o Victor decidiu que o jogo só terá estas quatro
(25/10/2026). A migração `db/schema_v13_sem_pedra.sql` tira a Pedra do banco; os códigos das outras não mudaram.

- **A vila é do servidor.** Ela mora em `players.village`, não no visual. Salvar o visual nunca muda a vila; a
  bandana e o conjunto só mostram as cores da vila de verdade.
- **Escolha:** no Criador, quando o Módulo 1 está ligado. Desligado, todos são da Folha (como hoje).
- **Uma troca grátis:** quem já jogava quando as vilas abriram pode trocar de vila uma vez (no Criador), desde que
  não seja Kage, candidato, renegado nem da Akatsuki.
- **Renegado não tem vila** (nem passiva).

### 1.2 Os mapas

- **Folha** é a Vila de hoje (`map_1`), com a Floresta ao sul.
- **Névoa, Nuvem e Areia** usam a mesma planta da Folha (as ruas e os prédios que os testes já medem), cada
  uma com o seu tema de cores no chão e nos telhados, a sua arena, o seu Mestre e o seu Posto de Viagem. O portão sul
  delas fica fechado.
- **Lojas e Academia** são as mesmas salas para todos: a porta de saída leva de volta à vila de onde a pessoa entrou.
- **Posto de Viagem** (NPC em cada vila, na clareira da Floresta, na Zona de Conflito e no Refúgio): leva para a
  própria vila, a Floresta, a Zona de Conflito (Módulo 2) e as vilas aliadas (50 ryō).
- **Quem entra numa vila:** quem é dela e quem é de vila aliada. Ninguém mais (nem andando, nem pelo Posto). A regra
  é a mesma no cliente e no servidor: a saída para uma vila proibida funciona como parede.
- **Morrer** fora da arena leva de volta à própria vila (renegado: ao Refúgio).

### 1.3 O Kage

- **Candidatura:** nível 60, com o Diretor da Academia (a "candidatura a Hokage" de antes virou a do Kage).
- **Eleição por vila:** fica aberta 7 dias. Votam os Genin+ da vila com conta de mais de 7 dias, um voto cada.
  Ganha quem tiver mais votos (empate: quem se candidatou antes). Sem candidato ou sem voto, abre outra.
- **Mandato:** 28 dias. A eleição seguinte abre 7 dias antes do fim.
- **Perde o cargo** quem vira renegado, entra na Akatsuki ou deixa a vila. O cargo fica vago até a próxima eleição.
- **Marca:** título "Kage da <vila>", anúncio para todos na posse e o Manto do Kage (Módulo 5).

### 1.4 O painel do Kage (diplomacia)

| Ação | Como | Regra |
|---|---|---|
| Declarar guerra | o Kage sozinho | não pode estar aliado nem em paz forçada com aquela vila |
| Encerrar guerra | quem declarou encerra sozinho; o outro lado propõe paz e o primeiro aceita | |
| Propor aliança | proposta, e o outro Kage aceita ou recusa (vale 48 h) | no máximo **1 aliança** por vila; não pode estar em guerra |
| Desfazer aliança | qualquer um dos dois Kages | |
| Banir da vila | Módulo 3 | |

- **Prazo entre mudanças:** a mesma dupla de vilas só muda de estado uma vez a cada 24 h.
- Toda ação do Kage fica registrada (`game.kage_actions`), com quem, quando e o porquê.

### 1.5 O que a diplomacia muda

| Estado | Zona de Conflito | Acesso | Economia |
|---|---|---|---|
| **Guerra** | os ninjas da vila inimiga aparecem em vermelho e cada um derrotado dá espólio (25 + 2 x nível em ryō) | não entram na vila um do outro | lojas da própria vila +10% enquanto ela tiver alguma guerra (esforço de guerra) |
| **Neutro** | podem lutar, sem espólio | não entram | nada |
| **Aliança** | não se atacam | entram na vila um do outro (Posto de Viagem: 50 ryō) | lojas da própria vila −5% (rotas de comércio) |

### 1.6 Eventos globais

O admin (ou, no futuro, o calendário de eventos) cria eventos com hora para acabar:

- **Guerra forçada** entre duas vilas: vale por cima do que os Kages decidiram.
- **Trégua forçada** (entre duas vilas ou entre todas): ninguém declara guerra; as guerras param enquanto durar; na
  Zona de Conflito só se luta contra renegados e Akatsuki.

---

## 2. PvP geral e temporadas

### 2.1 Zona de Conflito

- Mapa novo, só pelo Posto de Viagem, com um **acampamento** de cada vila (pequena zona segura onde se chega) e o do
  Refúgio. Tem monstros mais fortes que a Floresta.
- **PvP livre**, sem duelo: todo mundo pode atacar todo mundo, menos os aliados (e a própria Akatsuki entre si).
- Atacar ninja da **própria vila** é permitido, mas conta para o karma (Módulo 3).
- Morrer: volta para a própria vila, sem perder nada (regra do design geral).

### 2.2 Ranking (MMR)

- **Elo**, começando em 1000: global (para sempre) e por temporada. A conta é do banco (`game.record_pvp_kill`).
- **Conta:** derrotar outro jogador na Zona de Conflito. A arena é treino e **não conta**.
- **Contra trapaça (combinar vitórias):**
  - a mesma dupla conta no máximo 3 vezes por dia;
  - diferença de nível maior que 10: não muda o ranking de ninguém;
  - **conta de admin não entra no ranking** (nem como vencedor, nem como derrotado, nem nas recompensas), e nenhum
    comando de admin mexe no MMR.

### 2.3 Temporadas

- **Ciclos de 60 dias.** No fim, o servidor fecha a temporada sozinho (numa transação só) e abre a próxima. O MMR da
  temporada recomeça em 1000; o global continua.
- **Recompensas** (mínimo de 10 vitórias e derrotas somadas na temporada):

| Posição | Título exclusivo | Ryō | Extra |
|---|---|---|---|
| 1º | Campeão da Temporada N | 5.000 | Manto do Campeão |
| 2º a 10º | Elite da Temporada N | 2.000 | Manto do Campeão |
| 11º a 50º | Veterano da Temporada N | 500 | |

---

## 3. Renegados

### 3.1 Como alguém vira renegado

| Caminho | Quem | Regra |
|---|---|---|
| **Banimento** | o Kage | justificativa obrigatória (10 a 300 letras); no máximo 5 por semana por vila, somando banimentos e denúncias aprovadas; não pode banir a si mesmo |
| **Denúncia** | jogador da mesma vila com rank igual ou maior que o do denunciado | manda a justificativa; o Kage aprova (vira renegado) ou recusa; uma denúncia aberta por dupla |
| **Karma** | automático | derrotar 20 ninjas da própria vila na Zona de Conflito. A contagem não aparece em lugar nenhum |

- **É irreversível.** O banco recusa desfazer (trava em `game.players`), a não ser por comando de admin
  (`/admin renegado <nome> off`, que devolve a vila de antes).
- O alvo é avisado e o servidor anuncia: "<nome> virou renegado (Folha)".

### 3.2 A vida de renegado

- Perde a vila e a passiva. A bandana aparece **riscada**.
- **Não entra em nenhuma vila.** Mora no **Refúgio dos Renegados** (mapa isolado, com a Armaria e a Casa dos
  Pergaminhos dos renegados e um Posto de Viagem que só vai para a Zona de Conflito).
- **Guerra eterna:** na Zona de Conflito, todo ninja de vila é inimigo dele, e ele de todos.

### 3.3 Recompensa pela cabeça (bounty)

- Cada ninja de vila que o renegado derrota aumenta a recompensa: **+50 ryō + 5 x nível de quem caiu**.
- Quando um ninja de vila derrota o renegado, recebe **metade da recompensa** (e, se ela passou de 2.000 ryō, um
  pergaminho da classe dele), e a recompensa cai pela metade.
- Na Zona de Conflito, a recompensa aparece sobre o nome do renegado.
- **Contra trapaça:** a mesma dupla só aumenta (ou cobra) a recompensa uma vez por dia; conta de admin não entra.

---

## 4. Akatsuki

- **10 vagas no servidor inteiro** (o banco garante: vagas 1 a 10, uma pessoa por vaga).
- **Líder (vaga 1):** escolhido pelo admin (`/admin akatsuki lider <nome>`).
- **Convites:** só o líder convida, para uma vaga livre (cada vaga tem o seu poder). O convite vale 48 h.
- **Requisitos:** nível 40 ou mais. **Aceitar transforma em renegado**, se ainda não for (o convite avisa: é
  irreversível). Membro não ataca membro.
- **O líder** pode expulsar um membro (a vaga e o poder ficam livres; ele continua renegado).
- **Poder único:** um botão a mais na tela, só dos membros.

| Vaga | Poder | O que faz |
|---|---|---|
| 1 (líder) | Atração do Vazio | puxa os inimigos a até 4 casas para junto de si e atordoa 1 s |
| 2 | Lâmina Sanguessuga | por 12 s, cada Ataque Básico drena 12 de chakra do alvo para o dono |
| 3 | Foice do Pacto | por 12 s, o Ataque Básico cura o dono em 40% do dano |
| 4 | Argila Viva | projétil de 7 casas que explode num raio de 2,5 casas (45 de dano) |
| 5 | Fios de Marionete | linha de 6 casas que prende o primeiro alvo por 3 s e puxa ele 2 casas |
| 6 | Corvos da Ilusão | atordoa todos a até 3,5 casas por 2 s |
| 7 | Cinco Corações | escudo de 3 cargas: os próximos 3 golpes perdem metade do dano |
| 8 | Raízes Gêmeas | teleporte de 9 casas (para antes da parede) e +20% de velocidade por 4 s |
| 9 | Chuva de Papel | 7 lâminas de papel em leque de 100°, 5 casas, 20 de dano cada |
| 10 | Máscara Intangível | 2,5 s sem receber dano nem atordoamento |

- **Caçadores de Kages:** um membro que derrota um Kage na Zona de Conflito ganha 3.000 ryō e o título "Caçador de
  Kages", e o servidor anuncia. Derrotar jogador de nível 50+ dá 200 ryō.
- **Marca:** o Manto da Akatsuki (Módulo 5).

---

## 5. Paperdoll avançado

- **Na mão:** kunai e espada curta. **Nas costas:** Shuriken Gigante e pergaminho. A espada longa fica deitada no
  cinto, atravessada nas costas (a posição aprovada pela referência das 8 vistas).
- **Capas:** camada nova no boneco (3 vistas, todas as animações). Capa de Viagem (Alfaiataria), Manto do Kage
  (enquanto for Kage), Manto da Akatsuki (membros) e Manto do Campeão (temporada).
- **Mostrar ou esconder** a capa, a arma e o pergaminho (⚙️). Só muda o que os outros veem; a arma continua valendo.

---

## 6. Modo Administrador

Os comandos de antes continuam (o nível do jutsu e a quantidade do item são opcionais: 1). Novos, todos na
auditoria e sem anúncio (desde a v19 em português e também no Painel do Admin 🛡️; `endgame` e `on/off` continuam
valendo):

| Comando | O que faz |
|---|---|
| `/admin fimdejogo <vilas\|pvp\|renegados\|akatsuki> <ligar\|desligar\|auto>` | liga, desliga ou devolve ao automático |
| `/admin vila <nome> <folha\|pedra\|nevoa\|nuvem\|areia>` | muda a vila de alguém |
| `/admin kage <vila> <nome>` | põe alguém como Kage (mandato de 28 dias) |
| `/admin eleicao <vila>` | fecha a eleição da vila agora |
| `/admin evento <guerra\|tregua> <vila\|todas> [vila] <horas>` | evento global |
| `/admin renegado <nome> <sim\|nao>` | torna renegado ou desfaz (a única forma de desfazer) |
| `/admin akatsuki <lider\|remover> <nome>` | escolhe o líder ou tira alguém |
| `/admin temporada fechar` | fecha a temporada agora (as contas de admin nunca recebem recompensa) |

---

## Risco de propriedade intelectual

Folha, Névoa, Areia, Nuvem, Kage, Akatsuki, renegado (missing-nin) e "Vontade do Fogo" vêm todos de
Naruto. Juntos, deixam claro que este é um jogo de fã de Naruto. Para jogar entre amigos, sem cobrar, o risco é baixo;
para lançar ao público ou vender qualquer coisa, os donos da marca podem pedir para tirar o jogo do ar. Por isso os
nomes ficam em **um lugar só** (`src/realtime/villages.ts` e o catálogo do banco): trocar é editar uma tabela.
