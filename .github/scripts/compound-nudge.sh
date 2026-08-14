#!/usr/bin/env bash
# Detects changes that are genuinely "merged but not compounded" - all
# tasks.md checkboxes checked, and untouched for >24h - rather than the
# blunt "any non-archived folder exists" count this replaced. A change
# still resolving open questions (0% or partial tasks) is not this
# problem; nudging about it daily is exactly the noise this script exists
# to remove (real incident: certificate-licensing sat blocked on real,
# undecided product questions and got the identical Slack ping every
# day it stayed open, 2026-08-14).
#
# Also dedupes across days: a change that qualifies gets nudged about
# once, recorded in $STATE_FILE, and skipped on every subsequent run
# until it's archived (at which point its record is dropped, so a
# reused change-id - unlikely but not impossible - starts fresh). Same
# "don't repeat an unchanged fact" fix already applied to agentic-qa.yml
# and context-gardener.yml for the identical over-notification pattern.
set -euo pipefail

STATE_FILE=".github/state/compound-nudge-sent.json"
mkdir -p "$(dirname "$STATE_FILE")"
[ -f "$STATE_FILE" ] || echo '{}' > "$STATE_FILE"

NOW_EPOCH=$(date +%s)
DAY_SECONDS=$((24 * 60 * 60))

newly_pending=()

if [ -d openspec/changes ]; then
  for dir in openspec/changes/*/; do
    name=$(basename "$dir")
    [ "$name" = "archive" ] && continue

    tasks_file="${dir}tasks.md"
    [ -f "$tasks_file" ] || continue

    total=$(grep -cE '^\s*-\s\[[ x]\]' "$tasks_file" || true)
    checked=$(grep -cE '^\s*-\s\[x\]' "$tasks_file" || true)

    # No tasks listed at all, or any unchecked task, means this change is
    # still legitimately in progress - not the "forgotten after merge"
    # case this check exists for.
    if [ "$total" -eq 0 ] || [ "$checked" -ne "$total" ]; then
      continue
    fi

    last_touched=$(git log -1 --format=%ct -- "$dir" 2>/dev/null || echo "$NOW_EPOCH")
    age=$((NOW_EPOCH - last_touched))
    if [ "$age" -lt "$DAY_SECONDS" ]; then
      continue
    fi

    already_sent=$(jq --arg name "$name" 'has($name)' "$STATE_FILE")
    if [ "$already_sent" = "true" ]; then
      continue
    fi

    newly_pending+=("$name")
  done
fi

# Drop state entries for changes that no longer exist (archived, or
# removed) so a later reuse of the same name starts fresh.
existing_names=$(find openspec/changes -maxdepth 1 -mindepth 1 -type d ! -name archive -exec basename {} \; 2>/dev/null | jq -R -s -c 'split("\n") | map(select(length > 0))')
jq --argjson existing "$existing_names" '
  to_entries | map(select(.key as $k | $existing | index($k))) | from_entries
' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

if [ ${#newly_pending[@]} -eq 0 ]; then
  echo "newly_pending=" >> "$GITHUB_OUTPUT"
  exit 0
fi

for name in "${newly_pending[@]}"; do
  jq --arg name "$name" '. + {($name): true}' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
done

joined=$(IFS=,; echo "${newly_pending[*]}")
echo "newly_pending=$joined" >> "$GITHUB_OUTPUT"
