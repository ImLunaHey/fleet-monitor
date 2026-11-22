#!/usr/bin/env bash
# Optional user-session bootstrap; nix-darwin is preferred for declarative setups.
set -euo pipefail
name=${1:?machine name}
address=${2:?private bind address}
interface=${3:?network interface}
binary=${4:?built fleet-monitor binary}
clients=${5:-127.0.0.1,::1}
mkdir -p "$HOME/.local/bin" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
install -m 0755 "$binary" "$HOME/.local/bin/fleet-monitor"
plist="$HOME/Library/LaunchAgents/org.fleet-monitor.agent.plist"
rm -f "$plist"
plutil -create xml1 "$plist"
plutil -insert Label -string org.fleet-monitor.agent "$plist"
plutil -insert ProgramArguments -json "[]" "$plist"
plutil -insert ProgramArguments.0 -string "$HOME/.local/bin/fleet-monitor" "$plist"
plutil -insert EnvironmentVariables -json "{}" "$plist"
plutil -insert EnvironmentVariables.METRICS_NAME -string "$name" "$plist"
plutil -insert EnvironmentVariables.METRICS_BIND -string "$address" "$plist"
plutil -insert EnvironmentVariables.METRICS_INTERFACE -string "$interface" "$plist"
plutil -insert EnvironmentVariables.METRICS_ALLOWED_CLIENTS -string "$clients" "$plist"
plutil -insert RunAtLoad -bool YES "$plist"
plutil -insert KeepAlive -bool YES "$plist"
plutil -insert ThrottleInterval -integer 5 "$plist"
plutil -insert StandardErrorPath -string "$HOME/Library/Logs/fleet-monitor.log" "$plist"
plutil -lint "$plist"
launchctl bootout "gui/$(id -u)/org.fleet-monitor.agent" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
