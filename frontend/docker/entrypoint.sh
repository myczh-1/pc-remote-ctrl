#!/bin/sh
set -euo

HOME_BACKEND_URL="${HOME_BACKEND_URL:-}"
CLOUD_GATEWAY_URL="${CLOUD_GATEWAY_URL:-}"

add_trailing_slash() {
  val="$1"
  if [ -z "$val" ]; then
    printf ''
    return
  fi
  case "$val" in
    */) printf '%s' "$val" ;;
    *) printf '%s/' "$val" ;;
  esac
}

HOME_BACKEND_URL="$(add_trailing_slash "$HOME_BACKEND_URL")"
CLOUD_GATEWAY_URL="$(add_trailing_slash "$CLOUD_GATEWAY_URL")"

cat <<'CONF' >/etc/nginx/conf.d/default.conf
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  charset utf-8;
  client_max_body_size 10m;

  location = /healthz {
    access_log off;
    add_header Content-Type text/plain;
    return 200 'ok';
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
CONF

if [ -n "$HOME_BACKEND_URL" ]; then
  cat <<CONF >>/etc/nginx/conf.d/default.conf
  location /api/ {
    proxy_pass ${HOME_BACKEND_URL};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
  }
CONF
else
  cat <<'CONF' >>/etc/nginx/conf.d/default.conf
  location /api/ {
    return 502 "HOME_BACKEND_URL not configured";
  }
CONF
fi

if [ -n "$CLOUD_GATEWAY_URL" ]; then
  cat <<CONF >>/etc/nginx/conf.d/default.conf
  location /cloud/ {
    proxy_pass ${CLOUD_GATEWAY_URL};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
  }
CONF
else
  cat <<'CONF' >>/etc/nginx/conf.d/default.conf
  location /cloud/ {
    return 502 "CLOUD_GATEWAY_URL not configured";
  }
CONF
fi

cat <<'CONF' >>/etc/nginx/conf.d/default.conf
}
CONF

exec "$@"
