# Subscription Tracker Card

Card Lovelace per l'integrazione [Subscription Tracker](https://github.com/ivp-arch/ha-subscription-tracker).

Mostra la spesa ricorrente totale, l'elenco degli abbonamenti con icona e colore per servizio, e — al tap su una riga — il dettaglio completo con lo storico prezzi.

## Installazione

### Marketplace di Home Assistant (2026.11 o successivo)
1. Impostazioni → Marketplace → menu (⋮) → **Aggiungi da link** (serve collegare un account GitHub)
2. Inserisci `ivp-arch/ha-subscription-tracker-card`; se richiesto, scegli il tipo **Dashboard**
3. Installa e ricarica il browser. La risorsa viene aggiunta in automatico (`/local/community/...`), a meno che tu gestisca le risorse in YAML

### HACS (Home Assistant precedente alla 2026.11)
HACS → Frontend → menu (⋮) → Repository personalizzati → aggiungi l'URL di questo repo, categoria **Lovelace**. Installa e ricarica la pagina.

### Manuale
Copia `dist/subscription-tracker-card.js` in `/config/www/`, poi aggiungi la risorsa:

Impostazioni → Dashboard → menu (⋮) → Risorse → Aggiungi:
- URL: `/local/subscription-tracker-card.js`
- Tipo: Modulo JavaScript

## Configurazione

Minima — la card trova da sola tutti gli abbonamenti:

```yaml
type: custom:subscription-tracker-card
```

Completa:

```yaml
type: custom:subscription-tracker-card
summary_entity: sensor.abbonamenti_totale
theme: auto          # oppure orbit
show_paused: true
show_tip: true
show_timeline: true
show_budget: true
entities:
  - sensor.netflix_premium
  - sensor.dazn_standard
  - sensor.spotify_famiglia
```

| Opzione | Default | Descrizione |
|---|---|---|
| `summary_entity` | `sensor.abbonamenti_totale` | Sensore di riepilogo dell'integrazione |
| `entities` | auto | Elenco esplicito. Se omesso, la card rileva da sola i sensori dell'integrazione |
| `show_paused` | `true` | Mostra gli abbonamenti in pausa in fondo, attenuati |
| `show_tip` | `true` | Mostra il suggerimento contestuale in fondo alla card |
| `show_timeline` | `true` | Mostra i rinnovi dei prossimi 30 giorni (attributo `upcoming` del riepilogo) |
| `show_budget` | `true` | Mostra l'anello del budget mensile, se impostato nell'integrazione |
| `theme` | `auto` | `auto` eredita il tema di Home Assistant; `orbit` applica lo stile scuro Orbit |

## Temi e personalizzazione

Tutti i colori usano variabili CSS `--stc-*` (`--stc-bg`, `--stc-surface`, `--stc-border`, `--stc-text`, `--stc-muted`, `--stc-accent`, `--stc-ok`, `--stc-warn`, `--stc-danger`, `--stc-video`, `--stc-audio`, `--stc-other`, `--stc-radius`, `--stc-row-radius`, `--stc-font`, `--stc-font-display`, `--stc-font-mono`). Se non impostate ereditano il tema di Home Assistant; si possono ridefinire da un tema o con card-mod. Il preset `orbit` non carica font esterni: usa Space Grotesk, Inter e JetBrains Mono solo se già installati, altrimenti i font di sistema.

Le icone sono generiche per categoria (video, audio, altro, in pausa), non loghi di marchi.

## Suggerimento contestuale

Il riquadro in fondo non è un dato ma un'osservazione, scelta in ordine di priorità:

1. Due o più rinnovi entro la stessa settimana → mostra il totale che uscirà in quei giorni
2. Un abbonamento in pausa → suggerisce di valutare la disdetta
3. Un servizio aumentato di oltre il 20 % da quando sei cliente → segnala la variazione

Se nessuna condizione si verifica, il riquadro non compare.

## Nota

L'ordinamento è per urgenza: prima gli abbonamenti con meno giorni al rinnovo, quelli in pausa sempre in fondo.
