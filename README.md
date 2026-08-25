# Subscription Tracker Card

Card Lovelace per l'integrazione [Subscription Tracker](https://github.com/ivp-arch/subscription-tracker).

Mostra la spesa ricorrente totale, l'elenco degli abbonamenti con icona e colore per servizio, e — al tap su una riga — il dettaglio completo con lo storico prezzi.

## Installazione

### Via HACS (repository personalizzato)
1. HACS → Frontend → menu (⋮) → Repository personalizzati
2. Aggiungi l'URL di questo repo, categoria **Lovelace**
3. Installa e ricarica la pagina

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
show_paused: true
show_tip: true
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

## Suggerimento contestuale

Il riquadro in fondo non è un dato ma un'osservazione, scelta in ordine di priorità:

1. Due o più rinnovi entro la stessa settimana → mostra il totale che uscirà in quei giorni
2. Un abbonamento in pausa → suggerisce di valutare la disdetta
3. Un servizio aumentato di oltre il 20 % da quando sei cliente → segnala la variazione

Se nessuna condizione si verifica, il riquadro non compare.

## Nota

L'ordinamento è per urgenza: prima gli abbonamenti con meno giorni al rinnovo, quelli in pausa sempre in fondo.
