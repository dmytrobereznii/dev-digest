#!/usr/bin/env bash
# PreToolUse(Bash) gate for the `pr-self-review` skill.
#
# Refuses `gh pr create` / `gh pr merge` / `gh pr ready` unless a fresh,
# passing verdict exists for the current working tree. It never reviews
# anything — a hook cannot invoke the model. It checks for the artifact the
# skill leaves in .git/pr-self-review/ and explains what to run.
#
# Exit 0 = allow. Exit 2 = block, stderr goes back to Claude as feedback.
# Anything it cannot determine, it allows: this guards PRs, not the shell.

set -uo pipefail

allow() { exit 0; }
block() { printf '%s\n' "$1" >&2; exit 2; }

payload=$(cat)

# --- does this command open or merge a PR? -------------------------------
if command -v jq >/dev/null 2>&1; then
  command_line=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')
else
  command_line=$payload           # coarse match; a false positive only costs a message
fi

# Anchored to a command position — start of line, or after a separator — so a
# command that merely mentions the phrase (an echo, a grep, this file's own
# tests) is not mistaken for one that opens a PR.
printf '%s' "$command_line" \
  | grep -Eq '(^|[;&|]|\$\()[[:space:]]*gh[[:space:]]+pr[[:space:]]+(create|merge|ready)([[:space:]]|$)' \
  || allow

cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || allow
git rev-parse --git-dir >/dev/null 2>&1 || allow
base=$(git merge-base origin/main HEAD 2>/dev/null) || allow
[ -n "$base" ] || allow

command -v jq >/dev/null 2>&1 \
  || block "pr-self-review: jq is required to read the review verdict. Install it (brew install jq), or run the gh command yourself."

# --- the key: HEAD, plus everything uncommitted --------------------------
tree_state() {
  git diff HEAD
  git status --porcelain -uall
  git ls-files --others --exclude-standard -z \
    | while IFS= read -r -d '' f; do shasum -a 256 "$f"; done
}
key="$(git rev-parse HEAD)-$(tree_state | shasum -a 256 | cut -c1-12)"
verdict_file=".git/pr-self-review/${key}.json"

run_it="Run /pr-self-review, then retry this command."

[ -f "$verdict_file" ] || block \
"pr-self-review: no review for this working tree.

The tree changed (or was never reviewed) since the last verdict, so nothing
vouches for what this PR would contain. $run_it"

reviewed_base=$(jq -r '.base // ""' "$verdict_file")
if [ -n "$reviewed_base" ] && [ "$reviewed_base" != "$base" ]; then
  block "pr-self-review: the review covered base ${reviewed_base:0:7}, the branch now forks from ${base:0:7} — it was rebased or merged since. $run_it"
fi

verdict=$(jq -r '.verdict // "missing"' "$verdict_file")
[ "$verdict" = "request_changes" ] || allow

criticals=$(jq -r '
  [.findings[]? | select(.severity == "CRITICAL")]
  | if length == 0 then "  (none recorded)"
    else map("  - \(.file):\(.line // 0) — \(.rule // "unnamed rule")") | join("\n")
    end' "$verdict_file")

block "pr-self-review: blocked — $(jq -r '.counts.critical // 0' "$verdict_file") CRITICAL finding(s) stand.

$criticals

Fix them, re-run /pr-self-review, then retry. Do not hand-write a verdict file
to get past this."
