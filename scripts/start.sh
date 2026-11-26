#!/usr/bin/env bash
# Start the Sotaq dev server.
#
#   ./scripts/start.sh            Open the app in the browser
#   ./scripts/start.sh web
#   ./scripts/start.sh android    Open it on an emulator or a USB phone
#   ./scripts/start.sh dev        QR code for Expo Go, then press w or a

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [[ -d "$ANDROID_HOME/platform-tools" ]]; then
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
fi

usage() {
  cat <<'EOF'
Usage: ./scripts/start.sh [web|android|dev]

  web       Start the app in the browser (default)
  android   Start the app on an Android emulator or a USB phone
  dev       Start the dev server and show a QR code
EOF
}

command="${1:-web}"

case "$command" in
  web)
    echo "Starting Sotaq in the browser."
    npx expo start --web
    ;;
  android)
    echo "Starting Sotaq on Android."
    npx expo start --android
    ;;
  dev)
    echo "Starting the dev server. Press w for web or a for Android."
    npx expo start
    ;;
  -h | --help | help)
    usage
    ;;
  *)
    echo "Unknown command: $command"
    usage
    exit 1
    ;;
esac
