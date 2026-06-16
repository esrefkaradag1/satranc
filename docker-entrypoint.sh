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

exec nginx -g 'daemon off;'
