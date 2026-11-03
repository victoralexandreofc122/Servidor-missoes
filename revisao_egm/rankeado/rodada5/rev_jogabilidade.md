# Revisão Goldfish, rodada 5: jogabilidade e atração do PvP (rankeado)

**Nota: 8,5/10** (na rodada 4 também foi 8,5). A luta em si ficou legível e as regras de saída fecharam. O que impede a nota de subir é o momento da vitória, que nas fotos ainda não tem clímax.

## Resolvido
- **Começo da rodada (img 4):** os lutadores começam afastados, um de cada lado, com anel dourado (Rival) e anel vermelho (Kenji) e nomes separados. Agora dá para ler quem é quem.
- **Ninguém sai da partida.** No código, o `rankedAction('leave')` recusa a saída com "A luta já começou: vá até o fim!". O `rankedGone` cancela a partida na preparação e devolve o adversário para a frente da fila. Na luta, conta como W.O. O castigo de saída dobra a cada vez no mesmo dia.
- **W.O. (img 6) e partida anulada (img 5):** o placar mostra "FIM · Rival venceu" e "FIM · Anulada", e as duas faixas explicam o motivo. Ficou coerente.
- **Partida em andamento (img 4):** o chat some e o HUD fica limpo.
- **Quem espera:** o botão "Assistir" na passarela (img 10) e o "Sentar" na arquibancada (img 12) dão o que fazer enquanto se espera.

## Importante
1. **A vitória e a derrota com pontos (img 7, 8) ainda mostram "ARENA LIVRE · Aperte Desafio" no placar.** As imagens 7 e 8 usam valores de exemplo, mas na foto o "Fim" não segura. Também não aparece o aviso "Subiu para PRATA!": a img 7 mostra só a etiqueta pequena "Prata". O código já tem as duas coisas (game.js, linhas 723 e 2033). *Fazer:* tirar as fotos 7 e 8 de uma partida real que termine com subida de faixa e confirmar o placar em "FIM" junto com o aviso grande. Não dá para aprovar o clímax sem essa prova.
2. **Cair da conexão dá W.O. na hora, sem tolerância.** O `rankedGone` chama `forfeit` assim que a desconexão chega. No celular, uma troca de rede ou de app já entrega a partida e ainda aplica o castigo. *Fazer:* dar 10 a 15 s para a pessoa reconectar antes do W.O., com o aviso "Rival caiu: aguardando reconexão (12 s)".
3. **Na fila (img 2), quem espera fica empilhado no ponto de entrada.** Os nomes "V…" e "Rival" ficam colados e se escondem. *Fazer:* espalhar os ninjas ao entrar no Vale, ou esconder o nome dos outros jogadores quando estiverem colados.

## Detalhe
4. O aviso de admin "Vale das Estátuas (x, y)" continua em cima dos botões (img 10, 11, 12) e no chat. Ele deve aparecer só no modo de depuração.
5. O placar não mostra "Próximo: X × Y" para a plateia, e não há aviso sonoro de "você é o próximo".
6. Na img 7, o "Jogar de novo" fica a um toque, mas a barra "Faltam N para a próxima faixa" não aparece na tela de resultado. Ela só está no Ranking.
