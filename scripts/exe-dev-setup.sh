#!/bin/bash
# exe.dev bootstrap for Arc studio (:5188) and/or MCP server (:5190)
# Modes: all (default) | studio | server
set -euo pipefail

APP_DIR=/home/exedev/arc
BUN=/home/exedev/.bun/bin/bun
STUDIO_PORT=5188
MCP_PORT=5190
SETUP_MODE="${ARC_SETUP_MODE:-all}"
PUBLIC_HOST="${ARC_PUBLIC_HOST:-arc-studio.exe.xyz}"
EDITOR_URL="${ARC_EDITOR_URL:-https://arc-studio.exe.xyz}"

export PATH="/home/exedev/.bun/bin:/usr/local/bin:/usr/bin:/bin"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

if [ ! -x "$BUN" ]; then
  curl -fsSL https://bun.sh/install | bash
fi

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --depth 1 https://github.com/hudsonkit/arc.git "$APP_DIR"
fi

cd "$APP_DIR"
git pull --ff-only || true
"$BUN" install
"$BUN" run build:lib
if [ "$SETUP_MODE" != "server" ]; then
  "$BUN" run build
fi
"$BUN" run build:mcp

install_studio=false
install_mcp=false
case "$SETUP_MODE" in
  all) install_studio=true; install_mcp=true ;;
  studio) install_studio=true ;;
  server) install_mcp=true ;;
  *) echo "Unknown ARC_SETUP_MODE=$SETUP_MODE (use all|studio|server)" >&2; exit 1 ;;
esac

if $install_studio; then
$SUDO tee /etc/systemd/system/arc-studio.service >/dev/null <<EOF
[Unit]
Description=Arc Studio
After=network.target

[Service]
Type=simple
User=exedev
WorkingDirectory=$APP_DIR
Environment=PATH=/home/exedev/.bun/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$BUN run preview -- --host 0.0.0.0 --port $STUDIO_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
fi

if $install_mcp; then
$SUDO tee /etc/systemd/system/arc-mcp.service >/dev/null <<EOF
[Unit]
Description=Arc MCP HTTP Server
After=network.target

[Service]
Type=simple
User=exedev
WorkingDirectory=$APP_DIR
Environment=PATH=/home/exedev/.bun/bin:/usr/local/bin:/usr/bin:/bin
Environment=ARC_MCP_PORT=$MCP_PORT
Environment=ARC_MCP_HOST=0.0.0.0
Environment=ARC_EDITOR_URL=$EDITOR_URL
ExecStart=$BUN run mcp:http
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
fi

$SUDO systemctl daemon-reload
if $install_studio; then
  $SUDO systemctl enable arc-studio
  $SUDO systemctl restart arc-studio
fi
if $install_mcp; then
  $SUDO systemctl enable arc-mcp
  $SUDO systemctl restart arc-mcp
fi

if $install_studio; then
  echo "Arc studio: http://127.0.0.1:${STUDIO_PORT}"
fi
if $install_mcp; then
  echo "Arc MCP:    http://127.0.0.1:${MCP_PORT}/mcp"
  echo "Editor URL: ${EDITOR_URL}"
fi

# Agent context (Shelley + harness AGENTS.md)
if [ -x "$APP_DIR/scripts/exe-dev-agents.sh" ]; then
  ARC_VM_ROLE="$SETUP_MODE" "$APP_DIR/scripts/exe-dev-agents.sh"
elif [ -f "$APP_DIR/scripts/exe-dev-agents.sh" ]; then
  chmod +x "$APP_DIR/scripts/exe-dev-agents.sh"
  ARC_VM_ROLE="$SETUP_MODE" "$APP_DIR/scripts/exe-dev-agents.sh"
fi
