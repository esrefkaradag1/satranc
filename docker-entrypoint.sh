#!/bin/sh
set -eu

escape_js() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_env() {
  key="$1"
  value="$(eval "printf '%s' \"\${$key:-}\"")"
  printf '  "%s": "%s",\n' "$key" "$(escape_js "$value")"
}

cat > /usr/share/nginx/html/env-config.js <<EOF
window.__RUNTIME_ENV__ = {
$(write_env VITE_SUPABASE_URL)
$(write_env VITE_SUPABASE_ANON_KEY)
$(write_env VITE_SUPABASE_SERVICE_ROLE_KEY)
$(write_env VITE_AGORA_APP_ID)
$(write_env VITE_AGORA_CHANNEL_PREFIX)
$(write_env VITE_OPENROUTER_API_KEY)
$(write_env VITE_OPENROUTER_MODEL)
$(write_env VITE_API_URL)
};
EOF

# Platform proxy API (Chess.com / Lichess) — Docker'da Vercel serverless yerine
node /app/server/docker-api.mjs &
API_PID=$!

cleanup() {
  if kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

exec nginx -g 'daemon off;'
