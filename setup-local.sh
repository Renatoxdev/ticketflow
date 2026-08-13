#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT_DIR"

copy_env_if_missing() {
  example_file="$1"
  target_file="$2"

  if [ ! -f "$target_file" ]; then
    cp "$example_file" "$target_file"
    echo "Criado $target_file a partir de $example_file"
  else
    echo "Mantido $target_file existente"
  fi
}

copy_env_if_missing "backend/.env.example" "backend/.env"
copy_env_if_missing "frontend/.env.example" "frontend/.env"

TMDB_API_KEY_FROM_FILE="$(sed -n 's/^TMDB_API_KEY=//p' backend/.env | tail -n 1)"

if [ -n "$TMDB_API_KEY_FROM_FILE" ] && [ "$TMDB_API_KEY_FROM_FILE" != "sua_chave_da_tmdb" ]; then
  export TMDB_API_KEY="$TMDB_API_KEY_FROM_FILE"
else
  echo "Aviso: configure TMDB_API_KEY em backend/.env para usar a busca real da TMDb."
fi

docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.db.seed

echo ""
echo "Ambiente local pronto."
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8000"
