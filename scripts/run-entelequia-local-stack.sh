#!/usr/bin/env bash

set -euo pipefail

CMD="${1:-up}"
LOG_TARGET="${2:-chatbot}"

RUNTIME_DIR="${RUNTIME_DIR:-/tmp/entelequia-local-stack}"

ENTELEQUIA_FE_REPO="${ENTELEQUIA_FE_REPO:-/Users/user/Workspace/entelequia_tienda}"
CHATBOT_BE_REPO="${CHATBOT_BE_REPO:-/Users/user/Workspace/chatbot-EntelequIA-BE}"
ENTELEQUIA_BE_REPO="${ENTELEQUIA_BE_REPO:-/Users/user/Workspace/p-entelequia24}"
CHAT_WIDGET_REPO="${CHAT_WIDGET_REPO:-/Users/user/Workspace/chatbot-EntelequIA/chatbot-widget}"

FE_PORT="${FE_PORT:-5173}"
CHATBOT_PORT="${CHATBOT_PORT:-3090}"
ENTELEQUIA_PORT="${ENTELEQUIA_PORT:-8010}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
CHATBOT_LOG_LEVEL="${CHATBOT_LOG_LEVEL:-info}"
CHATBOT_ENTELEQUIA_BASE_URL="${CHATBOT_ENTELEQUIA_BASE_URL:-https://entelequia.com.ar}"

ENTELEQUIA_BE_PID_FILE="$RUNTIME_DIR/entelequia-be.pid"
CHATBOT_PID_FILE="$RUNTIME_DIR/chatbot.pid"
FE_PID_FILE="$RUNTIME_DIR/fe.pid"

ENTELEQUIA_BE_LOG="$RUNTIME_DIR/entelequia-be.log"
CHATBOT_LOG="$RUNTIME_DIR/chatbot.log"
FE_LOG="$RUNTIME_DIR/fe.log"

BOT_SECRET=""
UP_IN_PROGRESS=0
WIDGET_CSP_STATUS="unknown"
WIDGET_CSP_NOTE=""

log_info() {
  printf '[INFO] %s\n' "$1"
}

log_warn() {
  printf '[WARN] %s\n' "$1"
}

log_error() {
  printf '[ERROR] %s\n' "$1" >&2
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/run-entelequia-local-stack.sh [up|down|status|logs] [service]

Commands:
  up                Start Entelequia BE + Chatbot BE + Entelequia FE (default)
  down              Stop services managed by this script
  status            Show running status and health per service
  logs [service]    Tail logs: chatbot (default) | all | entelequia | fe

Configurable env vars:
  ENTELEQUIA_FE_REPO      Default: /Users/user/Workspace/entelequia_tienda
  CHATBOT_BE_REPO         Default: /Users/user/Workspace/chatbot-EntelequIA-BE
  ENTELEQUIA_BE_REPO      Default: /Users/user/Workspace/p-entelequia24
  CHAT_WIDGET_REPO        Default: /Users/user/Workspace/chatbot-EntelequIA/chatbot-widget
  FE_PORT                 Default: 5173
  CHATBOT_PORT            Default: 3090
  ENTELEQUIA_PORT         Default: 8010
  REDIS_URL               Default: redis://127.0.0.1:6379
  CHATBOT_LOG_LEVEL       Default: info
  CHATBOT_ENTELEQUIA_BASE_URL Default: https://entelequia.com.ar
USAGE
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_error "Missing required command: $cmd"
    exit 1
  fi
}

read_env_var() {
  local env_file="$1"
  local key="$2"
  awk -F= -v key="$key" '
    $1 == key {
      sub(/^[^=]*=/, "", $0)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
      gsub(/^"|"$/, "", $0)
      gsub(/^'\''|'\''$/, "", $0)
      print
      exit
    }
  ' "$env_file"
}

normalize_pg_url_for_psql() {
  local db_url="$1"
  printf '%s' "$db_url" | sed 's/sslmode=no-verify/sslmode=require/g'
}

extract_origin_from_url() {
  local url="$1"
  printf '%s' "$url" | sed -nE 's#^([a-zA-Z][a-zA-Z0-9+.-]*://[^/]+).*$#\1#p'
}

extract_connect_src_from_csp_file() {
  local file_path="$1"
  if [ ! -f "$file_path" ]; then
    return 1
  fi

  local csp_meta csp_connect_src
  csp_meta="$(
    tr '\n' ' ' < "$file_path" |
      sed -nE 's#.*<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"[^>]*>.*#\1#p'
  )"

  if [ -z "$csp_meta" ]; then
    return 1
  fi

  csp_connect_src="$(printf '%s' "$csp_meta" | sed -nE 's#.*connect-src ([^;]*).*#\1#p')"
  if [ -z "$csp_connect_src" ]; then
    return 1
  fi

  printf '%s' "$csp_connect_src"
}

matches_csp_source() {
  local origin="$1"
  local source="$2"

  if [ "$source" = "$origin" ]; then
    return 0
  fi

  case "$source" in
    http://localhost:\*|https://localhost:\*|http://127.0.0.1:\*|https://127.0.0.1:\*)
      if [[ "$origin" == "${source%\*}"* ]]; then
        return 0
      fi
      ;;
  esac

  if [[ "$source" == *"://*."* ]]; then
    local source_scheme source_suffix origin_scheme origin_host_port origin_host
    source_scheme="${source%%://*}"
    source_suffix="${source#*://*.}"
    origin_scheme="${origin%%://*}"
    origin_host_port="${origin#*://}"
    origin_host="${origin_host_port%%:*}"
    if [ "$origin_scheme" = "$source_scheme" ] && [[ "$origin_host" == *".${source_suffix}" ]]; then
      return 0
    fi
  fi

  return 1
}

is_webhook_origin_allowed_by_widget_csp() {
  local webhook_origin="$1"
  local csp_connect_src="$2"
  local source

  for source in $csp_connect_src; do
    if matches_csp_source "$webhook_origin" "$source"; then
      return 0
    fi
  done

  return 1
}

resolve_widget_webhook_url() {
  local fe_env_file="$ENTELEQUIA_FE_REPO/.env"
  local webhook_url
  if [ -f "$fe_env_file" ]; then
    webhook_url="$(read_env_var "$fe_env_file" "VITE_CHATBOT_WEBHOOK_URL")"
  fi

  if [ -z "${webhook_url:-}" ]; then
    webhook_url="http://127.0.0.1:${CHATBOT_PORT}/wf1/chat/message"
  fi

  printf '%s' "$webhook_url"
}

build_and_sync_widget_for_local_dev() {
  local widget_index="$ENTELEQUIA_FE_REPO/public/chatbot-widget/index.html"

  if [ ! -d "$CHAT_WIDGET_REPO/node_modules" ]; then
    log_error "Missing dependency folder: $CHAT_WIDGET_REPO/node_modules"
    log_error "Run: (cd $CHAT_WIDGET_REPO && npm install)"
    return 1
  fi

  log_warn "Widget CSP does not allow local webhook origin. Rebuilding widget with development CSP and syncing to FE."
  if ! npm --prefix "$CHAT_WIDGET_REPO" run build:skip-checks -- --mode development >>"$FE_LOG" 2>&1; then
    log_error "Widget build failed. See $FE_LOG"
    return 1
  fi

  if ! npm --prefix "$ENTELEQUIA_FE_REPO" run sync:chatbot-widget >>"$FE_LOG" 2>&1; then
    log_error "Widget sync failed. See $FE_LOG"
    return 1
  fi

  if [ ! -f "$widget_index" ]; then
    log_error "Widget sync completed but $widget_index was not generated."
    return 1
  fi

  return 0
}

validate_widget_csp_matches_webhook() {
  local mode="${1:-readonly}"
  local widget_index="$ENTELEQUIA_FE_REPO/public/chatbot-widget/index.html"
  local webhook_url webhook_origin csp_connect_src

  WIDGET_CSP_STATUS="unknown"
  WIDGET_CSP_NOTE=""

  webhook_url="$(resolve_widget_webhook_url)"
  if [[ ! "$webhook_url" =~ ^https?:// ]]; then
    WIDGET_CSP_STATUS="ok"
    WIDGET_CSP_NOTE="relative_webhook_url"
    return 0
  fi

  webhook_origin="$(extract_origin_from_url "$webhook_url")"
  if [ -z "$webhook_origin" ]; then
    WIDGET_CSP_STATUS="mismatch"
    WIDGET_CSP_NOTE="invalid_webhook_url"
    return 1
  fi

  csp_connect_src="$(extract_connect_src_from_csp_file "$widget_index" || true)"
  if [ -z "$csp_connect_src" ]; then
    WIDGET_CSP_STATUS="mismatch"
    WIDGET_CSP_NOTE="missing_widget_csp"
  elif is_webhook_origin_allowed_by_widget_csp "$webhook_origin" "$csp_connect_src"; then
    WIDGET_CSP_STATUS="ok"
    return 0
  else
    WIDGET_CSP_STATUS="mismatch"
    WIDGET_CSP_NOTE="origin_not_allowed"
  fi

  if [ "$mode" != "autofix" ]; then
    return 1
  fi

  if ! build_and_sync_widget_for_local_dev; then
    return 1
  fi

  csp_connect_src="$(extract_connect_src_from_csp_file "$widget_index" || true)"
  if [ -n "$csp_connect_src" ] && is_webhook_origin_allowed_by_widget_csp "$webhook_origin" "$csp_connect_src"; then
    WIDGET_CSP_STATUS="ok"
    WIDGET_CSP_NOTE="autofixed"
    return 0
  fi

  WIDGET_CSP_STATUS="mismatch"
  WIDGET_CSP_NOTE="autofix_failed"
  log_error "Widget CSP still blocks webhook origin ($webhook_origin) after rebuild/sync."
  log_error "Run manually: (cd $CHAT_WIDGET_REPO && npm run build:skip-checks -- --mode development) && (cd $ENTELEQUIA_FE_REPO && npm run sync:chatbot-widget)"
  return 1
}

is_port_in_use() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

wait_http() {
  local url="$1"
  local label="$2"
  local timeout_seconds="${3:-60}"
  local elapsed=0

  while [ "$elapsed" -lt "$timeout_seconds" ]; do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  log_error "$label did not become ready in ${timeout_seconds}s ($url)"
  return 1
}

wait_service_stable() {
  local pid_file="$1"
  local url="$2"
  local label="$3"
  local checks="${4:-3}"
  local i=0

  while [ "$i" -lt "$checks" ]; do
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -z "$pid" ] || ! pid_is_running "$pid"; then
      log_error "$label exited before stabilization window completed."
      return 1
    fi

    if ! curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      log_error "$label healthcheck failed during stabilization window."
      return 1
    fi

    sleep 1
    i=$((i + 1))
  done
}

pid_is_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

resolve_chatbot_node_env() {
  local npm_pid
  npm_pid="$(cat "$CHATBOT_PID_FILE" 2>/dev/null || true)"
  if [ -z "$npm_pid" ] || ! pid_is_running "$npm_pid"; then
    return 0
  fi

  ps eww -p "$npm_pid" 2>/dev/null | tr ' ' '\n' | awk -F= '/^NODE_ENV=/{print $2; exit}'
}

stop_service() {
  local service="$1"
  local pid_file="$2"

  if [ ! -f "$pid_file" ]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -z "$pid" ]; then
    rm -f "$pid_file"
    return 0
  fi

  if ! pid_is_running "$pid"; then
    rm -f "$pid_file"
    return 0
  fi

  log_info "Stopping $service (pid=$pid)"
  kill "$pid" >/dev/null 2>&1 || true

  local attempts=0
  while pid_is_running "$pid" && [ "$attempts" -lt 10 ]; do
    sleep 1
    attempts=$((attempts + 1))
  done

  if pid_is_running "$pid"; then
    log_warn "$service did not stop gracefully, sending SIGKILL (pid=$pid)"
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi

  rm -f "$pid_file"
}

service_status() {
  local service="$1"
  local pid_file="$2"
  local url="$3"
  local port="$4"

  local pid=""
  if [ -f "$pid_file" ]; then
    pid="$(cat "$pid_file" 2>/dev/null || true)"
  fi

  if [ -n "$pid" ] && pid_is_running "$pid"; then
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      printf '%s: running (pid=%s, port=%s, health=up)\n' "$service" "$pid" "$port"
    else
      printf '%s: running (pid=%s, port=%s, health=down)\n' "$service" "$pid" "$port"
    fi
    return 0
  fi

  if is_port_in_use "$port"; then
    printf '%s: stopped (port=%s is in use by another process)\n' "$service" "$port"
  else
    printf '%s: stopped\n' "$service"
  fi
}

start_service() {
  local service="$1"
  local workdir="$2"
  local pid_file="$3"
  local log_file="$4"
  shift 4

  if [ -f "$pid_file" ]; then
    local existing_pid
    existing_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$existing_pid" ] && pid_is_running "$existing_pid"; then
      log_info "$service already running (pid=$existing_pid)"
      return 0
    fi
    rm -f "$pid_file"
  fi

  (
    cd "$workdir"
    nohup "$@" >>"$log_file" 2>&1 &
    echo "$!" >"$pid_file"
  )

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -z "$pid" ] || ! pid_is_running "$pid"; then
    log_error "Failed to start $service"
    return 1
  fi

  log_info "$service started (pid=$pid)"
}

start_entelequia_be() {
  start_service \
    "entelequia-be" \
    "$ENTELEQUIA_BE_REPO" \
    "$ENTELEQUIA_BE_PID_FILE" \
    "$ENTELEQUIA_BE_LOG" \
    env BOT_ORDER_LOOKUP_HMAC_SECRET="$BOT_SECRET" \
    php artisan serve --host=127.0.0.1 --port="$ENTELEQUIA_PORT"
}

start_chatbot() {
  start_service \
    "chatbot" \
    "$CHATBOT_BE_REPO" \
    "$CHATBOT_PID_FILE" \
    "$CHATBOT_LOG" \
    env \
    NODE_ENV=development \
    TURNSTILE_SECRET_KEY= \
    PORT="$CHATBOT_PORT" \
    ENTELEQUIA_BASE_URL="$CHATBOT_ENTELEQUIA_BASE_URL" \
    BOT_ORDER_LOOKUP_HMAC_SECRET="$BOT_SECRET" \
    REDIS_URL="$REDIS_URL" \
    LOG_LEVEL="$CHATBOT_LOG_LEVEL" \
    npm run start:dev
}

start_fe() {
  start_service \
    "fe" \
    "$ENTELEQUIA_FE_REPO" \
    "$FE_PID_FILE" \
    "$FE_LOG" \
    npm run dev -- --host 127.0.0.1 --port "$FE_PORT"
}

ensure_runtime_dir() {
  mkdir -p "$RUNTIME_DIR"
  touch "$ENTELEQUIA_BE_LOG" "$CHATBOT_LOG" "$FE_LOG"
}

stop_all() {
  stop_service "fe" "$FE_PID_FILE"
  stop_service "chatbot" "$CHATBOT_PID_FILE"
  stop_service "entelequia-be" "$ENTELEQUIA_BE_PID_FILE"
}

on_up_failure() {
  if [ "$UP_IN_PROGRESS" -eq 1 ]; then
    log_error "Startup failed. Rolling back started services."
    stop_all
  fi
}

validate_repo_artifacts() {
  [ -d "$CHATBOT_BE_REPO" ] || { log_error "Missing CHATBOT_BE_REPO: $CHATBOT_BE_REPO"; exit 1; }
  [ -d "$ENTELEQUIA_BE_REPO" ] || { log_error "Missing ENTELEQUIA_BE_REPO: $ENTELEQUIA_BE_REPO"; exit 1; }
  [ -d "$ENTELEQUIA_FE_REPO" ] || { log_error "Missing ENTELEQUIA_FE_REPO: $ENTELEQUIA_FE_REPO"; exit 1; }
  [ -d "$CHAT_WIDGET_REPO" ] || { log_error "Missing CHAT_WIDGET_REPO: $CHAT_WIDGET_REPO"; exit 1; }

  [ -d "$CHATBOT_BE_REPO/node_modules" ] || {
    log_error "Missing dependency folder: $CHATBOT_BE_REPO/node_modules"
    log_error "Run: (cd $CHATBOT_BE_REPO && npm install)"
    exit 1
  }

  [ -d "$ENTELEQUIA_FE_REPO/node_modules" ] || {
    log_error "Missing dependency folder: $ENTELEQUIA_FE_REPO/node_modules"
    log_error "Run: (cd $ENTELEQUIA_FE_REPO && npm install)"
    exit 1
  }

  [ -d "$ENTELEQUIA_BE_REPO/vendor" ] || {
    log_error "Missing dependency folder: $ENTELEQUIA_BE_REPO/vendor"
    log_error "Run: (cd $ENTELEQUIA_BE_REPO && composer install)"
    exit 1
  }
}

validate_entelequia_be_env() {
  local env_file="$ENTELEQUIA_BE_REPO/.env"
  [ -f "$env_file" ] || { log_error "Missing file: $env_file"; exit 1; }

  BOT_SECRET="$(read_env_var "$env_file" "BOT_ORDER_LOOKUP_HMAC_SECRET")"
  if [ -z "$BOT_SECRET" ]; then
    log_error "BOT_ORDER_LOOKUP_HMAC_SECRET is required in $env_file"
    exit 1
  fi

  local db_host db_port db_name db_user db_pass
  db_host="$(read_env_var "$env_file" "DB_HOST")"
  db_port="$(read_env_var "$env_file" "DB_PORT")"
  db_name="$(read_env_var "$env_file" "DB_DATABASE")"
  db_user="$(read_env_var "$env_file" "DB_USERNAME")"
  db_pass="$(read_env_var "$env_file" "DB_PASSWORD")"

  db_host="${db_host:-127.0.0.1}"
  db_port="${db_port:-3306}"

  if [ -z "$db_name" ] || [ -z "$db_user" ] || [ -z "$db_pass" ]; then
    log_error "Incomplete DB credentials in $env_file"
    exit 1
  fi

  if ! MYSQL_PWD="$db_pass" mysql -h "$db_host" -P "$db_port" -u "$db_user" -D "$db_name" -Nse "SELECT 1" >/dev/null 2>&1; then
    log_error "MySQL check failed for Entelequia backend (host=$db_host port=$db_port db=$db_name user=$db_user)"
    exit 1
  fi
}

ensure_chatbot_feedback_schema() {
  local env_file="$CHATBOT_BE_REPO/.env"
  [ -f "$env_file" ] || { log_error "Missing file: $env_file"; exit 1; }

  local chatbot_db_url psql_db_url
  chatbot_db_url="$(read_env_var "$env_file" "CHATBOT_DB_URL")"
  if [ -z "$chatbot_db_url" ]; then
    log_error "CHATBOT_DB_URL is required in $env_file"
    exit 1
  fi

  psql_db_url="$(normalize_pg_url_for_psql "$chatbot_db_url")"

  local has_feedback_table has_hitl_queue
  if ! has_feedback_table="$(psql "$psql_db_url" -At -c "SELECT to_regclass('public.message_feedback') IS NOT NULL;" 2>/dev/null)"; then
    log_error "PostgreSQL check failed for chatbot feedback schema."
    exit 1
  fi

  if ! has_hitl_queue="$(psql "$psql_db_url" -At -c "SELECT to_regclass('public.hitl_review_queue') IS NOT NULL;" 2>/dev/null)"; then
    log_error "PostgreSQL check failed for chatbot HITL queue schema."
    exit 1
  fi

  if [ "$has_hitl_queue" != "t" ]; then
    log_warn "hitl_review_queue table is missing. Applying sql/05_hitl_review_queue.sql."
    psql "$psql_db_url" -f "$CHATBOT_BE_REPO/sql/05_hitl_review_queue.sql" >/dev/null
  fi

  if [ "$has_feedback_table" != "t" ]; then
    log_warn "message_feedback table is missing. Applying sql/08_message_feedback.sql."
    psql "$psql_db_url" -f "$CHATBOT_BE_REPO/sql/08_message_feedback.sql" >/dev/null
    log_info "Feedback schema applied successfully."
  fi
}

validate_ports_free() {
  local conflict=0
  local name port
  for tuple in "fe:$FE_PORT" "chatbot:$CHATBOT_PORT" "entelequia-be:$ENTELEQUIA_PORT"; do
    name="${tuple%%:*}"
    port="${tuple##*:}"
    if is_port_in_use "$port"; then
      log_error "Port $port is already in use ($name)"
      lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
      conflict=1
    fi
  done

  if [ "$conflict" -eq 1 ]; then
    exit 1
  fi
}

preflight() {
  require_cmd bash
  require_cmd npm
  require_cmd node
  require_cmd php
  require_cmd curl
  require_cmd awk
  require_cmd lsof
  require_cmd mysql
  require_cmd psql
  require_cmd tail

  validate_repo_artifacts
  validate_entelequia_be_env
  ensure_chatbot_feedback_schema
  if ! validate_widget_csp_matches_webhook "autofix"; then
    log_error "Widget CSP validation failed before startup."
    exit 1
  fi
}

print_summary() {
  cat <<EOF

Stack ready:
  Entelequia BE:          http://127.0.0.1:${ENTELEQUIA_PORT}
  Chatbot BE:             http://127.0.0.1:${CHATBOT_PORT}
  Chatbot upstream API:   ${CHATBOT_ENTELEQUIA_BASE_URL}
  Entelequia FE:          http://127.0.0.1:${FE_PORT}
  Widget CSP status:      ${WIDGET_CSP_STATUS}

Logs:
  $ENTELEQUIA_BE_LOG
  $CHATBOT_LOG
  $FE_LOG

Commands:
  scripts/run-entelequia-local-stack.sh status
  scripts/run-entelequia-local-stack.sh logs
  scripts/run-entelequia-local-stack.sh logs all
  scripts/run-entelequia-local-stack.sh down
EOF
}

command_up() {
  ensure_runtime_dir
  preflight
  validate_ports_free

  UP_IN_PROGRESS=1
  trap on_up_failure EXIT INT TERM

  start_entelequia_be
  wait_http "http://127.0.0.1:${ENTELEQUIA_PORT}/up" "entelequia-be" 90
  wait_service_stable "$ENTELEQUIA_BE_PID_FILE" "http://127.0.0.1:${ENTELEQUIA_PORT}/up" "entelequia-be"

  start_chatbot
  wait_http "http://127.0.0.1:${CHATBOT_PORT}/health" "chatbot" 90
  wait_service_stable "$CHATBOT_PID_FILE" "http://127.0.0.1:${CHATBOT_PORT}/health" "chatbot"

  start_fe
  wait_http "http://127.0.0.1:${FE_PORT}/" "fe" 90
  wait_service_stable "$FE_PID_FILE" "http://127.0.0.1:${FE_PORT}/" "fe"

  UP_IN_PROGRESS=0
  trap - EXIT INT TERM
  print_summary
}

command_down() {
  ensure_runtime_dir
  stop_all
  log_info "All managed services stopped."
}

command_status() {
  ensure_runtime_dir
  validate_widget_csp_matches_webhook "readonly" >/dev/null 2>&1 || true
  service_status "chatbot" "$CHATBOT_PID_FILE" "http://127.0.0.1:${CHATBOT_PORT}/health" "$CHATBOT_PORT"
  local chatbot_node_env
  chatbot_node_env="$(resolve_chatbot_node_env)"
  if [ -n "$chatbot_node_env" ]; then
    printf 'chatbot runtime mode: NODE_ENV=%s\n' "$chatbot_node_env"
  fi
  printf 'chatbot widget csp: %s\n' "$WIDGET_CSP_STATUS"
  if [ -n "$WIDGET_CSP_NOTE" ]; then
    printf 'chatbot widget csp note: %s\n' "$WIDGET_CSP_NOTE"
  fi
  service_status "entelequia-be" "$ENTELEQUIA_BE_PID_FILE" "http://127.0.0.1:${ENTELEQUIA_PORT}/up" "$ENTELEQUIA_PORT"
  service_status "fe" "$FE_PID_FILE" "http://127.0.0.1:${FE_PORT}/" "$FE_PORT"

  local chatbot_pid
  chatbot_pid="$(cat "$CHATBOT_PID_FILE" 2>/dev/null || true)"
  if [ -z "$chatbot_pid" ] || ! pid_is_running "$chatbot_pid"; then
    printf '\nLast chatbot log lines (%s):\n' "$CHATBOT_LOG"
    tail -n 50 "$CHATBOT_LOG" || true
  fi
}

command_logs() {
  ensure_runtime_dir
  case "$LOG_TARGET" in
    all)
      tail -n 100 -f "$ENTELEQUIA_BE_LOG" "$CHATBOT_LOG" "$FE_LOG"
      ;;
    entelequia|entelequia-be|telekia)
      tail -n 100 -f "$ENTELEQUIA_BE_LOG"
      ;;
    chatbot)
      tail -n 100 -f "$CHATBOT_LOG"
      ;;
    fe)
      tail -n 100 -f "$FE_LOG"
      ;;
    *)
      log_error "Unknown log target: $LOG_TARGET"
      usage
      exit 1
      ;;
  esac
}

case "$CMD" in
  up)
    command_up
    ;;
  down)
    command_down
    ;;
  status)
    command_status
    ;;
  logs)
    command_logs
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    log_error "Unknown command: $CMD"
    usage
    exit 1
    ;;
esac
