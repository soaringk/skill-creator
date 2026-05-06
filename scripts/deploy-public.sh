#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"
UV_CACHE_DIR=/tmp/uv-cache uv sync --extra dev

AUTH_FILE=/etc/nginx/.htpasswd-skill-creator
AUTH_USER=skill-creator
AUTH_PASSWORD="$(openssl rand -hex 18)"
AUTH_HASH="$(printf '%s\n' "$AUTH_PASSWORD" | openssl passwd -apr1 -stdin)"

printf '%s:%s\n' "$AUTH_USER" "$AUTH_HASH" | sudo tee "$AUTH_FILE" >/dev/null
sudo chmod 644 "$AUTH_FILE"

sudo tee /etc/nginx/snippets/skill-creator-api.conf >/dev/null <<'EOF'
location ^~ /tools/skill-creator/api/ {
    auth_basic "Skill Creator";
    auth_basic_user_file /etc/nginx/.htpasswd-skill-creator;

    client_max_body_size 100m;
    proxy_pass http://127.0.0.1:8010/api/;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600;
    proxy_send_timeout 3600;
}

location ^~ /tools/skill-creator/ {
    auth_basic "Skill Creator";
    auth_basic_user_file /etc/nginx/.htpasswd-skill-creator;

    proxy_pass http://127.0.0.1:5173;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_buffering off;
    proxy_cache off;
}
EOF

if ! grep -q 'skill-creator-api.conf' /etc/nginx/sites-available/blog; then
  sudo cp /etc/nginx/sites-available/blog "/etc/nginx/sites-available/blog.bak.$(date +%Y%m%d%H%M%S)"
  sudo perl -0pi -e 's/(root \/var\/www\/blog;\n    index index\.html;\n)/$1\n    include \/etc\/nginx\/snippets\/skill-creator-api.conf;\n/g' /etc/nginx/sites-available/blog
fi

sudo nginx -t
sudo systemctl reload nginx

"$ROOT/scripts/stop-frontend.sh"
"$ROOT/scripts/stop-backend.sh"
"$ROOT/scripts/start-backend.sh"
"$ROOT/scripts/start-frontend.sh"

echo "Skill Creator is ready for https://kefan.life/tools/skill-creator/ with nginx Basic Auth."
echo "Basic Auth username: $AUTH_USER"
echo "Basic Auth password: $AUTH_PASSWORD"
echo "This password is generated on every deployment."
