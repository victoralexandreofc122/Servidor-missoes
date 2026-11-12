# Padrões observados nas cabeças e corpos do Graal

Referência pedida pelo Victor (graalguide.com, páginas de cabeças e corpos). Usamos só os **padrões de estilo**, nunca
cópia de peça: tudo aqui é desenhado do zero no gerador.

## Cabelos

1. **Volume maior que o crânio:** o cabelo passa 2 a 4 pixels da cabeça dos lados e em cima. A cabeça "some" dentro dele.
2. **Borda feita de pontas de mecha:** o contorno de baixo e das laterais é serrilhado, uma ponta a cada 2 ou 3 pixels,
   nunca uma linha reta.
3. **Franja em mechas pontudas** cobrindo a testa até a sobrancelha, às vezes caindo sobre um olho.
4. **Mechas separadas por sombra:** linhas escuras finas descem do topo até as pontas; brilho em pequenos traços, não em
   faixa contínua.
5. **Rampa escura de 4 tons** com contorno quase preto; cabelos claros (branco, rosa) mantêm o contorno escuro.
6. **Costas:** a nuca inteira coberta, com as pontas viradas para baixo.

## Corpos e roupas

1. Roupa em camadas visíveis: gola, mangas, cinto, barra; cada uma com contorno próprio.
2. Detalhe por dobras: 1 a 2 linhas de sombra no tecido (vinco no cotovelo, na cintura).
3. Pequenos acentos claros (botão, fivela, emblema em amarelo ou branco) sobre roupa escura.
4. Silhueta arredondada: ombros e mangas sem cantos retos.

## O que já entrou

- Cabelo `repicado`: volume maior, borda de baixo serrilhada, franja em mechas e sombra de mechas.
- Regra das pontas arredondadas em todo o gerador.

## O que falta aplicar

- Franja caindo sobre um olho e mechas assimétricas.
- Dobras e acentos nas roupas (pede peças de forma no corpo, ainda limitadas ao tronco).

## Cabelos femininos (referência: scabichigfx, página de corpos femininos, 70 cabeças)

1. Franja em fios pontudos até a sobrancelha, nunca um bloco reto.
2. Mechas laterais longas emoldurando o rosto, até o queixo ou o peito.
3. Penteados recorrentes: liso longo (hime), chiquinhas, coque duplo, rabo alto, chanel em camadas, franja de lado
   cobrindo um olho, tranças.
4. Fios desenhados: linhas finas de sombra descendo, anel de brilho no alto da cabeça, pontas mais escuras.
5. Volume maior que o crânio; a parte de dentro (atrás do pescoço) mais escura.
6. Enfeites: laço, presilha, orelhas de gato, pontas em degradê.

Entraram: `hime`, `chiquinhas`, `coque_duplo`, `rabo_alto`, `franja_lado` e a sombra de fios (`SOMBRA_FIOS`), também no
`longo`. Faltam: tranças, enfeites (laço, presilha) e pontas em degradê.
