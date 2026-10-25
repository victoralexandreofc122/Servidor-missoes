# Direção de arte

A referência foi uma arena noturna em pixel art: base azul-noite fria, luz quente, detalhe nas bordas e o centro limpo
para a luta. Aproveitamos os princípios, não as peças. Os bonecos continuam **chibi**: o que mudou foi o acabamento.

## Princípios

1. **Luz conta onde se está:**
   - a Floresta tem sombra das copas passando, faixas de sol e pólen;
   - a Clareira tem brasas, e a caverna, escuro e esporos;
   - a noite é azul, com luz em volta do jogador, das lanternas e das janelas.
2. **Detalhe nas bordas, centro limpo:** mato, pedras, lanternas e vasos ficam onde não atrapalham a luta e a
   leitura do chão.
3. **Objetos com volume:** contorno escuro, luz de cima à esquerda, sombra no chão. Árvores, barracas e Pedras-Selo
   ficam translúcidas quando cobrem o jogador.
4. **Formas orgânicas:** nada de retângulo à vista. Trilhas e riacho são curvas, o chão queimado é uma mancha oval e
   os paredões têm colunas e cantos redondos.
5. **Quem luta se destaca:** anel dourado embaixo de você, vermelho embaixo do adversário, e o nome numa plaquinha
   escura.

## Cores

| Uso | Cor |
|---|---|
| Painéis da interface | azul-noite translúcido `rgba(10, 14, 34, 0.8)` |
| Moldura | bronze `#b8893f` com filete `#f0cf7a` |
| Texto | creme `#f4ecd8` |
| Destaque | dourado `#e9c46a` / `#ffd76a` |
| Vida | verde `#7fe04a` → `#23852b` |
| Chakra | ciano `#5fe3ff` → `#1471b0` |
| Inimigo | vermelho `#ff4f3e` → `#8c1210` |
| Arena | ardósia `#3e4761`, friso dourado `#c49a45` |

**Letra:** Barlow Condensed (SIL OFL, `public/fonts/`), em caixa-alta nos rótulos. Textos longos (chat, missões)
usam a letra do sistema.

## Onde está o quê

| Peça | Arquivo |
|---|---|
| Mapas | `public/mapArt.js` (paredes, objetos, enfeites) e `public/game.js` (chão em blocos, mato, luz) |
| Interface | `public/hud.css` (HUD, Equipamentos, botões) e `public/index.html` |
| Clima e hora | `drawAtmosphere` e `drawSky` em `public/game.js`; regras em `src/realtime/weather.ts` |
| Ícones dos itens | armas e pergaminhos vêm da pixel art das armas (`drawWeaponIcon`), capas em `capeIcon` |
| Monstros | `drawSlime` em `public/game.js` |
