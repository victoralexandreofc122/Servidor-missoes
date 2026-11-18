# Animações desenhadas dos jutsus (folhas do Victor)

O Victor desenha cada jutsu numa **folha de 6 quadros** (às vezes 5 ou 7), sobre fundo **verde** ou **magenta**, com o
nome do jutsu e às vezes F1..F6 escritos. Este diretório transforma a folha em quadros do jogo e diz em que momento do
golpe cada quadro aparece. Tudo é **só visual**: o servidor continua decidindo quem acerta.

## O caminho de uma folha até o jogo

1. **Achar o jutsu pelo nome** no servidor (`src/realtime/jutsus.ts`, `jutsusClasses.ts`, `jutsusMecanicas.ts`,
   `jutsusFase25.ts`): o id (`lightning_rugido`), a forma (`faixa`, `aviso`, `zona`, `projetil`...) e os números (raio,
   alcance, duração, selos). Folha repetida ou nome que não existe: avisar o Victor antes de fazer.
2. **Salvar a folha** em `folhas/<id>.jpg` (cópia do anexo que está em `/root/.claude/uploads/...`).
3. **Recortar** com `python3 arte/jutsus-vfx/recortar.py --debug <pasta> <id> [<id>...]`. O recorte usa
   `ajustes.json` (uma entrada por jutsu):
   - `pixel`: tamanho do pixel da arte na folha (px). Estime pelas distâncias entre trocas de cor (5, 7, 8, 10,5...).
   - `fundo`: `"magenta"` ou `"escuro"` (sem nada = verde); `cor_fundo`: a cor fixa quando o desenho encosta nos cantos.
   - `paineis`: os retângulos [x0, y0, x1, y1] quando a detecção automática erra (folha sem moldura, quadro que vaza);
     `quadros`: a numeração quando falta um quadro (ex.: `[1, 2, 3, 4, 6]`).
   - `topo` (faixa do título, em px do painel), `cantos` (retângulos do F1..F6), `texto_preto` (letras escuras por cima
     do desenho), `detector_texto: false` (desliga o detector de letras quando ele apaga arte).
   - `alfa_suave` (brilho e névoa com transparência em degraus), `limiar_m`, `circulo` (máscara redonda), `buraco`
     (apaga o miolo de um anel), `roer` (desfaz um corte reto na borda), `grao`, `margem`, `verde`.
   - `partes`: um pedaço do quadro vira peça solta (`<id>_04b`): a brasa que voa, um meteoro dos cinco; `roer_partes`.
   - `jogo`: tamanho e apoio de cada quadro no jogo: `pxCasa` (casas por pixel da arte), `ancora` (`centro`, `base`,
     `topo`, `esquerda`, `direita`, `cabeca`, `anel:<razão>` ou [x, y]), `arte` (para onde a arte aponta, em rad),
     `eixo` (comprimento a esticar até onde o golpe chega), `blend` (`glow`, `screen`, `normal`), `alpha`; e `quadros`
     para mudar um quadro só.
   Confira a imagem de `--debug` (todas as peças sobre fundo escuro) **antes** de seguir. O script gera
   `public/assets/vfx/<id>_0N.png` e a tabela `public/vfxFogo.js` (não editar à mão).
4. **Tocar no jogo** em `public/fogoAnim.js`: um `case '<id>'` em `fogoCast` (o lançamento), e se preciso em
   `fogoCastStart` (os selos), `fogoProjectileFrame` / `fogoImpact` (projétil), `fogoGround` (avisos e zonas),
   `fogoMarca` (marcas). `seq(jfx, id, x, y, now, [[quadro, começa_ms, dura_ms, opções], ...])`; opções: `angle`,
   `len` (estica no eixo), `scale`, `flicker`, `grow`, `layer: 'ground'`, `follow` (acompanha um boneco), `tag`
   (`jfx.drop(tag)` tira antes da hora). Quando o desenho novo substitui um antigo feito por código (raio, meteoro,
   partículas), desligue o antigo só quando `jutsuSpritesReady(id)` (se a folha não carregar, o antigo volta).
   Classe nova: acrescente o prefixo na lista de `src/web/staticFiles.ts` (`FOGO_SPRITE_FRAMES`, hoje fire|heal|lightning).
5. **Conferir no jogo**: `bash scripts/ambiente-local.sh` (uma vez por sessão), depois
   `set -a && . /var/tmp/jogo.env && set +a && npx tsx arte/jutsus-vfx/capturar.ts <pasta> <id>` e
   `python3 arte/jutsus-vfx/folha.py <pasta>`. Acrescente o plano do jutsu em `PLANOS` (copie o de um da mesma forma).
   Olhe as folhas: tamanho (o anel no tamanho da área do servidor), direção, onde cai o impacto, se o desenho antigo
   ainda aparece por cima. Ajuste e capture de novo.
6. **Teste e versão**: acrescente o id em `SKILLS` de `test/vfxJutsus.test.ts` (e em `N` se a folha não tiver 6
   quadros); `README.md` e `CLAUDE.md` com a versão nova; `npm run verify` com
   `TEST_DATABASE_URL="postgres://postgres@localhost:5433/postgres?host=/var/tmp"`; commit, push e mandar as folhas
   (`folha_<id>.png`) ao Victor, com o que mudou em cada jutsu e o que não foi testado com um ninja de verdade.

## Camadas por cima das folhas (v78)

Cada jutsu desenhado ganha **camadas** do PixelFX (a carga dos selos, anel, poeira, brasas, cruzes, faíscas, choque) em
`public/camadasJutsus.js`. Ao terminar uma folha nova, acrescente o `case '<id>'` dele lá (o teste cobra) com as camadas
no tempo dos quadros. O passo a passo e as lições estão em `arte/pixelfx/LEIAME.md`.

## Lições das folhas já feitas

- O fundo é tirado pela cor dos cantos de cada painel: se o desenho encosta no canto, use `cor_fundo`.
- Verde ou magenta misturado com o brilho dá cinza: o recorte já corrige (núcleo de cor + transparência gradual); se
  sobrar auréola, `alfa_suave`, `limiar_m` ou `circulo`.
- Vermelho perto do magenta some no recorte: deixe a peça vermelha de outro quadro por baixo.
- Quadro com vários objetos (5 meteoros, 4 marcadores): use `partes` e toque uma peça por aviso.
- Feixes, lanças e cometas: `arte` + `ancora` + `eixo`, e `len` no `seq` para esticar até o alcance do servidor.
- Projétil desenhado: o rastro e o estouro antigos do elemento saem (`drawnArt` em `game.js`).
- Captura de noite deixa o brilho mais forte; a Academia é o lugar padrão (chão liso, de dia).

## Situação (17/11/2026)

**Feitos (50):**

- Fogo (17): Fogo, Sopro Incinerador, Névoa Inflamável, Linha de Fogo Rasante, Revoada de Brasas, Lança de Fogo, Cinzas Detonantes, Lâmina de Fogo, Varredura Flamejante, Projétil Dracônico, Chuva de Meteoros, Marca Incandescente, Chão Incandescente, Cometa Rasteiro, Rugido da Fornalha, Coroa de Chamas, Coluna Infernal.
- Cura (17): Cura, Desintoxicação Celular, Corte Cirúrgico, Palma Curadora, Descontrole Muscular, Punho Sísmico, Regeneração de Área, Renovação Celular, Selo dos Meridianos, Agulha Calmante, Casca de Chakra, Lâmina Séptica, Banho de Chakra, Onda Anestésica, Milagre Verde, Santuário Vital, Punho do Colosso.
- Relâmpago (16): Corrente Rasteira, Shuriken do Trovão, Impulso Estático, Farpas de Trovão, Lança Saltadora, Descarga Envolvente, Investida Elétrica, Julgamento do Trovão, Ida e Volta, Rede de Faíscas, Rugido do Trovão, Mãos de Trovão, Correntes de Raio, Céu em Fúria, Armadura Relampejante, Risco de Luz.

**Faltam (149), com o id e a forma no servidor:**

- **Cura (1):** Aura de Regeneração (`heal_aura`, zona).
- **Relâmpago (1):** Relâmpago (`lightning`).
- **Água (17):** Água (`water`); Serpente d’Água (`water_dragao`, projetil); Muro de Água (`water_muro`, muro); Duplo de Água (`water_clone`, invocacao); Véu de Bruma (`water_nevoa`, zona); Estouro de Maré (`water_2`, anel_golpe); Poça Viscosa (`water_xarope`, zona); Cárcere Líquido (`water_3`, linha); Prisão do Vórtice (`water_4`, zona); Laço da Correnteza (`water_laco`, linha); Lâmina d’Água (`water_lamina`, faixa); Rajada de Gotas (`water_gotas`, leque); Coluna d’Água (`water_coluna`, aviso); Casulo de Água (`water_casulo`, escudo_vida); Tromba d’Água (`water_tromba`, linha_explode); Grande Onda (`water_onda`, anel_golpe); Corpo de Água (`water_corpo`, transformacao).
- **Vento (17):** Vento (`wind`); Shuriken do Vento (`wind_shuriken`, projetil); Véu de Vento (`wind_veu`, escudo_vida); Passo Aéreo (`wind_salto`, recuo); Balas de Vento (`wind_2`, leque); Lâmina em Arco (`wind_arco`, faixa); Tornado Cortante (`wind_3`, aviso); Disco do Furacão (`wind_4`, linha_explode); Espelho de Ar (`wind_espelho`, reflexo); Pulso de Vento (`wind_pulso`, anel_golpe); Passo Leve (`wind_leve`, buff_basico); Asa Cortante (`wind_asa`, investida); Vórtice de Ar (`wind_vortice`, zona); Corte em Cadeia (`wind_cadeia`, ricochete); Mil Cortes do Céu (`wind_milcortes`, meteoros); Fenda do Vento (`wind_fenda`, faixa); Olho da Tempestade (`wind_olho`, transformacao).
- **Pedra (17):** Pedra (`stone`); Golem de Terra Titânico (`stone_golem`, invocacao); Muralha de Terra (`stone_muralha`, muro); Prisão de Pilares (`stone_pilares`, alvo); Projétil de Rocha (`stone_rocha`, projetil); Escavação Furtiva (`stone_toupeira`, investida); Lamaçal Profundo (`stone_2`, zona); Punho de Rocha (`stone_punho`, buff_basico); Esmagamento de Paredes (`stone_3`, alvo); Resposta da Montanha (`stone_resposta`, contra); Pisão da Montanha (`stone_pisao`, anel_golpe); Chuva de Cascalho (`stone_cascalho`, leque); Lanças da Terra (`stone_lancas`, aviso); Carga do Rochedo (`stone_carga`, investida); Couraça Mineral (`stone_couraca`, escudo_vida); Avalanche (`stone_avalanche`, meteoros); Sumidouro (`stone_sumidouro`, zona).
- **Sombra (18):** Sombra (`shadow`); Reflexo Tático (`shadow_recuo`, recuo); Agulhas de Sombra (`shadow_2`, leque); Sombra Oculta (`shadow_armadilha`, zona); Garrote de Sombra (`shadow_estrangular`, alvo); Lâmina Umbral (`shadow_3`, projetil); Rede de Sombra (`shadow_agarre`, agarre); Domínio das Sombras (`shadow_4`, zona); Beijo do Breu (`shadow_beijo`, linha); Passo Trocado (`shadow_troca`, alvo); Espinho Sombrio (`shadow_espinho`, projetil); Véu Sombrio (`shadow_veu`, escudo); Mergulho na Sombra (`shadow_mergulho`, investida); Ciranda Sombria (`shadow_ciranda`, anel_golpe); Mancha Negra (`shadow_mancha`, zona); Sombra Saltadora (`shadow_saltadora`, ricochete); Punho do Abismo (`shadow_punho`, aviso); Sentinela de Sombra (`shadow_sentinela`, invocacao).
- **Ilusão (18):** Ilusão (`illusion`); Dissipação (`illusion_kai`, limpeza); Visão do Abismo (`illusion_2`, linha); Estaca da Ilusão (`illusion_estaca`, linha); Noite Eterna (`illusion_noite`, alvo); Raízes do Pesadelo (`illusion_3`, alvo); Ciclo Sem Fim (`illusion_4`, alvo); Santuário das Penas (`illusion_templo`, zona); Empréstimo Forçado (`illusion_emprestimo`, alvo); Segunda Voz (`illusion_voz`, invocacao); Olho Errante (`illusion_olho`, projetil); Passo Falso (`illusion_passo`, recuo); Véu da Meia-Noite (`illusion_veu`, zona); Espelho Quebrado (`illusion_espelho`, alvo); Coro do Silêncio (`illusion_coro`, anel_golpe); Colapso Onírico (`illusion_colapso`, aviso); Canção de Ninar (`illusion_ninar`, linha); Reflexo Vazio (`illusion_reflexo`, invocacao).
- **Taijutsu (17):** Taijutsu (`taijutsu`); Rasteira Baixa (`taijutsu_rasteira`, cone_golpe); Chute Ciclone (`taijutsu_2`, anel_golpe); Chute Ascendente (`taijutsu_ascendente`, investida); Cem Golpes (`taijutsu_3`, cone_golpe); Mergulho Esmagador (`taijutsu_lotus`, investida); Despertar do Corpo (`taijutsu_portoes`, buff_basico); Punho do Céu (`taijutsu_4`, cone_golpe); Fúria do Encurralado (`taijutsu_furia`, investida); Esquiva Rápida (`taijutsu_esquiva`, recuo); Fôlego de Luta (`taijutsu_folego`, buff_basico); Bloqueio Firme (`taijutsu_bloqueio`, escudo); Soco de Pressão (`taijutsu_pressao`, projetil); Chave de Braço (`taijutsu_chave`, alvo); Impacto Circular (`taijutsu_impacto`, anel_golpe); Flecha Humana (`taijutsu_flecha`, investida); Queda do Meteoro (`taijutsu_queda`, aviso).
- **Armas (17):** Armas (`weapons`); Shuriken Espelhada (`weapons_multi`, leque); Lâminas Flutuantes (`weapons_2`, zona); Shuriken Colossal (`weapons_gigante`, bumerangue); Corte Relâmpago (`weapons_3`, investida); Kunai Explosiva (`weapons_kunai`, aviso); Dança dos Mil Cortes (`weapons_4`, zona); Ascensão Dupla (`weapons_dragoes`, aviso); Fio Peçonhento (`weapons_peconha`, projetil); Corte Rápido (`weapons_corte`, linha); Tapete de Pregos (`weapons_pregos`, zona); Lâmina Serrilhada (`weapons_serrilhada`, projetil); Lâmina Polida (`weapons_polida`, buff_basico); Laço de Ferro (`weapons_laco`, agarre); Arco de Aço (`weapons_arco`, faixa); Céu de Lâminas (`weapons_ceu`, meteoros); Arsenal Vivo (`weapons_arsenal`, invocacao).
- **Clã Rubro (6):** Olhar Rubro (`rubro_olho`, escudo); Transe Ocular (`rubro_transe`, linha); Brasa Sem Luz (`rubro_chamas`, linha); Sentinela Espectral (`rubro_guardiao`, escudo_vida); Mundo Espelhado (`rubro_lua`, linha); Colosso Espectral (`rubro_completo`, transformacao).
- **Clã Umbra (4):** Deslize Noturno (`umbra_deslize`, recuo); Sombra Faminta (`umbra_faminta`, marca); Noite Fechada (`umbra_noite`, zona); Forma Umbral (`umbra_forma`, forma_sombra).
- **Clã Bastião (4):** Muralha Interior (`bastiao_muralha`, escudo_vida); Guarda Compartilhada (`bastiao_guarda`, escudo_vida); Muro que Responde (`bastiao_resposta`, postura); Juramento do Escudo (`bastiao_juramento`, postura).
- **Clã Áspide (4):** Cuspe da Áspide (`aspide_cuspe`, projetil); Névoa Tóxica (`aspide_nevoa`, zona); Constrição (`aspide_constricao`, alvo); Ninho de Áspides (`aspide_ninho`, invocacao).
- **Clã Garra (4):** Chamado da Matilha (`garra_matilha`, invocacao); Uivo de Comando (`garra_uivo`, comando); Troca Instintiva (`garra_troca`, troca); Rei da Matilha (`garra_rei`, invocacao).
- **Clã Zéfiro (4):** Passo do Vento (`zefiro_passo`, recuo); Véu de Ar (`zefiro_veu`, postura); Eco do Vento (`zefiro_eco`, eco); Mil Passos (`zefiro_mil`, mil_passos).
