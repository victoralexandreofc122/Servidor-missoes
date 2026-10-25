# Ciclo de dia e noite e clima

O **servidor** decide a hora e o clima, iguais para todos os jogadores (`src/realtime/weather.ts`). O cliente só
desenha e mostra os bônus.

## Hora do dia

Um dia do jogo dura **48 minutos de verdade** e é contado pelo relógio do servidor. Reiniciar o servidor não volta
para o amanhecer.

| Fase | Parte do ciclo | Na tela |
|---|---|---|
| Amanhecer | 0% a 8% | sai do escuro com um tom laranja |
| Dia | 8% a 58% | claro |
| Entardecer | 58% a 67% | laranja e vai escurecendo |
| Noite | 67% a 100% | azul-escuro, com luz em volta do jogador, dos outros ninjas, das lanternas, dos postes da vila, das fogueiras e das Pedras-Selo acesas |

## Clima

O clima muda a cada **8 a 15 minutos** (sorteio com peso) e o servidor avisa todos.

| Clima | Peso | Regra | Na tela |
|---|---|---|---|
| Normal (céu limpo) | 45 | | |
| Dia quente | 20 | só de dia; quando escurece, vira normal | tom quente |
| Chuva | 20 | | céu cinza, gotas caindo, respingos no chão e relâmpagos de vez em quando |
| Neblina | 15 (+15 de madrugada e de noite) | | véu claro e bancos de neblina passando |

## Bônus nos jutsus

Os bônus valem só **ao ar livre**: vilas, Floresta e mapas abertos. Dentro de casa e na caverna, nada muda.

| Quando | Efeito |
|---|---|
| Dia quente | Fogo +5% de dano, Água −5% |
| Chuva | Água +5%, Raio +5%, Fogo −5% |
| Neblina | Ilusão: o atordoamento dura 5% a mais |
| Noite | Sombra: prende 5% a mais |

Nenhum bônus passa de **5%**, para cima ou para baixo. Clima e noite se somam, mas a soma também para em 5%
(`SKY_CAP` em `weather.ts`).

**No HUD:**
- Embaixo das barras ficam o ícone da fase (🌅 ☀️ 🌇 🌙) e o do clima (🌡️ 🌧️ 🌫️). Tocar mostra o bônus.
- Nos botões, o jutsu que está mais forte ganha um ▲ verde, e o mais fraco, um ▼ vermelho.
- Quando o clima ou a fase muda, aparece um aviso na tela.

## Para testar (admin)

- `/admin clima <normal|quente|chuva|neblina> [minutos]`: muda o clima na hora, para todos (padrão: 10 minutos). O
  dia quente só vale de dia.
- `/admin hora <amanhecer|dia|entardecer|noite>`: o ciclo pula para o começo da fase.

Os dois ficam na auditoria (`admin_audit_log`). Não há migração: o clima vive só na memória do servidor. Depois de
reiniciar, começa normal e sorteia o próximo depois de 8 minutos.
