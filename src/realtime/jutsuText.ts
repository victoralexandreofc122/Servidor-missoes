/*
 * v46: o ÍCONE e a DESCRIÇÃO de cada jutsu (pedido do Victor: cada jutsu com a sua imagem, para não confundir na luta, e a
 * descrição na aba Kits e na Loja de Pergaminhos).
 *
 * A descrição é um modelo: `{chave}` vira o número de verdade do jutsu (`combat.skills`), então o texto nunca fica
 * diferente do que o servidor faz. Chaves que acabam em `Ms` viram segundos; as de `PERCENT`, porcentagem;
 * `zone.x` lê dentro da zona. O teste (test/jutsuText.test.ts) confere: os 100 têm ícone único e toda chave existe.
 */
import type { SkillConfig } from './config.js';

export interface JutsuText { icon: string; text: string }

const PERCENT = new Set(['basicBuff', 'speedBuff', 'hpCost', 'shieldShare', 'hot', 'dr', 'reduction', 'markBonus', 'nextHitBonus', 'zoneDamageCut', 'summonHp', 'wallHpShare']);

export const JUTSU_TEXT: Readonly<Record<string, JutsuText>> = {
  // ------------------------------------------------------------------ Academia
  teleport: { icon: '💨', text: 'Salta até {range} casas para onde você aponta (mais longe a cada nível), parando antes de paredes.' },
  substitution: { icon: '🪵', text: 'Fica armada por {durationMs}: o próximo golpe acerta um tronco e você aparece atrás de quem atacou.' },
  // ------------------------------------------------------------------ Fogo
  fire: { icon: '🔥', text: 'Bola de fogo em linha reta ({range} casas) que explode no primeiro inimigo (raio {radius}) e deixa queimando por {burnMs}.' },
  fire_endan: { icon: '🐲', text: 'Sopro em cone curto ({range} casas) que queima por {burnMs}.' },
  fire_hibashiri: { icon: '🎇', text: 'Chama rasteira em linha ({range} casas): acerta o primeiro inimigo na hora.' },
  fire_kasumi: { icon: '🌫️', text: 'Névoa à sua frente (raio {radius}) que detona sozinha depois de {durationMs}.' },
  fire_2: { icon: '🎆', text: 'Leque de {shots} brasas ({range} casas); cada inimigo leva no máximo 2. No nível 2 de maestria sai mais uma.' },
  fire_haiseki: { icon: '🌋', text: 'Cinzas em volta de você (raio {radius}) que explodem depois de {durationMs}.' },
  fire_lamina: { icon: '🏮', text: 'Por {durationMs} o seu Ataque Básico bate {basicBuff} mais forte.' },
  fire_ryuka: { icon: '🚀', text: 'Lança de fogo instantânea em linha ({range} casas): acerta o primeiro inimigo.' },
  fire_3: { icon: '♨️', text: 'Onda de fogo larga à frente (cone de {coneDeg}°, {range} casas).' },
  fire_hotan: { icon: '🐉', text: 'Projétil grande e lento ({range} casas) que explode no primeiro inimigo (raio {radius}).' },
  fire_4: { icon: '☄️', text: '{shots} meteoros caem na área mirada (até {range} casas), cada um com aviso no chão de {durationMs}. Quem sai das marcas não leva.' },
  // ------------------------------------------------------------------ Cura
  heal: { icon: '💚', text: 'Cura você ou o aliado focado (até {radius} casas).' },
  heal_aura: { icon: '🌿', text: 'Aura que anda com você por {zone.ms} (raio {radius}) e cura quem está dentro a cada segundo.' },
  heal_bisturi: { icon: '💉', text: 'Por {durationMs} o seu Ataque Básico bate {basicBuff} mais forte; o primeiro golpe faz o alvo sangrar.' },
  heal_desintox: { icon: '🧪', text: 'Tira queimadura e ferida de você e cura um pouco.' },
  heal_palma: { icon: '🤲', text: 'Canaliza por {castMs}: cura bastante o aliado colado em você (em você mesmo, a metade). Vida cheia: não sai.' },
  heal_2: { icon: '💥', text: 'Soco colado: o alvo leva tudo e fica no ar por {liftMs}; quem está em volta leva a metade.' },
  heal_disturbio: { icon: '🔀', text: 'Embaralha os controles do alvo (até {range} casas) por {invertMs}: ele anda ao contrário.' },
  heal_3: { icon: '⛲', text: 'Zona de cura em volta de você (raio {radius}) por {zone.ms}: cura você e os aliados dentro dela.' },
  heal_4: { icon: '🧬', text: 'Regenera {hot} da sua vida por segundo durante {durationMs}.' },
  // ------------------------------------------------------------------ Ilusão
  illusion: { icon: '🌀', text: 'Atordoa todos em volta de você (raio {radius}) por {stunMs}.' },
  illusion_kai: { icon: '🔔', text: 'Limpa lentidão, silêncio e sono de você. Funciona mesmo em silêncio.' },
  illusion_2: { icon: '👁️', text: 'Olhar em linha ({range} casas): atordoa o primeiro inimigo por {stunMs} e tira {drain} de chakra dele. Sem dano.' },
  illusion_estaca: { icon: '📍', text: 'Estaca em linha ({range} casas): fere e prende o primeiro inimigo por {rootMs}.' },
  illusion_3: { icon: '🥀', text: 'Prende o alvo (até {range} casas) por {rootMs}; o golpe cai nele {strikeDelayMs} depois.' },
  illusion_noite: { icon: '🌚', text: 'Escurece a tela do alvo (até {range} casas) por {darkMs}: ele quase não enxerga.' },
  illusion_4: { icon: '♾️', text: 'Prende o alvo (até {range} casas) por {rootMs}, deixa em silêncio por {silenceMs} e lento por {slowMs}. Sem dano.' },
  illusion_templo: { icon: '🪶', text: 'Santuário na área mirada (raio {radius}) por {zone.ms}: deixa lento; quem ficar até o fim leva o golpe e é atordoado por {zone.endStunMs}.' },
  // ------------------------------------------------------------------ Relâmpago
  lightning: { icon: '⚡', text: 'Raio em linha ({range} casas): atordoa o primeiro inimigo por {stunMs} e paralisa por {paralysisMs}. Em alvo molhado bate 30% mais.' },
  lightning_corrente: { icon: '🔗', text: 'Corrente elétrica em linha ({range} casas): acerta o primeiro inimigo na hora.' },
  lightning_impulso: { icon: '⏩', text: 'Avança {dash} casas na direção escolhida, sem dano. Para fugir ou encurtar a distância.' },
  lightning_shuriken: { icon: '✴️', text: 'Shuriken elétrica em linha reta ({range} casas): acerta o primeiro inimigo.' },
  lightning_2: { icon: '🌩️', text: 'Leque de {shots} farpas ({range} casas). Todas podem acertar o mesmo alvo.' },
  lightning_fluxo: { icon: '🔆', text: 'Descarga em volta de você (raio {radius}): dano e paralisia por {paralysisMs}.' },
  lightning_raio: { icon: '🔱', text: 'Lança em linha ({range} casas) que salta do primeiro inimigo para outro perto (o segundo leva 70%).' },
  lightning_3: { icon: '💫', text: 'Avança até {range} casas: golpeia na chegada e atordoa por {stunMs}.' },
  lightning_4: { icon: '⛈️', text: 'Raio do céu na área mirada (raio {radius}), com aviso de {durationMs}: dano alto e atordoa por {stunMs}.' },
  // ------------------------------------------------------------------ Sombra
  shadow: { icon: '🌑', text: 'Linha de sombra ({range} casas) que prende o primeiro inimigo por {rootMs}. Sem dano.' },
  shadow_recuo: { icon: '↩️', text: 'Salta {range} casas para trás, sem dano.' },
  shadow_2: { icon: '🪡', text: 'Leque de {shots} agulhas ({range} casas): quem for acertado fica preso por {rootMs}.' },
  shadow_armadilha: { icon: '🪤', text: 'Armadilha no chão por {zone.ms}: o primeiro inimigo que pisar leva o golpe e fica preso por {zone.firstRootMs}.' },
  shadow_3: { icon: '🌘', text: 'Lâmina de longo alcance ({range} casas): fere e prende o primeiro inimigo por {rootMs}.' },
  shadow_estrangular: { icon: '⛓️', text: 'Só em alvo que já está PRESO (até {range} casas): aperta a sombra e causa dano.' },
  shadow_4: { icon: '🕳️', text: 'Zona de sombra em volta de você (raio {radius}) por {zone.ms}: o primeiro que entrar fica preso por {zone.firstRootMs}, todos ficam lentos e, no fim, levam o golpe.' },
  shadow_agarre: { icon: '🕸️', text: 'Rede em linha ({range} casas): prende até {targets} inimigos por {rootMs} (o dano se divide entre eles).' },
  // ------------------------------------------------------------------ Pedra
  stone: { icon: '🪨', text: 'Pele de rocha: o próximo golpe que você receber perde {reduction} da força.' },
  stone_muralha: { icon: '🧱', text: 'Ergue um muro à frente por {durationMs}: bloqueia a passagem e os projéteis até quebrar.' },
  stone_pilares: { icon: '🏛️', text: 'Pilares prendem o alvo focado ou o mais perto (até {range} casas) por {rootMs}.' },
  stone_rocha: { icon: '🥌', text: 'Arremessa {shots} pedras em linha ({range} casas): dano e lentidão por {slowMs}.' },
  stone_toupeira: { icon: '⛏️', text: 'Mergulha na terra e surge no alvo (até {range} casas): joga para o alto por {liftMs}. Você leva {dr} menos dano no trajeto.' },
  stone_2: { icon: '🟤', text: 'Lamaçal na área mirada (raio {radius}) por {zone.ms}: dano a cada segundo e lentidão.' },
  stone_punho: { icon: '✊', text: 'Por {durationMs} o seu Ataque Básico bate {basicBuff} mais forte; o primeiro golpe atordoa por {firstStunMs}.' },
  stone_3: { icon: '🗿', text: 'Paredes esmagam o alvo (até {range} casas): dano alto e prende por {rootMs}.' },
  stone_4: { icon: '⛰️', text: 'Coração de montanha: o próximo golpe que você receber perde {reduction} da força.' },
  stone_golem: { icon: '🦾', text: 'Invoca um Golem por {durationMs}: ele soca quem está em volta a cada {punchEveryMs} e joga para o alto por {liftMs}.' },
  // ------------------------------------------------------------------ Taijutsu
  taijutsu: { icon: '👊', text: 'Avança até o inimigo mais perto (até {range} casas) e golpeia. Escala com o atributo Taijutsu.' },
  taijutsu_rasteira: { icon: '🦵', text: 'Rasteira em cone à frente ({range} casa): dano e lentidão por {slowMs}.' },
  taijutsu_2: { icon: '🥋', text: 'Chute giratório em volta de você (raio {radius}): dano e empurra {push} casas.' },
  taijutsu_ascendente: { icon: '⤴️', text: 'Avança até {range} casas e chuta para o alto: o alvo fica no ar por {liftMs}.' },
  taijutsu_3: { icon: '💢', text: '{hits} golpes seguidos em cone à frente, que empurram {push} casas.' },
  taijutsu_lotus: { icon: '🦅', text: 'Mergulha no alvo (até {range} casas): dano alto e {liftMs} no ar. Custa {hpCost} da sua vida atual.' },
  taijutsu_4: { icon: '🤜', text: '{hits} socos em cone à frente ({range} casas). Custa {hpCost} da sua vida atual.' },
  taijutsu_portoes: { icon: '💪', text: 'Por {durationMs}: Ataque Básico {basicBuff} mais forte e você {speedBuff} mais rápido. Custa {hpCost} da sua vida atual, sem chakra.' },
  // ------------------------------------------------------------------ Água
  water: { icon: '💧', text: 'Jato em cone ({range} casas) que empurra {push} casa e deixa molhado (o Relâmpago bate mais em alvo molhado).' },
  water_dragao: { icon: '🐍', text: 'Serpente em linha reta ({range} casas): acerta o primeiro inimigo e deixa molhado.' },
  water_muro: { icon: '🌊', text: 'Muro de água à frente por {durationMs}: bloqueia a passagem e os projéteis.' },
  water_nevoa: { icon: '🌁', text: 'Bruma em volta de você (raio {radius}) por {zone.ms}: os inimigos dentro quase não enxergam.' },
  water_2: { icon: '💦', text: 'Onda em volta de você (raio {radius}): dano, empurra {push} casas e deixa molhado.' },
  water_clone: { icon: '👥', text: 'Cria um duplo de água ao seu lado por {durationMs}: ele atrai os monstros e segura golpes.' },
  water_xarope: { icon: '🍯', text: 'Poça na área mirada (raio {radius}) por {zone.ms}: quem pisa fica lento. Sem dano.' },
  water_3: { icon: '🔵', text: 'Esfera em linha ({range} casas): prende o primeiro inimigo por {rootMs}, mas você também fica parado por {selfRootMs}.' },
  water_4: { icon: '🧿', text: 'Redemoinho na área mirada (raio {radius}) por {zone.ms}: dano, lentidão e puxa todos para o centro.' },
  // ------------------------------------------------------------------ Armas
  weapons: { icon: '🗡️', text: '{shots} kunais lado a lado ({range} casas). O atributo Armas e a arma equipada aumentam o dano.' },
  weapons_multi: { icon: '❇️', text: '{shots} shurikens em leque ({range} casas); cada inimigo leva só uma.' },
  weapons_2: { icon: '⚙️', text: 'Lâminas giram em volta de você por {zone.ms} (raio {radius}) e cortam quem chega perto.' },
  weapons_gigante: { icon: '🪃', text: 'Shuriken gigante que vai até {range} casas atravessando todos e volta para a sua mão, cortando de novo.' },
  weapons_3: { icon: '⚔️', text: 'Avanço cortante de até {range} casas: acerta todos no caminho.' },
  weapons_kunai: { icon: '🧨', text: 'Kunai com selo na área mirada (raio {radius}): explode depois de {durationMs} e atordoa por {stunMs}.' },
  weapons_4: { icon: '💃', text: 'Gira cortando por {durationMs}: vários cortes em quem está perto, e você leva {dr} menos dano enquanto dança.' },
  weapons_dragoes: { icon: '🏹', text: '{waves} ondas de armas caem na área mirada (raio {radius}) depois de {durationMs}; a última deixa lento por {slowMs}.' },
  // ------------------------------------------------------------------ Vento
  wind: { icon: '🌬️', text: 'Rajada em cone curto ({range} casas) que empurra {push} casas.' },
  wind_salto: { icon: '🦘', text: 'Salta {dash} casas na direção escolhida, sem dano.' },
  wind_shuriken: { icon: '🍃', text: 'Shuriken de vento em linha reta ({range} casas): rápida e de longo alcance.' },
  wind_veu: { icon: '🎐', text: 'Escudo de vento: absorve dano até {shieldShare} da sua vida por {durationMs}.' },
  wind_2: { icon: '☁️', text: 'Leque de {shots} balas de ar ({range} casas). Todas podem acertar o mesmo alvo.' },
  wind_arco: { icon: '🌙', text: 'Lâmina larga em linha ({range} casas): corta TODOS numa faixa de 3 casas de largura.' },
  wind_3: { icon: '🌪️', text: 'Tornado na área mirada (raio {radius}), quase sem aviso: dano e atordoa por {stunMs}.' },
  wind_4: { icon: '💿', text: 'Disco lento ({range} casas) que explode (raio {radius}) e deixa ferida por {woundMs}: a cura no alvo cai pela metade.' },
  // ------------------------------------------------------------------ Clã Rubro
  rubro_olho: { icon: '🔴', text: 'O próximo golpe que você receber perde {reduction} da força.' },
  rubro_transe: { icon: '😵', text: 'Olhar em linha ({range} casas): atordoa o primeiro inimigo por {stunMs}.' },
  rubro_chamas: { icon: '🖤', text: 'Chama escura em linha ({range} casas): o alvo queima por {dotMs}.' },
  rubro_guardiao: { icon: '🛡️', text: 'Escudo de {shieldShare} da sua vida por {durationMs} e um corte em cone à frente.' },
  rubro_lua: { icon: '🌕', text: 'Olhar em linha ({range} casas) depois de {castMs} de selos parado: dano alto e atordoa por {stunMs}. Qualquer dano nos selos faz falhar.' },
  rubro_completo: { icon: '👹', text: 'Por {durationMs}: escudo de {shieldShare} da vida e Ataque Básico {basicBuff} mais forte. No fim, uma onda à frente levanta os inimigos por {liftMs}.' },
  // ------------------------------------------------------------------ Clã Umbra
  umbra_deslize: { icon: '🦇', text: 'Desliza {dash} casas; por {stealthMs} ninguém trava o alvo em você, e o seu próximo golpe (em até {nextHitMs}) bate {nextHitBonus} mais.' },
  umbra_faminta: { icon: '🐺', text: 'Marca um alvo (até {range} casas) por {markMs}: o seu próximo golpe nele bate {markBonus} mais e deixa lento por {markSlowMs}.' },
  umbra_noite: { icon: '🌃', text: 'Noite em volta de você (raio {radius}) por {zone.ms}: os inimigos dentro quase não enxergam e você leva {zoneDamageCut} menos dano.' },
  umbra_forma: { icon: '👤', text: 'Vira sombra por {durationMs}: projéteis atravessam você, anda {speedBuff} mais rápido, e quem você atravessa leva dano e fica lento.' },
};

const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Um número do jutsu como texto: segundos, porcentagem ou o número. `undefined` = a chave não existe neste jutsu. */
export function jutsuNumber(cfg: SkillConfig, key: string): string | undefined {
  const [a, b] = key.split('.');
  const raw = b ? (cfg as unknown as Record<string, Record<string, unknown> | undefined>)[a!]?.[b] : (cfg as unknown as Record<string, unknown>)[a!];
  if (typeof raw !== 'number') return undefined;
  const k = b ?? a!;
  if (k.endsWith('Ms') || k === 'ms') return `${num(raw / 1000)} s`;
  if (PERCENT.has(k)) return `${Math.round(Math.abs(raw) * 100)}%`;
  return num(Math.abs(raw));
}

/** A descrição pronta (os `{chave}` trocados pelos números do jutsu). */
export function jutsuDescription(code: string, cfg: SkillConfig): string {
  const t = JUTSU_TEXT[code];
  if (!t) return '';
  return t.text.replace(/\{([a-zA-Z.]+)\}/g, (_, key: string) => jutsuNumber(cfg, key) ?? '?');
}
