#!/bin/bash
# Gera db/init_completo.sql: todas as migrações (base até a última), na ordem de test/support/testDb.ts.
# SÓ para criar um banco NOVO e VAZIO. Num banco que já roda, rode apenas as migrações que faltam.
set -e
cd "$(dirname "$0")/.."
node -e "
const fs = require('fs');
const files = fs.readFileSync('test/support/testDb.ts', 'utf8').match(/MIGRATIONS = \[([^\]]*)\]/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
let out = '-- =====================================================================================================================\n'
  + '-- Herança do Fogo: banco completo (base até a v' + (files.length + 1) + '), na ordem. Gerado por scripts/gerar-init.sh.\n'
  + '-- SÓ PARA UM BANCO NOVO E VAZIO. Num banco que já roda, NÃO rode isto: a base (schema_ranks_missoes_sensei) e a v8 dão erro\n'
  + '-- se repetidas (\"already exists\"); rode só as migrações que faltam (DEPLOY.md). As de v9 em diante podem ser repetidas.\n'
  + '-- Cada arquivo tem o seu BEGIN/COMMIT.\n'
  + '-- =====================================================================================================================\n\n';
for (const f of files) out += '\n-- ################################################################################################\n-- ## ' + f + '\n-- ################################################################################################\n' + fs.readFileSync('db/' + f, 'utf8') + '\n';
fs.writeFileSync('db/init_completo.sql', out);
console.log(files.length + ' arquivos, ' + out.length + ' bytes');
"
