#!/bin/sh
# Stop hook: show a macOS notification when Claude finishes a turn.
# Does nothing on systems without osascript, and never blocks Claude.
command -v osascript >/dev/null 2>&1 || exit 0
osascript -e 'display notification "Claude finished. Your turn." with title "Claude Code: lunch-app" sound name "Glass"' >/dev/null 2>&1
exit 0
