# Revisão Goldfish: fantasia, clãs e diversão (jutsus-v2.md)

**Nota: 6,5/10.** A adaptação guarda bem a graça do PDF nos elementos (meteoros com aviso, Kirin, combos Água+Relâmpago,
Xarope que inflama). E os níveis de maestria que mudam a forma do jutsu são o melhor achado do documento. Os clãs
estão mais fracos: o Hien perdeu o "momento Mangekyō", o "sem clã" ficou vago e a marca ainda aparece nos parênteses.

## Bloqueador

1. **Nomes da série ainda estão no documento e vão vazar para o jogo.** Os parênteses trazem Sharingan, Susanoo,
   Amaterasu, Izanami, Tsukuyomi, Chidori, Chidori Senbon, Rasenshuriken, Kage Mane, Kirin, Byakugō e Kage Bunshin.
   Além disso, Uchiha e Nara são citados como inspiração do clã. Shinobi, Katon e jutsu são termos genéricos e podem
   ficar. **O que fazer:** apagar os parênteses de marca na versão que vai para o código. Também criar uma regra no
   `jutsus.ts`/teste que proíbe essa lista nos nomes exibidos. Nomes sugeridos:
   - Sharingan → **Olho Rubro** / Hien-gan
   - Susanoo → **Guardião Etéreo** (Kami-yoroi)
   - Amaterasu → **Chama Negra** (Kokuen)
   - Tsukuyomi → **Prisão Lunar**
   - Izanami → **Laço do Tempo** (já está bom)
   - Chidori → **Grito do Falcão** (Raitaka)
   - Chidori Senbon → **Agulhas de Trovão**
   - Rasenshuriken → **Estrela Espiral** (Fūrin-ken)
   - Kirin → **Dragão do Trovão** (já está bom)
   - Kage Mane → **Laço de Sombra** (já está bom)
   - Byakugō → **Selo da Renovação**
   - Kage Bunshin Shuriken → **Shuriken Espelhada**

## Importante

2. **O Clã Hien ficou sem o ápice que atrai o jogador.** Ele perdeu o Transe Ocular do tier 1 (a "paralisia pelo
   olhar", que é a marca do clã) e também a progressão visual do olho (1, 2 e 3 marcas, depois o olho desperto).
   **O que fazer:** fazer o olho evoluir de visual a cada tier, como recompensa estética e sem ganho de poder.
   Devolver o Transe como controle de 0,8 s com tempo de lançamento e linha de visão, contado no orçamento de
   controle. Trazer a Prisão Lunar como **poder de evento** com nome próprio, já citado.
3. **A passiva do Hien ("ver a recarga do inimigo") é forte demais no duelo 1x1 e não tem graça visual.** No duelo,
   saber a recarga do adversário é metade da luta. Já a passiva do Kurokage (+20% de alcance para prender) beneficia
   qualquer build de controle. **O que fazer:** no Hien, mostrar só o *último* jutsu usado pelo adversário e um ícone
   quando ele estiver pronto, sem os segundos. No Kurokage, limitar o bônus aos jutsus de sombra ou baixar para +10%.
   As duas passivas entram no `pvpSim`.
4. **"Sem clã" não tem fantasia própria, e escolher o clã no Criador tira o peso dele.** O "+1 espaço de jutsu" está
   confuso, porque o kit continua com 4 jutsus. **O que fazer:** recomendo um meio-termo. O clã fica *marcado* no
   Criador (é a linhagem e aparece no visual), mas a árvore só abre com uma **missão de despertar** no rank Genin,
   que dá história e motivo para jogar. O "sem clã" vira uma escolha com nome, por exemplo **Andarilho**: um
   pergaminho a mais e uma troca de kit em combate. A troca de clã sai cara, ou acontece uma única vez por missão,
   para o clã não virar algo que se troca pelo metajogo.
5. **Nem toda classe tem um jeito próprio de jogar.** Vento, Fogo e Relâmpago estão claros: controle de espaço, área
   e avanço, respectivamente. Os problemas estão nas outras:
   - Taijutsu ficou sem árvore (é a classe mais "ninja raiz") e ainda deu os buffs dele para Fogo e Terra.
   - Ilusão tem 4 jutsus, contra 6 a 8 das outras classes.
   - Cura ganhou o Soco de Chakra, que derruba e quebra escudo, e corre o risco de virar um "bruiser".
   - Kurokage e a classe Sombra disputam a mesma fantasia.

   **O que fazer:**
   - Dar ao Taijutsu uma árvore curta de combos e portões internos (Portões do Corpo, com nome próprio).
   - Completar a Ilusão até 8 jutsus.
   - Decidir já: **a classe Sombra vira o clã Kurokage** e o jogador recebe os pontos de volta (menos confusão).

## Detalhe

6. **As descrições não servem para a tela do celular.** Linhas como "Investida Perfurante: +50% pelas costas (no
   teto do tier)" ou "Lâmina de Fogo: faísca no 3º golpe" estão escritas para o desenvolvedor. **O que fazer:** cada
   jutsu ganha 1 linha para o jogador (no máximo ~60 caracteres, verbo e efeito) e um ícone de forma
   (linha/cone/zona/aviso). Os números ficam no toque longo. Exemplo: "Dispara 3 chamas em leque. Queima."
7. **A palavra "escuridão" aparece em 3 lugares** (Cinzas, Noite Eterna e o efeito da Ilusão). **O que fazer:**
   escolher um nome e um ícone só.
8. **Lâmina de Fogo e Punho de Rocha são o mesmo jutsu.** Os dois dão +20% ao golpe básico por 6 s. **O que fazer:**
   dar a cada um um gatilho diferente: o Fogo queima ao acertar, a Pedra atordoa no 1º golpe já no L1.
9. **Há uma linha de maestria vazia ("—")** na Shuriken de Vento L4 e no Tornado L4. **O que fazer:** preencher, porque
   o jogador sente falta de recompensa no nível máximo.
