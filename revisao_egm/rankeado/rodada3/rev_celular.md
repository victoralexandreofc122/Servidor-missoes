# Revisão Goldfish, rodada 3: leitura no celular deitado

**Nota: 8,5 / 10** (era 7,5)

## Resolvido
- Os avisos (toast) agora saem abaixo das pílulas (img 8 e 10): Desafio, Assistir e Sentar ficam livres para ler e tocar.
- O banner "PARTIDA ANULADA" (cinza) traz o motivo numa linha só e o "Jogar de novo" fica ao alcance (img 6).
- Fileira curta: "Desafio · Assistir/Parar/Sentar · 🏆" ocupa cerca de 320 px e não encosta no retrato nem no minimapa.
- O placar mostra "1 esperando adversário / Aguardando" e a fila aparece como "Fila: 1º · Cancelar" (img 3). Lê bem.
- O botão Sentar finalmente aparece numa captura limpa (img 10).

## Importante
1. **Placar contradiz a anulação.** Na img 6, o placar diz "FIM · Rival venceu" logo acima de "PARTIDA ANULADA", e o
   chat diz "Rival venceu (o outro saiu)". **Fazer:** quando a partida não conta, o placar deve mostrar "FIM · Anulada",
   e o chat deve usar a mesma palavra. O W.O. sem dano ficou ambíguo: decidir se é anulada ou W.O. e usar uma só regra.
2. **Desafio cheio e em destaque durante a luta dos outros.** Nas img 4, 8 e 9, o Desafio continua vermelho e forte
   enquanto outros lutam, e parece que dá para entrar já. **Fazer:** durante uma partida, deixá-lo mais apagado ou trocar
   para "Desafio · entrar na fila", para ficar claro que ele só põe o ninja na fila.

## Detalhe
3. A faixa do minimapa continua cortada ("ZONA SEGURA · 3 JO…" e "ARENA · 3 JOGA…") e o "Nv 1 · Névoa" do placar tem
   cerca de 11 px. Encurtar a faixa (tirar "Zona segura") e subir o texto para 12-13 px.
4. O "N/10 partidas para entrar na premiação" não aparece no Ranking vazio (img 7): só se lê "Só entra quem fez 10
   partidas" no rodapé miúdo. Mostrar "0/10 partidas" junto de "Você ainda não lutou" e conferir com dados reais.
5. O Sair continua sozinho na 3ª fila quando há Admin (img 2, 4, 8 e 9) e fica perto do Tela cheia. Confirmar que o Sair
   pede confirmação no celular.
6. O chat da img 6 e 7 repete "Partida sem nenhum dano: não conta pontos" além do banner. Ok, mas pode cortar.
