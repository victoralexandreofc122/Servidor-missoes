# Estrutura de UI, UX e HUD: Herança do Fogo

Documento canônico da interface do jogo, feito a partir do "Guia Definitivo de Game Design, UX, UI e HUD" que o Victor
enviou em 15/11/2026. **Toda tela, botão ou aviso novo passa por este documento** (como a Bíblia do Mundo é para a lore).
O teste `test/uiHud.test.ts` cobra as regras que dá para conferir no código; o script `scripts/auditar-hud.ts` mede no
navegador o que só dá para medir com a tela aberta.

Onde estão as coisas: o HUD é DOM sobre o canvas (`public/index.html`), com o estilo em `public/hud.css` (o bloco "v66"
fica no fim e vale por cima das medidas antigas) e a lógica em `public/game.js`. Não há engine (Unity, Unreal, Godot):
a seção 6 do guia vale como método, não como ferramenta.

---

## 1. UI e UX neste jogo

- **UI** é o que o jogador vê e toca: retrato com vida, chakra e ryō; minimapa; botões de combate; chat; missões; menu;
  painéis (Mochila, Perfil, lojas, Manual, Rankeado, Vínculo, Admin).
- **UX** é o caminho: da tela de entrada, pelo Criador e pela Academia (com o "Pular a Academia"), até a Praça, a
  Floresta e o rankeado; inclui as mensagens de erro, de vitória e de derrota, as dicas na hora e o tempo de resposta.
- **Condições de uso:** celular **deitado** (o principal; em pé pede para girar), toque com os dois polegares; e o
  computador com teclado e mouse. Não há TV nem controle (a regra de 28 px a 2-3 m não se aplica; se um dia houver,
  entra aqui).

## 2. Taxonomia dos quatro tipos (Fagerholt e Lorentzon)

| Tipo | No jogo | Por quê |
| --- | --- | --- |
| **Diegética** (o ninja vê; está no mundo) | Faixa e bandana com a cor da aldeia; aura da meditação e do Estado Primal; clima, noite e névoa dos mapas trancados; quadro da Sala de Missões; placas e lojas com interior | Contam o estado do mundo sem tirar o olho da cena |
| **Não-diegética** (só o jogador vê; sobre a tela) | Retrato com vida, chakra, ryō e nível; efeitos ativos (🌙🌧🕊); minimapa; botões de combate; chat; Missões; menu ☰; barra de XP; barra do chefe; janela do alvo | Leitura em fração de segundo, como num MOBA |
| **Espacial** (só o jogador vê; está no mundo) | Nomes sobre os ninjas; números de dano e cura; avisos de "não deu" sobre o boneco; anel do alvo focado; áreas e miras dos jutsus; brilho dourado dos fragmentos; ícones de controle sobre a cabeça | O dado fica onde a ação acontece |
| **Meta** (estado do ninja; no plano da tela) | Vinheta vermelha ao levar dano (`#hurt`); tremor dos jutsus fortes; tela de derrota | Sentir o golpe sem ler número |

Regra: informação de **combate** é não-diegética ou espacial (rápida); informação de **mundo e lore** é diegética
(clima, névoa, fragmentos, faixas). Não criar barra nova para algo que o mundo já mostra.

## 3. Verbos do jogador e onde cada um mora

| Verbo | Controle (celular) | Teclado | Frequência |
| --- | --- | --- | --- |
| Andar | Joystick (nasce onde o polegar toca, na metade esquerda de baixo) | WASD / setas | Sempre |
| Ataque Básico | 🗡️ grande, canto de baixo à direita | Espaço | Altíssima |
| Jutsus 1-4 | Arco em volta do 🗡️ | 1-4 | Alta |
| Trocar de kit | 🔄 | Q | Média |
| Correr / Meditar | 🏃 / 🧘 | R / M | Média |
| Focar alvo (e soltar) | 🎯 | T ou Tab (X solta) | Média |
| Shuriken | ✴️ | (só o botão) | Média |
| Suprema, Invocar, Estado Primal | 🔱 🐾 🔥 (separados do arco, só quando valem) | (só os botões) | Baixa e decisiva |
| Falar com NPC | 💬 (só aparece perto dele) | E | Contextual |
| Chat, Missões, menus | Chat à esquerda; ☰ no alto à direita | Enter (chat), J (Missões), I (Mochila), C (Perfil), H (Histórico), Esc fecha | Baixa |

A folha de controles completa está no Manual (☰ → Manual → Controles).

## 4. Hierarquia de informação (o que fica, o que aparece, o que se pede)

1. **Sempre na tela:** vida, chakra, nível, ryō, efeitos ativos, minimapa, botões de combate, barra de XP.
2. **Aparece quando vale (contextual):** janela do alvo, barra do chefe, barra dos selos (conjuração), placar do duelo,
   💬 Falar, 🔱 Suprema (só Portador), 🐾/🔥 (só com Vínculo), aviso de "não deu", dicas na hora, cartão do tutorial.
3. **Sob demanda (menu):** Mochila e equipamentos, Perfil (atributos, jutsus, kits), Missões, Vínculo, Configurações,
   Histórico, Manual, Feedback, Rankeado, Vila, Admin.

### 4.1 HUD de combate (regra 4 do guia; v66)

Na luta (bateu, apanhou ou lançou um jutsu nos últimos **6 s**, ou tem alvo focado), o que não é da luta sai do caminho:

- as **Missões** e o **status da conexão** somem;
- o **chat** fica bem apagado (volta inteiro ao tocar nele ou escrever);
- no computador, a **grade do menu** fica apagada (continua clicável; volta inteira com o mouse em cima).

Nunca na **zona segura** nem na **Academia** (lá o passo do tutorial está nas Missões). O jogador desliga em
Config. → HUD → "HUD de combate" (guardado no aparelho). Vida e chakra **não** somem: num jogo de ação em tempo real elas
são a decisão do segundo seguinte (o modelo de Red Dead e The Last of Us, que esconde as barras, fica como proposta 9.8).

## 5. Zona do polegar (celular deitado)

```
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ [retrato · vida · chakra · ryō]                  [status]  [☰]  [minimapa]   │  VERMELHA: menu, mapa, status
 │ [efeitos]                                                                    │  (fora do alcance de propósito)
 │ [chat ─ Missões]                                    (jutsu 3) (jutsu 4)      │
 │                                         🐾 🔥 🔱        (jutsu 2)     🧘      │  AMARELA: jutsus 2-4, Suprema,
 │                                                       (jutsu 1)    ┌────┐    │  Invocar, Primal, foco, shuriken
 │   ( joystick )                                ✴️                   │ 🗡️ │    │
 │                                                          🔄        └────┘ 🏃 │  VERDE: joystick, 🗡️, jutsu 1,
 │                       ═══════ barra de XP ═══════                             │  correr, meditar, kit
 └──────────────────────────────────────────────────────────────────────────────┘
```

- **Verde** (descanso dos polegares, cantos de baixo): joystick, Ataque Básico (o maior botão, 88 px), jutsu 1, correr,
  meditar, trocar de kit.
- **Amarela** (alongar o polegar): jutsus 2 a 4, Shuriken, Focar alvo, Suprema, Invocar e Estado Primal. A **Suprema**
  fica separada do arco dos jutsus para não sair num toque de pânico.
- **Vermelha** (cantos de cima): ☰ menu, minimapa, status. **Sair do jogo** e as ações sem volta ficam dentro do menu e
  pedem confirmação.
- **Alvo de toque:** no mínimo **44 x 44 px** em todo controle do HUD (WCAG 2.5.5). Onde o desenho é menor (o "–" do
  chat), a área de toque cresce em volta dele.
- **Margens seguras:** tudo respeita `env(safe-area-inset-*)` (entalhe da câmera e barra de gestos).
- **Personalização (regra 5):** Config. → Editar layout (arrastar cada botão e o bloco do retrato), tamanho e opacidade
  dos botões e das barras, distância da câmera, efeitos dos jutsus, HUD de combate e, desde a v67, joystick fixo ou
  flutuante, câmera da mira, toque longo, retratos no PvP e barras escondidas (seção 13). "Restaurar layout padrão" desfaz.

## 6. As cinco regras de ouro do HUD, aplicadas

| Regra | Como o jogo cumpre |
| --- | --- |
| 1. Estética e atmosfera | Moldura bronze e dourada, fundo azul-noite, ícones em círculo (o mesmo para todos os botões do menu: o Vínculo ganhou o seu na v66) |
| 2. Legibilidade absoluta | Texto do HUD com **no mínimo 12 px**; contorno escuro (`--text-outline`) em todo texto sobre o mapa; contraste de pelo menos **4,5:1** onde há fundo |
| 3. Posicionamento lógico | Retrato, vida e efeitos juntos; minimapa, status e menu juntos; combate num cacho só |
| 4. Exibição sob demanda | HUD de combate (4.1); botões que só aparecem quando valem; painéis só pelo menu |
| 5. Personalização | Editar layout, tamanho, opacidade, câmera, efeitos, HUD de combate (seção 5) |

## 7. Acessibilidade cognitiva

- **Divulgação progressiva:** o botão do jutsu mostra só o ícone e o custo; o nome, o efeito, a recarga e os selos ficam
  em Perfil → Jutsus e em Detalhes na Mochila. A Extração mostra o custo e a chance; o catálogo fica embaixo.
- **Objetivos claros:** as Missões mostram uma lista com contador ("Derrotar 5 Lodos Verdes: 2/5"); o tutorial diz a
  ação exata de cada sala; o Cronista conta os fragmentos que faltam.
- **Previsibilidade e rótulos:** todo botão do menu tem ícone **e** nome; todo botão de combate tem `aria-label` com o
  nome, o custo e a tecla. Funções iguais se comportam igual em todas as telas (✕ fecha, o botão dourado confirma).
- **Respostas diretas (v66):** o aviso de "não deu" diz a **causa e o que fazer**, com números quando há:
  - "Chakra: custa 20, você tem 12" (antes: "Chakra insuficiente");
  - "Recarregando: 2,4 s";
  - "Alvo longe: chegue mais perto"; "Fora do kit ativo: troque de kit 🔄"; "Zona segura 🕊️: sem combate aqui";
  - "Jutsu de outra classe: só vale na sua classe" (antes não tinha texto e aparecia só "Não deu").
  O teste falha se o servidor ganhar um motivo novo sem texto no cliente.
- **Ações recuperáveis:** sair do jogo, redefinir atributos (2º toque), expulsar da vila ou dos Cinzas, aprovar
  renegado, declarar guerra e pular a Academia pedem confirmação.

## 8. Matriz de estados

| Tela | Padrão | Combate (estresse) | Erro | Carregando | Vazio |
| --- | --- | --- | --- | --- | --- |
| HUD | Tudo da seção 4.1 e 4.2 | HUD de combate (4.1), vinheta de dano | Aviso com causa sobre o boneco | "conectando…" no status; reconexão com guarda de 2 min | Espaço de jutsu vazio: "toque para escolher (☰ → Perfil → Kits)" |
| Missões | Lista com contador | Some na luta | "Faltam N monstros" | (vem com a entrada) | "Nenhuma missão ativa. Fale com o Mestre…" |
| Mochila | Grade de itens e equipados | (painel fechado) | Botão apagado com o motivo | (vem com a entrada) | "Nada aqui ainda. Monstros deixam ryō…" |
| Lojas e Extração | Itens, preço e saldo | (zona segura) | "Pergaminhos insuficientes para esse nível." | Botão some até a resposta | Loja "em breve" com texto |
| Rankeado e Torneio | Fila, placar, faixas | Placar do duelo no alto | Motivo de não entrar na fila | "Procurando adversário…" | "Faltam N partidas para entrar na classificação" |
| Chat e Histórico | Últimas mensagens | Apagado | — | — | "Nenhuma mensagem nas últimas 24 horas." |

Tela nova só entra com as cinco colunas preenchidas.

## 9. Resposta e tempo

- **Resposta ao toque em menos de 100 ms:** os botões afundam no toque (`:active`), o movimento é previsto no próprio
  aparelho e a recarga começa a contar no cliente.
- **Avisos (toasts) entre 2 e 5 s**, pelo tamanho do texto (cerca de 1,6 s + 40 ms por letra; `readMs` no game.js). O
  que precisa de mais tempo também vai para o chat e o Histórico. O teste falha com um aviso fora da faixa.
- **Som em cada resultado:** aviso bom, ruim ou neutro tem um som diferente (dá para saber sem ler).

## 10. Checklist de qualidade (antes de publicar uma tela)

1. **Daltonismo:** nenhuma informação só pela cor. Dano e cura têm sinal (− e +); jutsu sem chakra fica **apagado**
   (claridade, não matiz); clima com ▲ e ▼; status da conexão com texto; faixas do rankeado com nome.
2. **Proporções de tela:** a auditoria roda em 19,5:9 (844 x 390), 16:9 pequeno (667 x 375), computador (1366 x 768) e
   ultrawide 21:9 (2560 x 1080). As margens seguras valem em todas.
3. **Texto maior na tradução:** o jogo é só em português hoje; botões e caixas crescem com o texto (sem largura fixa) e
   aguentam +30 a 50% quando vier outro idioma.
4. **Conforto:** ações frequentes na zona verde; nada exige segurar dois botões longe um do outro.
5. **Auditoria e testes:** `npm run verify` e `npx tsx scripts/auditar-hud.ts <pasta>` (seção 11) sem nenhum item
   abaixo do mínimo.

## 11. Auditoria (medida no navegador automático)

`scripts/auditar-hud.ts` abre o jogo nas 4 telas e mede a área de toque efetiva (o dedo a 22 px do centro ainda acerta o
controle?), a zona do polegar, quanto da tela o HUD intercepta (o teste de espremer os olhos: o mundo tem que ser a maior
parte), o contraste e o tamanho do texto.

| Medida (celular deitado, Praça) | Antes (v65) | Depois (v66) | Meta do guia |
| --- | --- | --- | --- |
| Controles abaixo de 44 px | 4 (o "–", o campo, o ➤ e a aba Missões do chat) | 0 | 0 |
| Textos abaixo de 12 px | 6 (chakra, status, custos de 9 px, chat, aba) | 0 | 0 |
| Texto com contraste abaixo de 4,5:1 | 0 | 0 | 0 |
| Área da tela que intercepta toque | 28% | 26% | bem abaixo de 50% |
| Avisos fora de 2-5 s | 2 (1,8 s e 7 s) | 0 | 0 |
| Motivos de "não deu" sem texto | 1 (`NOT_YOUR_CLASS`) | 0 | 0 |

Achado na auditoria: a lista de efeitos (🌙🌧🕊) e o bloco do retrato ficavam por cima do cabeçalho do chat e
**roubavam o toque** do "–". Agora deixam o toque passar (só os ícones dos efeitos recebem toque), e o chat desceu 18 px.

## 12. Método para telas novas (as seis etapas do guia)

1. **Verbos:** o que o jogador faz nesta tela e que erro ela tem que evitar.
2. **Prioridade:** o que fica fixo, o que aparece no contexto, o que vai para o menu (seção 4).
3. **Rascunho e matriz de estados:** rascunho em preto e branco (texto ou desenho) e as cinco colunas da seção 8.
4. **Protótipo em movimento:** no próprio jogo, atrás de uma opção ou de um admin, com o tempo de resposta conferido.
5. **Teste com 3 a 5 jogadores** por tela principal (no Teste Alpha, pelo botão Feedback e pela observação).
6. **Integração:** `hud.css` e `game.js`, auditoria da seção 11, `npm run verify` e imagens para o Victor.

## 13. As propostas do guia (aceitas pelo Victor em 16/11/2026; feitas na v67)

Cada uma é uma escolha em **Config. → HUD**, guardada no aparelho (`nin.uiPrefs`), com o padrão indicado.

| # | Proposta | Como ficou | Padrão |
| --- | --- | --- | --- |
| 1 | **Joystick fixo** | "Joystick: Fixo" deixa a base sempre no mesmo lugar (só o círculo dele pega o toque), para a memória da mão; "Flutuante" nasce onde o polegar toca | Flutuante |
| 2 | **✋ Cancelar selos** | Aparece colado na ponta direita da barra de selos, só durante os selos (no celular deitado não há espaço livre acima do arco: lá ficava sob o minimapa). Desiste **sem perder chakra nem ganhar recarga** (servidor: `cast_stop`, motivo `stop`); o golpe que interrompe e a fuga continuam como antes | Sempre |
| 3 | **Retratos dos inimigos (PvP)** | Na arena, no rankeado e na Zona de Conflito, os até 3 inimigos mais perto (12 casas) aparecem em retratos de 48 px ao lado do 🎯, com a vida; um toque foca aquele ninja, outro solta | Ligado |
| 4 | **Câmera que segue a mira** | Mirando (arrastou ou segurou), a câmera anda até 35% do alcance na direção da mira, no máximo 3 casas; soltou, volta suave | Ligado |
| 5 | **Toque longo no jutsu** | Segurar 0,45 s mostra o cartão: nome, efeito, chakra, recarga e selos. O jutsu sem mira passa a sair ao **soltar** (toque rápido lança; segurou e leu, não lança). No jutsu com mira: segurou e leu sem arrastar, não lança; arrastou, lança | Ligado |
| 6 | **"Enquanto você esteve fora"** | Quem volta depois de **2 dias** ou mais vê: nível e XP que faltam, a missão, o marco do mundo, os fragmentos e o **próximo passo** recomendado (pontos para distribuir, missão pronta, Missão de Genin, pergaminhos para extrair, pegar um treino). Uma vez por volta. A data vem de `game.players.last_seen_at` (da v11: sem migração) | Sempre |
| 7 | **Daltonismo na auditoria** | `scripts/auditar-hud.ts` grava a tela do celular na Floresta normal e com deuteranopia, protanopia e tritanopia (matrizes de Machado, Oliveira e Fernandes, 2009) | Na auditoria |
| 8 | **Esconder vida e chakra cheios fora da luta** | Com a opção, as duas barras somem quando estão cheias e não há luta; qualquer golpe, gasto ou luta traz de volta. Ficou **desligada por padrão**, pelo motivo da seção 4.1 (o golpe no PvP aberto pode vir a qualquer momento) | Desligado |

**Achado da simulação de daltonismo:** na tritanopia, a barra de vida e a de chakra ficam do mesmo ciano. Continuam
distinguíveis porque cada uma tem o rótulo ("Vida", "Chakra"), o número e um tamanho diferente: nada depende só da cor.
Se um dia uma barra perder o rótulo, este achado volta a valer.
