#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

usage() {
  cat >&2 <<'EOF'
Uso:
  restore-backup.sh verify FILE.backup.tar.gz
  restore-backup.sh restore FILE.backup.tar.gz

Per il ripristino servono inoltre:
  TARGET_DB_URL=<Session pooler del database VUOTO di destinazione>
  RESTORE_CONFIRMATION=RIPRISTINA_PROGRAMMAZIONE
EOF
  exit 2
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

mode="${1:-}"
archive_path="${2:-}"
[[ "$mode" == "verify" || "$mode" == "restore" ]] || usage
[[ -n "$archive_path" && -s "$archive_path" ]] || usage

if ! command -v jq >/dev/null 2>&1; then
  echo "Comando richiesto non disponibile: jq" >&2
  exit 1
fi

checksum_path="${archive_path}.sha256"
if [[ ! -s "$checksum_path" ]]; then
  echo "Manca il file checksum: ${checksum_path}" >&2
  exit 1
fi

expected_hash="$(awk 'NR == 1 {print $1}' "$checksum_path")"
actual_hash="$(hash_file "$archive_path")"
if [[ "$expected_hash" != "$actual_hash" ]]; then
  echo "Checksum non valido: il backup e' incompleto o alterato" >&2
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

if tar -tzf "$archive_path" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Archivio non valido: contiene percorsi non sicuri" >&2
  exit 1
fi
tar -xzf "$archive_path" -C "$work_dir"

backup_dir="$(find "$work_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
for required_file in roles.sql schema.sql data.sql manifest.json; do
  if [[ ! -s "${backup_dir}/${required_file}" ]]; then
    echo "Backup incompleto: manca ${required_file}" >&2
    exit 1
  fi
done

echo "Backup integro." >&2
jq '.' "${backup_dir}/manifest.json"

if [[ "$mode" == "verify" ]]; then
  exit 0
fi

: "${TARGET_DB_URL:?Impostare TARGET_DB_URL verso un database vuoto di destinazione}"
if [[ "${RESTORE_CONFIRMATION:-}" != "RIPRISTINA_PROGRAMMAZIONE" ]]; then
  echo "Ripristino bloccato. Impostare RESTORE_CONFIRMATION=RIPRISTINA_PROGRAMMAZIONE." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Comando richiesto non disponibile: psql" >&2
  exit 1
fi

echo "Ripristino su database di destinazione. Il database deve essere vuoto." >&2
psql "$TARGET_DB_URL" \
  --no-psqlrc \
  --single-transaction \
  --set=ON_ERROR_STOP=1 \
  --command='ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated' \
  --file "${backup_dir}/roles.sql" \
  --file "${backup_dir}/schema.sql" \
  --command='SET session_replication_role = replica' \
  --file "${backup_dir}/data.sql"

echo "Ripristino completato. Verificare conteggi e accesso applicativo prima dell'uso." >&2
