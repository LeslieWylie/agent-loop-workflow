#!/usr/bin/env bash
#
# Scan every tracked file for identifiers that must not be published, and
# prove the scanner works before trusting its verdict.
#
#   bash tools/scan-tree.sh
#
# Exit 0 = clean, 1 = something found (or the scanner is broken).
#
# This runs in CI, but it is a plain script on purpose: a check that can only
# be exercised by pushing is a check nobody verifies before pushing.
#
# Why this exists in addition to the guard inside tests/host.test.mjs: that one
# inspects the skill payload the plugin *emits*. The leak that prompted all of
# this lived in a test file, which the payload guard cannot see. This scans the
# whole tree instead.

set -uo pipefail

# Boundaries are spelled out rather than using \b. Neither POSIX ERE nor
# `git grep -E` implements \b, so a pattern using it matches nothing — silently.
# The first version of these rules was written that way and reported a clean
# tree while matching none of its own samples.
B='(^|[^A-Za-z0-9_])'
E='([^A-Za-z0-9_]|$)'

# Placeholders that are *supposed* to appear. Scrubbed from a line before the
# rule is re-applied, so a line carrying both a placeholder and a real address
# is still reported. An earlier version applied this to the "rule<TAB>path:line"
# summary, by which point the matched text had already been replaced by a line
# number — so it could never match anything, and the exemption was dead code.
EXEMPT='[A-Za-z0-9._%+-]+@(example\.(com|org|net)|users\.noreply\.github\.com)'

rules() {
  cat <<RULES
corporate-hostname|${B}([a-z0-9-]+\.)+(internal|corp|intra|lan)${E}
named-secret-constant|${B}[A-Z][A-Z0-9]{2,}_(API_)?(KEY|TOKEN|SECRET)${E}
credential-blob|(-----BEGIN [A-Z ]*PRIVATE KEY-----|${B}(sk|ghp|gho|glpat)-[A-Za-z0-9_-]{16,})
credential-in-url|${B}[a-z][a-z0-9+.-]*://[^/[:space:]:@]+:[^/[:space:]@]+@
non-placeholder-email|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
RULES
}

# scan <file-of-NUL-separated-paths> -> lines of "rule<TAB>path:line"
# Never prints the matched text, only where it is.
scan() {
  local list="$1" label re
  while IFS='|' read -r label re; do
    [ -n "$label" ] || continue
    # `-H` because grep omits the filename when handed exactly one file, and the
    # self-test below hands it exactly one. Without it the location/content
    # split is computed against a line that carries no location, so the
    # self-test checks a mangled result — it still saw the rule label and
    # passed, while reporting nonsense positions.
    #
    # `xargs -a FILE` is GNU-only; the redirect form is portable.
    # `|| true` because grep exits 1 on no-match, which is the normal case here
    # and must not abort the loop under `bash -e`.
    xargs -0 grep -IHnE "$re" < "$list" 2>/dev/null \
      | awk -v re="$re" -v ex="$EXEMPT" -v label="$label" '
          {
            # Split "path:line:content" by position, not by field, so colons
            # inside the content stay inside the content.
            if (match($0, /^[^:]+:[0-9]+:/) == 0) next
            location = substr($0, 1, RLENGTH - 1)
            content  = substr($0, RLENGTH + 1)
            gsub(ex, "", content)
            if (content ~ re) print label "\t" location
          }' || true
  done < <(rules)
}

# --- self-test ---------------------------------------------------------------
# A scanner that matches nothing produces output identical to a clean tree.
# Plant one sample per rule and require every rule to fire.

canary="$(mktemp -d)"
trap 'rm -rf "$canary"' EXIT
{
  printf 'host build-07.corp\n'
  printf 'read ACME_API_KEY here\n'
  printf 'token glpat-ABCDEFGHIJKLMNOPQRSTUV\n'
  printf 'clone https://user:pw@git.somewhere.org/r.git\n'
  printf 'mail someone@somecorp.not-a-placeholder.net\n'
} > "$canary/planted.txt"
printf '%s\0' "$canary/planted.txt" > "$canary/list"

# Capture once, then match against the captured text. Piping into `grep -q`
# makes grep exit at the first hit, which SIGPIPEs `sed` upstream; under
# `pipefail` that reads as a failed rule on GNU sed but not on BSD sed, so it
# passes locally and fails in CI.
planted="$(scan "$canary/list")"
missed=0
while IFS='|' read -r label _; do
  [ -n "$label" ] || continue
  if ! grep -q "^${label}" <<<"$planted"; then
    echo "::error::scanner rule '${label}' failed to match its own planted sample"
    missed=1
  fi
done < <(rules)

# The exemption fails in the other direction: if it stops working, CI fails on
# legitimate placeholder addresses until someone gives up and deletes the rule.
# So it gets a canary of its own, which must produce nothing.
printf 'contact test@example.com or ci@users.noreply.github.com\n' > "$canary/ok.txt"
printf '%s\0' "$canary/ok.txt" > "$canary/oklist"
if [ -n "$(scan "$canary/oklist")" ]; then
  echo "::error::placeholder addresses are being reported; the exemption is not working"
  missed=1
fi

[ "$missed" -eq 0 ] || {
  echo "the scanner is broken; its verdict on the real tree means nothing"
  exit 1
}
echo "scanner self-test: every rule fires, placeholders stay exempt"

# --- the real scan -----------------------------------------------------------
# This script is excluded because it necessarily contains the patterns.
# Nothing else is excluded: no carve-out for tests/, which is where the
# original leak lived. The suite assembles its sample strings from fragments
# instead, so the tree stays literally clean.

tracked="$canary/tracked"
git ls-files -z ':!tools/scan-tree.sh' > "$tracked"

# The placeholder exemption is applied inside scan(), against the matched line
# itself. Applying it here would be too late: by this point every match has been
# reduced to a path and a line number.
hits="$(scan "$tracked")"

if [ -n "$hits" ]; then
  echo "::error::identifiers found in tracked files"
  echo "$hits"
  exit 1
fi
echo "tree is clean"
