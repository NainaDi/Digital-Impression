#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
find public src config -name '*.php' -print0 | xargs -0 -n1 php -l
