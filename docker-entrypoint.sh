#!/bin/sh
# Storege WMS container entrypoint: prepare the datasource, sync the schema, optionally seed, then serve.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set; falling back to SQLite at /app/server/prisma/dev.db"
  export DATABASE_URL="file:./dev.db"
fi

case "$DATABASE_URL" in
  postgres://*|postgresql://*)
    echo "→ PostgreSQL datasource detected"
    node scripts/use-postgres.mjs --no-env
    ;;
  *)
    echo "→ SQLite datasource detected"
    node scripts/use-postgres.mjs --sqlite --no-env
    ;;
esac

# Prisma client is generated for the selected provider (engines are already in node_modules).
npx prisma generate --schema server/prisma/schema.prisma

echo "→ Syncing database schema"
npx prisma db push --schema server/prisma/schema.prisma --skip-generate

if [ "$SEED_DB" = "true" ] || [ "$SEED_DB" = "1" ]; then
  if node scripts/needs-seed.mjs; then
    echo "→ Database already has data; skipping seed"
  else
    echo "→ Seeding demo data (empty database)"
    npm run db:seed
  fi
fi

echo "→ Starting Storege WMS on http://0.0.0.0:${PORT:-4000}"
exec npm run start -w server
