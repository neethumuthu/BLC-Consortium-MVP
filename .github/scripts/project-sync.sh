#!/usr/bin/env bash
# Syncs a GitHub Project (v2) "Stage" field with the openspec change lifecycle.
#
# SCOPE (deliberate, decided 2026-07-31): only the five stages this workflow's
# own comment already describes automating — Propose, Apply, Verify, Compound,
# Done. The framework spec (AI-SDLC-Framework-Reference PDF, v1.0, §2/§6)
# documents a sixth stage, Align, fired by "tech lead approves the spec (the
# one human act)" — not any event this workflow triggers on. Align is left as
# a manual card move, out of scope for this script by design, not an
# oversight. Raise as an open design question in the PR (does the framework
# want a pull_request_review trigger for this, or is manual-only intended?)
# rather than guessing at a heuristic here.
#
# One consequence of that scoping: this script treats ANY push that modifies
# an existing (non-archived) change folder as -> Apply, same simplification
# project-sync.yml's own comment already makes ("change folder modified
# (spec agreed) -> Stage: Apply"). It cannot distinguish "still resolving
# open questions" from "tech-lead-approved, ready to implement" — by design,
# per the above.
#
# Convention (framework spec §6): the Project has custom fields Stage and
# Change-ID. Every tracking issue that becomes work gets its Change-ID field
# set to the change's id (openspec/changes/<change-id>/). This script looks
# up items by that field — NOT by issue-body text (an earlier draft assumed
# an issue-body "Change-ID: <id>" convention; the spec says otherwise).
#
# A PR implementing a change is assumed to open from a branch named
# "change/<id>" or "change/<id>/<anything>" (not specified by the framework
# doc — a choice made here; flag in the PR if a different convention is
# intended). Deliberately NOT "change/<id>-<anything>": tested against a
# real branch name and found genuinely ambiguous when the change-id itself
# contains hyphens (e.g. "change/test-id-2-implement" — no way to tell where
# the id ends and a hyphen-separated suffix begins). "/" as the suffix
# delimiter avoids that; still just an invented convention, not a documented
# one, and worth raising in the PR regardless.
#
# gh subcommand syntax verified against cli.github.com/manual
# (gh_project_item-edit, gh_project_item-list) on 2026-07-31 — not written
# from memory. The JSON-shape question below was ALSO verified against a real
# Project v2 board (2026-07-31, disposable scratch repo + throwaway board),
# and it's a good thing it was checked rather than assumed:
#   - `--field`/`--field-id` cannot be combined with `--format json` at all
#     (gh errors immediately: "cannot use --format with --field or
#     --field-id") — the original draft passed both together and would have
#     failed on every single invocation.
#   - `--format json` already includes every custom field automatically, no
#     --field needed. Each field's JSON key is its display name with ONLY
#     the first character lowercased (undocumented; confirmed empirically):
#     "Stage" -> "stage", "Change-ID" -> "change-ID".
#   - A field that has never been set on an item is OMITTED from the JSON
#     entirely, not present as null.
#
# CORRECTION (2026-08-06, confirmed live against a real run, not assumed):
# the 2026-07-31 verification above used the CLI version installed on the
# author's own machine, not the one actually pinned on GitHub's
# ubuntu-latest Actions runner. Those turned out to disagree on
# `item-edit`'s own supported flags — the runner's `gh` (whatever version
# ubuntu-latest carried as of this fix) rejected `--owner`/`--field`/
# `--value`/`--url` outright ("unknown flag: --owner"), leaving only the
# ID-based flags (`--id`, `--field-id`, `--project-id`,
# `--single-select-option-id`, etc.). Rewritten below to use ID-based
# addressing throughout specifically because it's the intersection that
# works on both, not a preference either way. Two more real gaps found
# along the way, in the same live-testing pass:
#   - `gh project item-list`'s `.content` object (needed for anything about
#     the linked issue itself) is silently omitted, not errored, when the
#     token lacks `repo` scope to read that issue's data — `project` scope
#     alone is only enough for the project board's own fields.
#   - Beyond `repo`, the token also needs `read:org` and `read:discussion` —
#     without them `gh project item-list`/`item-edit` fail outright ("unknown
#     owner type" resolving a login, or an explicit missing-scopes error).
#
# Requires: gh (authenticated via GH_TOKEN with project, repo, read:org, and
# read:discussion scopes — a project-scoped-only PAT fails both the item
# lookup and the edit, confirmed live, not a hypothetical), jq, and git
# history covering the push's before..after range (see fetch-depth note in
# project-sync.yml).
#
# Usage: project-sync.sh <project-number> <event-name>

set -euo pipefail

readonly PROJECT_NUMBER="$1"
readonly EVENT_NAME="$2"
readonly REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY not set}"
# Assumes the Project's owner is the same login as the repo's — true for the
# "one Project per team" model in the framework spec, but undeclared
# anywhere else; project-sync.yml has no separate PROJECT_OWNER input.
readonly OWNER="${REPO%%/*}"

# --- Constants ---------------------------------------------------------------

readonly STAGE_PROPOSE="Propose"
readonly STAGE_APPLY="Apply"
readonly STAGE_VERIFY="Verify"
readonly STAGE_COMPOUND="Compound"
readonly STAGE_DONE="Done"

readonly FIELD_STAGE="Stage"
readonly FIELD_CHANGE_ID="Change-ID"
# gh's JSON key for a custom field = its display name with only the first
# character lowercased (undocumented, confirmed against a real board).
readonly FIELD_CHANGE_ID_JSON_KEY="change-ID"

readonly CHANGES_DIR="openspec/changes"
readonly ARCHIVE_DIR="${CHANGES_DIR}/archive"
readonly BRANCH_PREFIX="change/"

readonly ITEM_LIST_LIMIT=200

# --- One-time lookups: project node ID, Stage field ID, and its option
# name->ID map. Fetched once per script run and cached in globals rather than
# per set_stage call - these don't change within a single push/PR event, and
# item-edit's ID-based mode needs all three regardless of which item it's
# targeting.

PROJECT_ID=""
STAGE_FIELD_ID=""
declare -A STAGE_OPTION_ID   # stage display name -> single-select option ID

load_project_metadata() {
  PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.id')

  local fields_json
  fields_json=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json)
  STAGE_FIELD_ID=$(echo "$fields_json" | jq -r --arg name "$FIELD_STAGE" '.fields[] | select(.name == $name) | .id')
  if [ -z "$STAGE_FIELD_ID" ]; then
    echo "::error::Could not find a '${FIELD_STAGE}' field on project ${PROJECT_NUMBER}" >&2
    exit 1
  fi

  while IFS=$'\t' read -r opt_name opt_id; do
    STAGE_OPTION_ID["$opt_name"]="$opt_id"
  done < <(echo "$fields_json" | jq -r --arg name "$FIELD_STAGE" \
    '.fields[] | select(.name == $name) | .options[] | [.name, .id] | @tsv')
}

# --- Locate the Project item behind a change-id, then move its Stage ------

find_item_id_for_change() {
  local change_id="$1" id
  # No --field flag here: it cannot be combined with --format json (gh
  # errors), and isn't needed anyway — --format json already includes every
  # custom field. gh's own --jq flag also doesn't accept jq's --arg, so we
  # pipe to a real jq invocation instead to safely parameterize the value.
  # .id (the item's own node ID) is used, not .content.url - item-edit's
  # ID-based mode is the only mode that works on the Actions runner's gh
  # version (see header note), and it addresses the item by ID, not URL.
  id=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" \
    --format json --limit "$ITEM_LIST_LIMIT" \
    | jq -r --arg cid "$change_id" --arg key "$FIELD_CHANGE_ID_JSON_KEY" \
      '.items[] | select(.[$key] == $cid) | .id // empty' \
    | head -n1)  # assumes at most one item per Change-ID; picks one arbitrarily if that's violated, no warning
  if [ -z "$id" ]; then
    echo "::warning::No Project item found with Change-ID '${change_id}'" >&2
    return 1
  fi
  echo "$id"
}

set_stage() {
  local change_id="$1" stage="$2" item_id option_id
  item_id=$(find_item_id_for_change "$change_id") || return 0

  option_id="${STAGE_OPTION_ID[$stage]:-}"
  if [ -z "$option_id" ]; then
    echo "::error::No option ID found for Stage value '${stage}' - check the option still exists on the board" >&2
    return 1
  fi

  gh project item-edit --id "$item_id" --project-id "$PROJECT_ID" \
    --field-id "$STAGE_FIELD_ID" --single-select-option-id "$option_id"
  echo "Set '${change_id}' -> Stage: ${stage}"
}

# --- Event handling ------------------------------------------------------------

# push: distinguishes created (Propose) / modified (Apply, see scope note
# above) / archived (Done). Asks git directly whether each touched change's
# folder existed at $before / exists archived at $after, rather than
# inferring from per-line diff statuses — correctly handles a file being
# added to an ALREADY-EXISTING change in the same push (still Apply, not
# mistaken for a new Propose).
handle_push() {
  local before after changed ids id existed_before existed_archived_after
  before=$(jq -r '.before' "$GITHUB_EVENT_PATH")
  after=$(jq -r '.after' "$GITHUB_EVENT_PATH")
  # No -M (rename detection): classification below is purely path-based via
  # git ls-tree, not per-line status codes, so rename detection has no effect
  # here — an earlier version needed it, this one doesn't.
  changed=$(git diff --name-status "$before" "$after" -- "$CHANGES_DIR" 2>/dev/null || true)
  [ -z "$changed" ] && return 0

  ids=$(echo "$changed" | awk '{print $NF}' \
    | sed -E "s#^${CHANGES_DIR}/(archive/)?([^/]+)/.*#\\2#" \
    | sort -u)

  for id in $ids; do
    [ -z "$id" ] && continue
    existed_before=$(git ls-tree -d --name-only "$before" -- "${CHANGES_DIR}/${id}" 2>/dev/null || true)
    existed_archived_after=$(git ls-tree -d --name-only "$after" -- "${ARCHIVE_DIR}/${id}" 2>/dev/null || true)

    if [ -n "$existed_archived_after" ]; then
      set_stage "$id" "$STAGE_DONE"
    elif [ -z "$existed_before" ]; then
      set_stage "$id" "$STAGE_PROPOSE"
    else
      set_stage "$id" "$STAGE_APPLY"
    fi
  done
}

# pull_request: opened -> Verify, closed+merged -> Compound.
handle_pull_request() {
  local action merged branch change_id
  action=$(jq -r '.action' "$GITHUB_EVENT_PATH")
  merged=$(jq -r '.pull_request.merged' "$GITHUB_EVENT_PATH")
  branch=$(jq -r '.pull_request.head.ref' "$GITHUB_EVENT_PATH")

  # "/" delimits an optional suffix from the id — NOT "-", which is
  # ambiguous when the id itself contains hyphens (see header note).
  change_id=$(echo "$branch" | sed -nE "s#^${BRANCH_PREFIX}([^/]+).*#\\1#p")
  if [ -z "$change_id" ]; then
    echo "::warning::PR branch '${branch}' doesn't match the ${BRANCH_PREFIX}<id> convention, skipping" >&2
    return 0
  fi

  case "$action" in
    opened) set_stage "$change_id" "$STAGE_VERIFY" ;;
    closed)
      # NOT `[ "$merged" = "true" ] && set_stage ...` — under `set -e`, a
      # bare "cond && cmd" statement whose cond is false exits the WHOLE
      # script with that failure status. Confirmed: a closed-without-merging
      # PR (a normal, common event) crashed the entire script until fixed.
      if [ "$merged" = "true" ]; then
        set_stage "$change_id" "$STAGE_COMPOUND"
      fi
      ;;
  esac
}

case "$EVENT_NAME" in
  push) load_project_metadata; handle_push ;;
  pull_request) load_project_metadata; handle_pull_request ;;
  schedule) : ;; # no Stage transition here; compound-nudge is project-sync.yml's own separate step
  *) echo "::warning::Unhandled event_name '${EVENT_NAME}'" >&2 ;;
esac
