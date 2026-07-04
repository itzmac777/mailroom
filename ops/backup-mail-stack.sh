#!/usr/bin/env sh
set -eu

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
DATA_DIR="${DATA_DIR:-./server/data}"
MAILU_ROOT="${MAILU_ROOT:-/mailu}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/mail-stack-$STAMP.tar.gz"

mkdir -p "$BACKUP_ROOT"
tar -czf "$DEST" "$DATA_DIR" "$MAILU_ROOT"

if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  gpg --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" "$DEST"
  rm "$DEST"
  echo "$DEST.gpg"
else
  echo "$DEST"
  echo "Set BACKUP_GPG_RECIPIENT to enable encryption."
fi

