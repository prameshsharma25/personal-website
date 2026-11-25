#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$PROJECT_ROOT"

# Use the installed macOS Command Line Tools without invoking the Xcode launcher.
if [ -x /Library/Developer/CommandLineTools/usr/bin/git ]; then
  exec /Library/Developer/CommandLineTools/usr/bin/git "$@"
fi
if command -v git >/dev/null 2>&1; then
  exec git "$@"
fi
printf '%s\n' 'Git is required. Install Git, then run this command again.' >&2
exit 1
