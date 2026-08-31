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

days_ago_iso() {
  local days="$1"
  if date -u -d "${days} days ago" +'%Y-%m-%dT%H:%M:%SZ' >/dev/null 2>&1; then
    date -u -d "${days} days ago" +'%Y-%m-%dT%H:%M:%SZ'
  else
    date -u -v-"${days}"d +'%Y-%m-%dT%H:%M:%SZ'
  fi
}

delete_older_than() {
  local remote_prefix="$1"
  local age_days="$2"
  local cutoff
  local keys

  cutoff="$(days_ago_iso "$age_days")"
  keys="$(aws --endpoint-url "$endpoint" s3api list-objects-v2 \
    --bucket "$R2_BUCKET" \
    --prefix "$remote_prefix" \
    --output json \
    | jq -r --arg cutoff "$cutoff" '.Contents[]? | select(.LastModified < $cutoff) | .Key')"

  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    echo "Elimino copia scaduta: ${key}" >&2
    aws --endpoint-url "$endpoint" s3 rm "s3://${R2_BUCKET}/${key}" --only-show-errors
  done <<< "$keys"
}

archive_path="${1:?Indicare il file .backup.tar.gz da caricare}"
checksum_path="${archive_path}.sha256"
manifest_path="${archive_path%.tar.gz}.manifest.json"

: "${R2_ACCOUNT_ID:?Impostare R2_ACCOUNT_ID}"
: "${R2_BUCKET:?Impostare R2_BUCKET}"
: "${AWS_ACCESS_KEY_ID:?Impostare AWS_ACCESS_KEY_ID}"
: "${AWS_SECRET_ACCESS_KEY:?Impostare AWS_SECRET_ACCESS_KEY}"

require_command aws
require_command jq

for local_file in "$archive_path" "$checksum_path" "$manifest_path"; do
  if [[ ! -s "$local_file" ]]; then
    echo "File di backup assente o vuoto: ${local_file}" >&2
    exit 1
  fi
done

endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
prefix="${R2_PREFIX:-programmazione-collettiva}"
year="$(date -u +'%Y')"
month="$(date -u +'%m')"
daily_prefix="${prefix}/daily/${year}/${month}"
archive_name="$(basename "$archive_path")"
remote_archive="${daily_prefix}/${archive_name}"

upload_file() {
  local local_file="$1"
  local remote_key="$2"
  aws --endpoint-url "$endpoint" s3 cp \
    "$local_file" "s3://${R2_BUCKET}/${remote_key}" \
    --only-show-errors
}

echo "Caricamento copia giornaliera su R2..." >&2
upload_file "$archive_path" "$remote_archive"
upload_file "$checksum_path" "${remote_archive}.sha256"
upload_file "$manifest_path" "${remote_archive%.tar.gz}.manifest.json"

monthly_prefix="${prefix}/monthly/${year}"
monthly_name="programmazione-collettiva-${year}-${month}.backup.tar.gz"
upload_file "$archive_path" "${monthly_prefix}/${monthly_name}"
upload_file "$checksum_path" "${monthly_prefix}/${monthly_name}.sha256"
upload_file "$manifest_path" "${monthly_prefix}/${monthly_name%.tar.gz}.manifest.json"

verify_dir="$(mktemp -d)"
trap 'rm -rf "$verify_dir"' EXIT
downloaded_archive="${verify_dir}/${archive_name}"
aws --endpoint-url "$endpoint" s3 cp \
  "s3://${R2_BUCKET}/${remote_archive}" "$downloaded_archive" \
  --only-show-errors

if [[ "$(hash_file "$archive_path")" != "$(hash_file "$downloaded_archive")" ]]; then
  echo "Verifica R2 fallita: la copia riletta non coincide con l'originale" >&2
  exit 1
fi

delete_older_than "${prefix}/daily/" 35
delete_older_than "${prefix}/monthly/" 400

echo "Backup verificato su R2: s3://${R2_BUCKET}/${remote_archive}" >&2
