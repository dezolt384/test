# Backup automatico Programmazione Collettiva

Questa cartella contiene il sistema di backup del database Supabase. Il processo
gira su GitHub Actions e salva copie private in Cloudflare R2; non usa Worker,
Cron Trigger o Browser Run di Cloudflare e non interferisce con l'archivio degli
screenshot quotidiani su Amazon S3.

## Cosa viene salvato

Ogni esecuzione produce:

- `roles.sql`: ruoli e permessi esportabili;
- `schema.sql`: struttura applicativa del database;
- `data.sql`: dati completi in formato `COPY`;
- `manifest.json`: data, versione CLI e conteggi delle tabelle principali;
- archivio compresso e checksum SHA-256.

Il job rilegge l'archivio da R2 e confronta il checksum prima di dichiarare il
backup riuscito.

## Conservazione

- copie giornaliere: 35 giorni;
- copia mensile aggiornata a ogni esecuzione: 400 giorni;
- cancellazione automatica delle copie scadute;
- nessun file di backup viene conservato come GitHub Artifact.

## Secret GitHub richiesti

Configurare in `Settings > Secrets and variables > Actions`:

| Secret | Contenuto |
| --- | --- |
| `SUPABASE_DB_URL` | Session pooler connection string del progetto Supabase |
| `R2_ACCOUNT_ID` | ID account Cloudflare |
| `R2_ACCESS_KEY_ID` | chiave R2 limitata al bucket dei backup |
| `R2_SECRET_ACCESS_KEY` | segreto della chiave R2 |
| `R2_BUCKET` | nome del bucket R2 privato |
| `BACKUP_HEALTHCHECK_URL` | facoltativo, URL del controllo esterno |

Le credenziali R2 devono poter leggere, scrivere, elencare ed eliminare oggetti
soltanto nel bucket dedicato. Il bucket non deve avere dominio pubblico.

## Prima attivazione

1. Creare un bucket R2 Standard dedicato, per esempio
   `collettiva-programmazione-backup`.
2. Creare una chiave API R2 limitata a quel bucket.
3. Aggiungere i secret GitHub senza inserirli in file o messaggi.
4. Avviare manualmente `Backup notturno Supabase` da GitHub Actions.
5. Verificare in R2 i tre oggetti sotto `programmazione-collettiva/daily/`.
6. Scaricare la prima copia e lanciare:

   ```bash
   ./ops/backup/restore-backup.sh verify FILE.backup.tar.gz
   ```

7. Eseguire una prova di ripristino su un progetto Supabase temporaneo e vuoto.
8. Solo dopo la prova lasciare attiva l'esecuzione giornaliera.

## Ripristino

Il ripristino non parte mai automaticamente. Va eseguito su un database vuoto:

```bash
TARGET_DB_URL='postgresql://...' \
RESTORE_CONFIRMATION=RIPRISTINA_PROGRAMMAZIONE \
./ops/backup/restore-backup.sh restore FILE.backup.tar.gz
```

Prima di ripristinare il database di produzione bisogna conservare anche una
copia dello stato corrente e ottenere un'autorizzazione esplicita.

## Controlli periodici

- ogni settimana: controllare che l'ultima esecuzione sia verde;
- ogni mese: controllare la presenza della copia mensile;
- ogni tre mesi: ripristinare una copia su un database temporaneo;
- ogni sei mesi: verificare quote GitHub Actions, R2 e Supabase egress.
