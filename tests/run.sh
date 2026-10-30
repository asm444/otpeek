#!/usr/bin/env bash
# Roda as suites no Chrome headless servindo o projeto por HTTP local (ES modules nao carregam de file://).
set -euo pipefail
cd "$(dirname "$0")/.."
port=${PORT:-8765}
python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
srv=$!
trap 'kill $srv' EXIT
for _ in $(seq 50); do curl -s "http://127.0.0.1:$port/" >/dev/null && break; sleep 0.1; done
status=0
for suite in unit flow; do
  printf '<!doctype html><meta charset="utf-8"><script type="module" src="%s.js"></script>' "$suite" > "tests/$suite.html"
  out=$(google-chrome --headless=new --disable-gpu --no-first-run --user-data-dir="$(mktemp -d)" \
    --virtual-time-budget=10000 --dump-dom "http://127.0.0.1:$port/tests/$suite.html" 2>/dev/null \
    | sed -n '/<pre id="result">/,/<\/pre>/p' | sed 's/<[^>]*>//g; s/&gt;/>/g; s/&lt;/</g; s/&amp;/\&/g; s/&quot;/"/g')
  echo "== $suite"
  echo "$out"
  grep -q '^SUMMARY passed=[1-9][0-9]* failed=0$' <<<"$out" || status=1
done
exit $status
