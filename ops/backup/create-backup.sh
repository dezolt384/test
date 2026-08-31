#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Comando richiesto non disponibile: $1" >&2
    exit 1
  fi
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

: "${SUPABASE_DB_URL:?Impostare SUPABASE_DB_URL con la Session pooler connection string}"

require_command supabase
require_command psql
require_command jq
require_command tar

output_root="${1:-${PWD}/.backup-work}"
project_ref="${SUPABASE_PROJECT_REF:-unknown}"
timestamp="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
backup_name="programmazione-collettiva-${timestamp}"
backup_dir="${output_root}/${backup_name}"
archive_path="${output_root}/${backup_name}.backup.tar.gz"
manifest_path="${output_root}/${backup_name}.backup.manifest.json"
checksum_path="${archive_path}.sha256"

mkdir -p "$backup_dir"

echo "Esportazione ruoli..." >&2
supabase db dump \
  --db-url "$SUPABASE_DB_URL" \
  --file "${backup_dir}/roles.sql" \
  --role-only >&2

echo "Esportazione struttura..." >&2
supabase db dump \
  --db-url "$SUPABASE_DB_URL" \
  --file "${backup_dir}/schema.sql" >&2

echo "Esportazione dati..." >&2
supabase db dump \
  --db-url "$SUPABASE_DB_URL" \
  --file "${backup_dir}/data.sql" \
  --use-copy \
  --data-only \
  --exclude "storage.buckets_vectors" \
  --exclude "storage.vector_indexes" >&2

for dump_file in roles.sql schema.sql data.sql; do
  if [[ ! -s "${backup_dir}/${dump_file}" ]]; then
    echo "Backup non valido: ${dump_file} e' vuoto" >&2
    exit 1
  fi
done

counts_json="$(psql "$SUPABASE_DB_URL" \
  --no-psqlrc \
  --set=ON_ERROR_STOP=1 \
  --tuples-only \
  --no-align \
  --command="
    select json_build_object(
      'contents', (select count(*) from public.contents),
      'active_contents', (select count(*) from public.contents where deleted_at is null),
      'content_history', (select count(*) from public.content_history),
      'app_config', (select count(*) from public.app_config)
    )::text;
  ")"

if ! jq -e '
  (.contents | numbers) >= 1 and
  (.active_contents | numbers) >= 1 and
  (.content_history | numbers) >= 1 and
  (.app_config | numbers) >= 1
' >/dev/null <<<"$counts_json"; then
  echo "Backup bloccato: conteggi applicativi inattesi: ${counts_json}" >&2
  exit 1
fi

jq -n \
  --arg generated_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --arg project_ref "$project_ref" \
  --arg cli_version "$(supabase --version)" \
  --arg backup_name "$backup_name" \
  --argjson row_counts "$counts_json" \
  '{
    format_version: 1,
    generated_at: $generated_at,
    project_ref: $project_ref,
    backup_name: $backup_name,
    supabase_cli_version: $cli_version,
    row_counts: $row_counts,
    files: ["roles.sql", "schema.sql", "data.sql"]
  }' > "${backup_dir}/manifest.json"

cp "${backup_dir}/manifest.json" "$manifest_path"
tar -C "$output_root" -czf "$archive_path" "$backup_name"
tar -tzf "$archive_path" >/dev/null

archive_hash="$(hash_file "$archive_path")"
printf '%s  %s\n' "$archive_hash" "$(basename "$archive_path")" > "$checksum_path"

echo "$archive_path"
