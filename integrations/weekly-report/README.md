# Report settimanale

Automazione Google Apps Script che:

- legge da Supabase tutti i contenuti della settimana precedente;
- legge da Matomo visite, utenti unici, pagine viste e URL più consultati;
- confronta le metriche con la settimana precedente;
- genera un commento editoriale entro 2.000 caratteri;
- invia una mail HTML ogni lunedì.

## Proprietà richieste

In **Impostazioni progetto > Proprietà script**:

- `MATOMO_URL`: URL base dell'installazione Matomo;
- `MATOMO_SITE_ID`: ID numerico del sito Collettiva;
- `MATOMO_TOKEN`: token API Matomo con accesso in lettura;
- `REPORT_TO`: destinatari separati da virgola.

Proprietà facoltative:

- `REPORT_CC`: destinatari in copia;
- `REPORT_HOUR`: ora di invio, predefinita `8`;
- `REPORT_TIME_ZONE`: predefinita `Europe/Rome`;
- `MATOMO_CONTENT_PATH_REGEX`: filtro opzionale per escludere homepage e pagine di sezione dalla top 10.

## Attivazione

1. Copiare `Code.gs` in un progetto Apps Script.
2. Impostare le proprietà.
3. Eseguire `sendWeeklyReportPreview` per controllare i dati.
4. Eseguire `sendWeeklyReport` per inviare una prova.
5. Eseguire `installWeeklyTrigger` per attivare l'invio del lunedì.

Le credenziali Matomo non devono essere inserite nel codice.
