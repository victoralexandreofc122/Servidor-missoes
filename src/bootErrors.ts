/**
 * Traduz a falha de subida numa instrução clara para o log do Render.
 * O servidor falha rápido (sai com código 1) em vez de subir quebrado: o Render
 * marca o deploy como falho e mantém a versão anterior no ar.
 */
export function describeBootError(err: unknown): string {
  const e = (typeof err === 'object' && err !== null ? err : {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : String(err);

  if (code === '3F000' || code === '42P01') {
    return 'O schema do jogo não existe neste banco. Abra o SQL Editor do Neon, rode o arquivo '
      + 'db/schema_ranks_missoes_sensei.sql inteiro e depois faça "Manual Deploy" no Render.';
  }
  if (code === '42703' && /email|password_hash/.test(message)) {
    return 'Falta a migração v3 (login) neste banco. Abra o SQL Editor do Neon, rode o arquivo '
      + 'db/schema_v3_auth.sql inteiro e depois faça "Manual Deploy" no Render.';
  }
  if (/unsupported startup parameter/i.test(message)) {
    return 'A DATABASE_URL aponta para o pooler do Neon (host com "-pooler"). No Neon, clique em Connect, '
      + 'desligue "Connection pooling", copie a connection string de novo e troque a DATABASE_URL no Render.';
  }
  if (code === '28P01' || code === '28000') {
    return 'O banco recusou usuário ou senha. Copie a connection string de novo no Neon (Connect) e troque a DATABASE_URL no Render.';
  }
  if (code === '3D000') {
    return 'O banco indicado na DATABASE_URL não existe. Confira o nome do banco no fim da connection string (antes do "?").';
  }
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(code)
      || /timeout exceeded when trying to connect|Connection terminated/i.test(message)) {
    return 'Não consegui alcançar o banco. Confira o host na DATABASE_URL e se o projeto do Neon está ativo; '
      + 'se o Neon estava dormindo, o Render tenta de novo sozinho.';
  }
  if (/certificate|self[- ]signed|SSL/i.test(message)) {
    return 'Falha de SSL com o banco. Use a connection string do Neon como ela vem, com "?sslmode=require" no fim.';
  }
  return `Falha ao iniciar: ${message}`;
}
