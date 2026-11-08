# Conjuração e interrupção (olhos frescos, EGM)

Escopo: só a **mecânica de interromper**. O tempo de cada jutsu vem de outro documento. Base: `docs/jutsus-v2.md`,
`docs/netcode.md` (hoje não há conjuração, então a janela de interrupção é nova) e `adapt_*.md`.

## 1. O que interrompe (regra única)

**Dano comum NÃO interrompe.** Interrompe só:

1. **Controle duro** que tira a ação: atordoar, prender, levantar, paralisia que trava (não a lentidão), silêncio.
2. **Empurrão de 1,5 casa ou mais** (o Vento e a Água não atordoam; é a forma deles).
3. **Jutsus marcados "interrompe"** (lista abaixo), mesmo quando o efeito deles é curto (0,2 a 0,3 s).

Não interrompe: dano, queimadura, veneno, lentidão, escuridão, puxão curto (< 1,5 casa), escudo do alvo quebrando.

Por quê: com dano interrompendo, Kunais e Básico (golpes de 0,4 a 1 s) cancelariam tudo e o jutsu forte nunca sai
no celular. A regra fica legível: "tome cuidado com quem tem controle", não "não leve nenhum golpe".

**Exceção que fica:** o Tsukuyomi (Uchiha) já foi desenhado como "preparo 0,8 s, falha se levar dano". Ele mantém
isso como **traço próprio** (o mais forte do jogo paga com o mais frágil), escrito na descrição. É o único.

**Canalização** (Palma Mística, Byakugō, Prisão de Água mantida): é interrompida pelas mesmas regras; a cura/efeito
já feito fica, o resto para.

## 2. Marca "interrompe" por classe (1 por classe; 2 só onde é a identidade)

| Classe | Jutsu com a marca | Efeito na interrupção | Já tinha no PDF? |
|---|---|---|---|
| Fogo | Hibashiri (Linha de Fogo Rasante) | 0,2 s de atordoado | não (PDF diz "interrupt" genérico no Katon; vira esta) |
| Água | Suishōha L3 (silêncio 0,5 s) | silêncio já interrompe | **sim** (adapt) |
| Terra | Ganchūrō (Prisão de Pilares) | prender 1,0 s (já é controle) | não, vale pela regra 1 |
| Médico | Ranshinshō (Distúrbio Nervoso) | 0,3 s de atordoado | não |
| Relâmpago | Sandāboruto L3 | 0,2 s de atordoado | **sim** (adapt, "interrompe canalização") |
| Vento | Reppūshō (Palma do Vendaval) | empurra 2 (regra 2) | não, vale pela regra 2 |
| Nara | Kage Mane (Sombra) | prender (regra 1) | não, vale pela regra 1 |
| Armas | Kibaku Fuda (Kunai Explosiva) | 0,2 s de atordoado | não |
| Genjutsu | Narakumi (Visão do Inferno) | atordoa (regra 1) | não |
| Uchiha | Transe Ocular | 0,3 s (regra 1) | não (Tsukuyomi é o alvo frágil, não quem interrompe) |
| Taijutsu | Konoha Reppū (Rasteira) e Kage Buyō (levanta) | levantado | não; 2 porque é a classe colada |

Teto: nenhuma classe com mais de **2 formas baratas** (recarga ≤ 6 s) de interromper. Hoje: Taijutsu 2, resto 1-2.
A marca aparece no tooltip como etiqueta laranja **"Interrompe"**.

## 3. Quando é interrompido

- **Chakra:** devolve **metade** (perde 50%). Nada perdido = ninguém teme; tudo perdido = frustrante no celular.
- **Recarga:** vai para **2 s fixos** (ou a recarga cheia, se for menor). Pode tentar de novo logo, mas não no spam.
- **Concentração:** depois de interrompido, **3 s** em que as conjurações **não podem ser interrompidas** (ícone de
  selo dourado sobre a cabeça). O controle ainda atinge o corpo (atordoa normalmente), só não cancela a conjuração
  nova. Evita o "interromper sempre".
- **Cancelar por conta própria** (andar/esquivar durante os selos, se o outro doc permitir): devolve 75% e recarga 1 s.
- Tsukuyomi falhando por dano segue o adapt: volta metade da recarga e metade do chakra.

## 4. Leitura

**O oponente vê:** barra de conjuração fina sobre a cabeça (cor do elemento, enche da esquerda); a mão faz os
selos (3 quadros do rig); jutsus de área já mostram o aviso no chão desde o começo da conjuração. Quando a barra
estiver no fim (últimos 0,2 s) ela pisca branco. Conjuração em Concentração: barra com borda dourada ("não adianta").
**Sons:** "tsk-tsk" de selos em loop, um tom por elemento; interrupção = vidro quebrando + texto "Interrompido!"
sobre o lançador. **O lançador vê:** a mesma barra maior acima dos botões, o botão do jutsu pulsando, e ao ser
interrompido o botão treme e mostra a recarga curta de 2 s e "+50% chakra devolvido".
Celular: barra mínima de 6 px de altura, legível com o polegar em cima.

## 5. Rede

- **Cliente começa na hora** (selos e barra, sem esperar), manda `cast_start {jutsu, seq}`. O servidor valida
  (chakra, recarga, silêncio) e responde `cast_ok {fimTick}` ou `cast_no` (o cliente apaga a barra, sem gastar).
- **O servidor é dono do relógio**: a conjuração começa no tick em que chegou e acaba em `fimTick`. Para o lançador
  não "perder" tempo pelo ping, o servidor desconta metade do ping dele do tempo (teto 100 ms).
- **Interrompeu ou não:** o golpe de controle é conferido com a compensação de lag atual (posição há `ping + 100 ms`,
  teto 300 ms). Se o controle acerta no tick T e a conjuração termina em T' : interrompe se **T ≤ T'**. Empate no
  mesmo tick: **o controle vence** (quem reage merece).
- **Janela de tolerância:** se o golpe de controle foi disparado (no relógio do atacante, já compensado) até
  **100 ms antes** do fim e chega depois, ainda interrompe, desde que o jutsu resolvido não tenha sido entregue há mais
  de 100 ms; nesse caso o jutsu sai e o controle só atinge o corpo. Nunca se "desfaz" um jutsu já resolvido.
- O servidor manda `cast_break {motivo}` aos dois; cliente nunca decide.

## 6. Orçamento de controle (`pvpBalance.ts`)

- A interrupção **em si não custa orçamento**. O que custa é o controle que ela traz (0,2 a 0,3 s dos marcados contam
  normal, com o peso da tabela).
- Se o alvo está com o orçamento cheio (2,5 s em 15 s), o controle vira 0 s, mas **a interrupção ainda vale**:
  senão a contra-jogada some justamente quando o lançador é mais perigoso. Ela vale a Concentração depois.
- A conjuração **não é controle** em quem conjura (ele se prendeu sozinho).

## 7. Casos para o pvpSim e testes

1. Kunais/Básico batendo em conjuração: **não** interrompe.
2. Sandāboruto L3 no meio: interrompe, devolve 50% chakra, recarga 2 s, liga Concentração 3 s.
3. Segunda interrupção dentro dos 3 s: atordoa o corpo, conjuração continua.
4. Controle e fim da conjuração no mesmo tick: controle vence.
5. Ping 250 ms: golpe disparado 80 ms antes do fim interrompe; 150 ms antes do fim e chegando 200 ms depois: jutsu sai.
6. Orçamento cheio + marcado: 0 s de controle, interrupção acontece.
7. Tsukuyomi + qualquer dano no preparo: falha (exceção).
8. Canalização (Palma) cortada aos 50%: cura parcial fica.
9. `cast_no` (sem chakra): cliente apaga barra, nada gasto.
10. Sim por classe: % de jutsus de conjuração que saem contra cada classe; alvo 55-75% (abaixo = interrupção forte
    demais, acima = barra decorativa). Nenhuma classe acima de 2 interrupções a cada 15 s em média.
