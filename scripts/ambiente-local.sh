#!/bin/bash
# Prepara o jogo para rodar NESTE container (sessão nova do Claude Code na nuvem): Postgres local, banco com todas as
# migrações, segredos locais aleatórios (NUNCA os do Render), servidor na porta 3000 e o ninja admin "rin".
#
#   bash scripts/ambiente-local.sh          # prepara (ou só religa o que caiu) e sobe o servidor
#
# Depois: os scripts de captura (arte/jutsus-vfx/capturar.ts) e o `npm run verify` com
#   TEST_DATABASE_URL="postgres://postgres@localhost:5433/postgres?host=/var/tmp"
# Pode rodar de novo à vontade: o que já existe é mantido.
set -e
cd "$(dirname "$0")/.."
PG=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
if [ -z "$PG" ]; then
  echo "Instalando o PostgreSQL..." && apt-get update -qq && apt-get install -y -qq postgresql >/dev/null
  PG=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
fi
DATA=${LOCAL_PGDATA:-/var/tmp/pgdata}
PGP=${LOCAL_PGPORT:-5433}
WEB=${LOCAL_WEBPORT:-3000}
RUN=${LOCAL_RUN:-/var/tmp/run-server.sh}
if [ ! -f "$DATA/PG_VERSION" ]; then
  mkdir -p "$DATA" && chown postgres "$DATA"
  su postgres -c "$PG/initdb -D $DATA -A trust -U postgres" >/dev/null
fi
if ! "$PG/pg_isready" -h /var/tmp -p $PGP >/dev/null 2>&1; then
  rm -f /var/tmp/.s.PGSQL.$PGP /var/tmp/.s.PGSQL.$PGP.lock
  su postgres -c "$PG/pg_ctl -D $DATA -l /var/tmp/pg.log -o '-p $PGP -k /var/tmp' start" >/dev/null
  for i in $(seq 20); do "$PG/pg_isready" -h /var/tmp -p $PGP >/dev/null 2>&1 && break; sleep 0.5; done
fi
PSQL="$PG/psql -h /var/tmp -p $PGP -U postgres -v ON_ERROR_STOP=1 -q"
if ! $PSQL -At -c "select 1 from pg_database where datname='jogo'" | grep -q 1; then
  $PSQL -c "create database jogo"
  bash scripts/gerar-init.sh >/dev/null
  $PSQL -d jogo -f db/init_completo.sql >/dev/null
  echo "Banco 'jogo' criado com todas as migrações."
fi
ENV=${LOCAL_ENV:-/var/tmp/jogo.env}
if [ ! -f "$ENV" ]; then
  # segredos SÓ deste container (aleatórios); os de produção ficam no Render
  cat > "$ENV" <<EOF
DATABASE_URL=postgres://postgres@localhost:$PGP/jogo?host=/var/tmp
JWT_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=')
SERVICE_TOKEN=$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=')
PORT=$WEB
INTERNAL_PORT=$((WEB + 1))
EOF
  chmod 600 "$ENV"
fi
cat > "$RUN" <<EOF
#!/bin/bash
set -a; . $ENV; set +a
echo \$\$ > /var/tmp/server-$WEB.pid
cd $(pwd) && exec npx tsx src/server.ts
EOF
chmod +x "$RUN"
[ -d node_modules ] || npm ci --silent
# derruba só o servidor desta porta (se houver) e sobe de novo
if [ -f /var/tmp/server-$WEB.pid ]; then kill "$(cat /var/tmp/server-$WEB.pid)" 2>/dev/null || true; fi
[ "$WEB" = 3000 ] && pkill -f 'tsx src/server.ts' 2>/dev/null || true   # o padrão: derruba o servidor antigo, sem PID
sleep 1
(nohup "$RUN" > /var/tmp/server-$WEB.log 2>&1 &)
for i in $(seq 40); do curl -s -o /dev/null localhost:$WEB/ && break; sleep 1; done
curl -s -o /dev/null localhost:$WEB/ || { echo "O servidor não subiu: veja /var/tmp/server-$WEB.log"; exit 1; }
# o ninja de teste: admin (o nível vem do XP: suba com /admin no chat do jogo se precisar; senha aleatória, ninguém precisa dela: as capturas entram com token local)
if ! $PSQL -d jogo -At -c "select 1 from game.players where username='rin'" | grep -q 1; then
  PW="Ab1$(head -c 18 /dev/urandom | base64 | tr -d '\n/+=')"
  curl -s -X POST localhost:$WEB/auth/register -H 'content-type: application/json' \
    -d "{\"username\":\"rin\",\"email\":\"rin@local.test\",\"password\":\"$PW\"}" >/dev/null
  $PSQL -d jogo -c "update game.players set is_admin = true, ryo = 100000 where username = 'rin'"
fi
echo "Pronto: servidor em localhost:$WEB, banco 'jogo' (porta $PGP), ninja 'rin' (admin)."
