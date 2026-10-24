// Política entre as vilas no cliente: a MESMA conta de src/realtime/villages.ts (test/endgame.test.ts confere).
// Funções puras (sem DOM). O servidor decide tudo; aqui só se mostra (nome em vermelho, mapa travado, preço).
// `villages` = lista de códigos das vilas (vem no welcome); `d` = { relations, events } (vem do servidor).

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

/** Estado entre duas vilas agora: mesma, neutro, guerra, alianca ou tregua (eventos valem por cima). */
export function relationOf(a, b, d, now) {
  if (!a || !b) return 'neutro';
  if (a === b) return 'mesma';
  const [x, y] = pair(a, b);
  const live = (e) => now >= e.startsAt && now < e.endsAt;
  const events = d?.events || [];
  if (events.some((e) => e.kind === 'tregua' && live(e) && (e.a === null || (e.a === x && e.b === y)))) return 'tregua';
  if (events.some((e) => e.kind === 'guerra' && live(e) && e.a === x && e.b === y)) return 'guerra';
  return (d?.relations || []).find((r) => r.a === x && r.b === y)?.state ?? 'neutro';
}

/** Na Zona de Conflito, `att` pode machucar `vic`? ({ village, akatsuki }) */
export function conflictHostile(att, vic, d, now) {
  if (att.akatsuki && vic.akatsuki) return false;
  if (!att.village || !vic.village) return true;
  const rel = relationOf(att.village, vic.village, d, now);
  return rel !== 'alianca' && rel !== 'tregua';
}

/** Vilas aliadas de `v` agora. */
export function alliesOf(v, villages, d, now) {
  if (!v) return [];
  return villages.filter((o) => o !== v && relationOf(v, o, d, now) === 'alianca');
}

/** Fator de preço nas lojas para quem é da vila. */
export function priceFactor(v, villages, d, now) {
  if (!v) return 1;
  const others = villages.filter((o) => o !== v);
  const war = others.some((o) => relationOf(v, o, d, now) === 'guerra');
  const ally = others.some((o) => relationOf(v, o, d, now) === 'alianca');
  return (war ? 1.1 : 1) * (ally ? 0.95 : 1);
}

/** Pode entrar no mapa? (sem `access`: tudo aberto) */
export function mapAllowed(layout, access) {
  if (!layout || !access) return true;
  if (layout.refuge) return access.village === null;
  if (layout.village) return layout.village === access.village || access.allies.includes(layout.village);
  return true;
}
