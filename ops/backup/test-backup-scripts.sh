#!/usr/bin/env bash

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

mock_bin="${test_root}/bin"
mock_s3="${test_root}/s3"
output_dir="${test_root}/output"
mkdir -p "$mock_bin" "$mock_s3" "$output_dir"

cat > "${mock_bin}/supabase" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "2.116.0-test"
  exit 0
fi
file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--file" ]]; then
    file="$2"
    shift 2
  else
    shift
  fi
done
[[ -n "$file" ]]
printf '%s\n' '-- mock dump' 'select 1;' > "$file"
MOCK

cat > "${mock_bin}/psql" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"json_build_object"* ]]; then
  echo '{"contents":1296,"active_contents":1296,"content_history":6359,"app_config":1}'
else
  printf '%s\n' "$*" >> "${MOCK_PSQL_LOG:?}"
fi
MOCK

cat > "${mock_bin}/aws" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
args=("$@")
filtered=()
skip_next=false
for arg in "${args[@]}"; do
  if [[ "$skip_next" == true ]]; then
    skip_next=false
    continue
  fi
  if [[ "$arg" == "--endpoint-url" ]]; then
    skip_next=true
    continue
  fi
  filtered+=("$arg")
done
set -- "${filtered[@]}"

if [[ "$1" == "s3api" && "$2" == "list-objects-v2" ]]; then
  echo '{"Contents":[]}'
  exit 0
fi

if [[ "$1" == "s3" && "$2" == "cp" ]]; then
  source="$3"
  destination="$4"
  if [[ "$source" == s3://* ]]; then
    source="${MOCK_S3}/${source#s3://}"
  fi
  if [[ "$destination" == s3://* ]]; then
    destination="${MOCK_S3}/${destination#s3://}"
  fi
  mkdir -p "$(dirname "$destination")"
  cp "$source" "$destination"
  exit 0
fi

if [[ "$1" == "s3" && "$2" == "rm" ]]; then
  target="${MOCK_S3}/${3#s3://}"
  rm -f "$target"
  exit 0
fi

echo "Chiamata aws mock non prevista: $*" >&2
exit 1
MOCK

chmod +x "${mock_bin}/supabase" "${mock_bin}/psql" "${mock_bin}/aws"
export PATH="${mock_bin}:${PATH}"
export MOCK_S3="$mock_s3"
export MOCK_PSQL_LOG="${test_root}/psql.log"
export SUPABASE_DB_URL="postgresql://mock.invalid/postgres"
export SUPABASE_PROJECT_REF="test-project"

archive_path="$("${repo_root}/ops/backup/create-backup.sh" "$output_dir")"
[[ -s "$archive_path" ]]
[[ -s "${archive_path}.sha256" ]]
[[ -s "${archive_path%.tar.gz}.manifest.json" ]]

"${repo_root}/ops/backup/restore-backup.sh" verify "$archive_path" >/dev/null

export R2_ACCOUNT_ID="test-account"
export R2_BUCKET="test-bucket"
export AWS_ACCESS_KEY_ID="test-key"
export AWS_SECRET_ACCESS_KEY="test-secret"
export R2_PREFIX="programmazione-collettiva-test"
"${repo_root}/ops/backup/upload-r2.sh" "$archive_path"

remote_count="$(find "${mock_s3}/${R2_BUCKET}" -type f | wc -l | tr -d ' ')"
[[ "$remote_count" -ge 3 ]]

export TARGET_DB_URL="postgresql://restore.invalid/postgres"
export RESTORE_CONFIRMATION="RIPRISTINA_PROGRAMMAZIONE"
"${repo_root}/ops/backup/restore-backup.sh" restore "$archive_path" >/dev/null
grep -q -- '--single-transaction' "$MOCK_PSQL_LOG"
grep -q -- 'session_replication_role = replica' "$MOCK_PSQL_LOG"

echo "Test backup completati con successo."

