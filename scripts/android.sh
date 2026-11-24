#!/usr/bin/env bash
# Install Sotaq on an Android phone.
#
#   ./scripts/android.sh device   Debug build over USB and launch it
#   ./scripts/android.sh apk      Cloud APK you can install from the phone
#   ./scripts/android.sh go       Expo Go QR code, no APK

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

usage() {
  cat <<'EOF'
Usage: ./scripts/android.sh <command>

  device   Build a debug app and install it on the USB-connected phone
  apk      Build an installable APK in the Expo cloud
  go       Start the dev server and show a QR code for Expo Go
EOF
}

require_android_sdk() {
  if [[ ! -x "$ANDROID_HOME/platform-tools/adb" ]]; then
    echo "adb was not found at $ANDROID_HOME/platform-tools/adb"
    echo "Install Android Studio, or set ANDROID_HOME to your SDK path."
    exit 1
  fi
}

# Prints one serial per authorized phone.
list_phones() {
  adb devices | awk 'NR > 1 && $2 == "device" { print $1 }'
}

require_phone() {
  require_android_sdk

  if adb devices | awk 'NR > 1 && $2 == "unauthorized" { found = 1 } END { exit !found }'; then
    echo "The phone is connected, but USB debugging is not allowed yet."
    echo "Unlock the phone and accept the \"Allow USB debugging\" prompt."
    exit 1
  fi

  local phones=()
  local serial
  while IFS= read -r serial; do
    [[ -n "$serial" ]] && phones+=("$serial")
  done < <(list_phones)

  if [[ ${#phones[@]} -eq 0 ]]; then
    echo "No phone found."
    echo "On the phone: Settings → Developer options → USB debugging, then plug in the cable."
    exit 1
  fi

  if [[ ${#phones[@]} -gt 1 ]]; then
    echo "More than one device is connected:"
    printf '  %s\n' "${phones[@]}"
    echo "Unplug the extras, or run: npx expo run:android --device"
    exit 1
  fi

  export ANDROID_SERIAL="${phones[0]}"
  echo "Using phone $ANDROID_SERIAL"
}

ensure_eas_json() {
  if [[ -f eas.json ]]; then
    return
  fi

  cat > eas.json <<'EOF'
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
EOF
  echo "Created eas.json with an installable preview APK profile."
}

cmd_device() {
  require_phone
  npx expo run:android --device "$ANDROID_SERIAL"
  echo
  echo "Installed. The debug APK is at android/app/build/outputs/apk/debug/app-debug.apk"
}

cmd_apk() {
  ensure_eas_json

  if ! npx --yes eas-cli@latest whoami >/dev/null 2>&1; then
    echo "Log in to your Expo account. The first time you can create a free one."
    npx --yes eas-cli@latest login
  fi

  echo "Building an APK in the cloud. On the keystore question, answer Yes."
  npx --yes eas-cli@latest build --platform android --profile preview
  echo
  echo "Open the build link on the phone, download the APK, and install it."
  echo "If Android blocks the install, allow installs from that browser."
}

cmd_go() {
  echo "Install Expo Go on the phone, join the same Wi-Fi, then scan the QR code."
  npx expo start
}

command="${1:-}"

case "$command" in
  device) cmd_device ;;
  apk) cmd_apk ;;
  go) cmd_go ;;
  -h | --help | help | "")
    usage
    [[ -n "$command" ]] || exit 1
    ;;
  *)
    echo "Unknown command: $command"
    usage
    exit 1
    ;;
esac
