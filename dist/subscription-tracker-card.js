const LitElement =
  customElements.get("ha-panel-lovelace") &&
  Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const STATUS_COLORS = {
  expired: "var(--error-color, #A32D2D)",
  expiring_soon: "var(--warning-color, #BA7517)",
  active: "var(--success-color, #0F6E56)",
  paused: "var(--disabled-text-color, #888780)",
};

class SubscriptionTrackerCard extends LitElement {
  static get properties() {
    return { hass: {}, _config: {}, _open: {} };
  }

  constructor() {
    super();
    this._open = null;
  }

  setConfig(config) {
    this._config = {
      summary_entity: "sensor.abbonamenti_totale",
      show_paused: true,
      show_tip: true,
      ...config,
    };
  }

  getCardSize() {
    return 6;
  }

  static getStubConfig() {
    return { summary_entity: "sensor.abbonamenti_totale" };
  }

  /* ---------- dati ---------- */

  get _summary() {
    return this.hass.states[this._config.summary_entity];
  }

  _subscriptions() {
    // Se l'utente elenca le entita' esplicitamente le usiamo, altrimenti
    // prendiamo tutti i sensori che espongono gli attributi dell'integrazione.
    const ids =
      this._config.entities ||
      Object.keys(this.hass.states).filter((id) => {
        const s = this.hass.states[id];
        return (
          id.startsWith("sensor.") &&
          s.attributes.display_name !== undefined &&
          s.attributes.billing_cycle !== undefined
        );
      });

    return ids
      .map((id) => this.hass.states[id])
      .filter(Boolean)
      .filter((s) => this._config.show_paused || s.attributes.status !== "paused")
      .sort((a, b) => {
        const pa = a.attributes.status === "paused" ? 1 : 0;
        const pb = b.attributes.status === "paused" ? 1 : 0;
        if (pa !== pb) return pa - pb;
        return this._daysForSort(a) - this._daysForSort(b);
      });
  }

  _daysForSort(stateObj) {
    // 0 giorni (rinnovo oggi) e' un valore valido: solo stati non numerici vanno in fondo.
    const n = Number(stateObj.state);
    return stateObj.state !== "" && Number.isFinite(n) ? n : 9999;
  }

  _date(iso) {
    // "YYYY-MM-DD" viene interpretato in UTC da new Date(): lo leggiamo come data locale.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  }

  _money(value, currency) {
    if (value === null || value === undefined || isNaN(value)) return "—";
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: 2,
    }).format(Number(value));
  }

  _shortDate(iso) {
    if (!iso) return "—";
    return this._date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  }

  _longDate(iso) {
    if (!iso) return "—";
    return this._date(iso).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  _cycleLabel(cycle) {
    return { monthly: "mensile", quarterly: "trimestrale", yearly: "annuale" }[cycle] || cycle;
  }

  /* ---------- suggerimento contestuale ---------- */

  _tip() {
    const sum = this._summary;
    if (!sum) return null;
    const expiring = sum.attributes.expiring || [];
    const currency = sum.attributes.currency || "EUR";

    if (expiring.length >= 2) {
      const span = expiring[expiring.length - 1].days - expiring[0].days;
      if (span <= 7) {
        const tot = expiring.reduce((acc, e) => acc + Number(e.cost || 0), 0);
        const names = expiring.map((e) => e.name).join(" e ");
        return `${names} si rinnovano a pochi giorni di distanza: ${this._money(
          tot,
          currency
        )} nella stessa settimana.`;
      }
    }

    const subs = this._subscriptions();
    const paused = subs.find((s) => s.attributes.status === "paused");
    if (paused) {
      return `${paused.attributes.display_name} è in pausa: valuta se disdirlo del tutto.`;
    }

    const risen = subs
      .filter((s) => Number(s.attributes.price_change_pct) > 20)
      .sort((a, b) => b.attributes.price_change_pct - a.attributes.price_change_pct)[0];
    if (risen) {
      return `${risen.attributes.display_name} è aumentato del ${Math.round(
        risen.attributes.price_change_pct
      )} % da quando sei cliente.`;
    }

    return null;
  }

  /* ---------- storico prezzi ---------- */

  _priceChart(stateObj) {
    const history = (stateObj.attributes.price_history || []).slice().sort((a, b) =>
      a.date < b.date ? -1 : 1
    );
    if (history.length < 2) {
      return html`<div class="empty">Storico prezzi non ancora disponibile.</div>`;
    }

    const W = 320;
    const H = 74;
    const prices = history.map((h) => Number(h.price));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const color = stateObj.attributes.color || "var(--primary-color)";

    const x = (i) => 6 + (i / Math.max(history.length - 1, 1)) * (W - 24);
    const y = (p) => 56 - ((p - min) / range) * 40;

    // Linea a gradini: il prezzo resta costante finche' non cambia.
    let d = `${x(0)},${y(prices[0])}`;
    for (let i = 1; i < history.length; i++) {
      d += ` ${x(i)},${y(prices[i - 1])} ${x(i)},${y(prices[i])}`;
    }

    const last = history[history.length - 1];

    return html`
      <svg viewBox="0 0 ${W} ${H}" class="chart" role="img"
           aria-label="Storico dei prezzi dell'abbonamento">
        <polyline points=${d} fill="none" stroke=${color} stroke-width="2"
                  stroke-linejoin="round" stroke-linecap="round"></polyline>
        <circle cx=${x(history.length - 1)} cy=${y(Number(last.price))} r="3.2" fill=${color}></circle>
        ${history.map(
          (h, i) => html`
            <text x=${x(i)} y=${y(Number(h.price)) - 7} class="chart-label"
                  text-anchor=${i === history.length - 1 ? "end" : "start"}>
              ${Number(h.price).toFixed(2)}
            </text>
            <text x=${x(i)} y=${H - 3} class="chart-axis"
                  text-anchor=${i === history.length - 1 ? "end" : "start"}>
              ${this._date(h.date).getFullYear()}
            </text>
          `
        )}
      </svg>
    `;
  }

  /* ---------- render ---------- */

  _toggle(entityId) {
    this._open = this._open === entityId ? null : entityId;
  }

  _renderHeader() {
    const sum = this._summary;
    if (!sum) {
      return html`<div class="header"><div class="kpi-label">
        Sensore di riepilogo non trovato: ${this._config.summary_entity}
      </div></div>`;
    }

    const a = sum.attributes;
    const currency = a.currency || "EUR";

    return html`
      <div class="header">
        <div class="kpi-main">
          <div>
            <div class="kpi-label">Spesa ricorrente</div>
            <div class="kpi-value">
              <span class="big">${Number(sum.state).toFixed(2).replace(".", ",")}</span>
              <span class="unit">${currency === "EUR" ? "€" : currency}/mese</span>
            </div>
          </div>
        </div>
      </div>

      <div class="stats">
        <div><div class="stat-label">Attivi</div><div class="stat-value">${a.active_count ?? "—"}</div></div>
        <div><div class="stat-label">Annuo</div><div class="stat-value">${this._money(a.yearly_cost, currency)}</div></div>
        <div>
          <div class="stat-label">In scadenza</div>
          <div class="stat-value" style=${a.expiring_count ? "color:" + STATUS_COLORS.expiring_soon : ""}>
            ${a.expiring_count ?? 0}
          </div>
        </div>
      </div>
    `;
  }

  _renderRow(s) {
    const a = s.attributes;
    const days = Number(s.state);
    const paused = a.status === "paused";
    const open = this._open === s.entity_id;
    const currency = a.currency || "EUR";

    return html`
      <div class="row ${paused ? "paused" : ""}" @click=${() => this._toggle(s.entity_id)}>
        <ha-icon .icon=${a.icon || "mdi:credit-card-outline"} class="svc-icon"
                 style=${paused ? "" : `color:${a.color || "var(--primary-color)"}`}></ha-icon>
        <div class="row-main">
          <div class="row-title">
            <span class="name">${a.display_name}</span>
            ${!paused && a.status !== "active"
              ? html`<span class="pill" style="background:color-mix(in srgb, ${STATUS_COLORS[a.status]} 14%, transparent);color:${STATUS_COLORS[a.status]}">
                  ${days < 0 ? "scaduto" : days + " gg"}
                </span>`
              : ""}
          </div>
          <div class="row-sub">
            ${paused
              ? "In pausa"
              : `${a.plan ? a.plan + " · " : ""}${this._cycleLabel(a.billing_cycle)} · ${this._shortDate(a.next_renewal)}`}
          </div>
        </div>
        <div class="row-right">
          <div class="cost">${paused ? "—" : this._money(a.cost, currency)}</div>
          ${!paused && a.shared_count > 1
            ? html`<div class="row-meta">1 di ${a.shared_count}</div>`
            : !paused && a.billing_cycle === "yearly"
            ? html`<div class="row-meta">${this._money(a.monthly_cost, currency)}/mese</div>`
            : ""}
        </div>
      </div>
      ${open ? this._renderDetail(s) : ""}
    `;
  }

  _renderDetail(s) {
    const a = s.attributes;
    const currency = a.currency || "EUR";

    const rows = [
      ["Ciclo di fatturazione", this._cycleLabel(a.billing_cycle)],
      ["Prossimo rinnovo", this._longDate(a.next_renewal)],
      ["Categoria", a.category],
    ];
    if (a.shared_count > 1) rows.push(["Profili condivisi", `${a.shared_count} persone`]);
    if (a.subscribed_since)
      rows.push([
        "Cliente dal",
        `${this._longDate(a.subscribed_since)} · ${Math.floor(a.subscribed_days / 365)} anni`,
      ]);
    if (a.notes) rows.push(["Note", a.notes]);

    return html`
      <div class="detail">
        <div class="detail-kpis">
          <div><div class="stat-label">Per ciclo</div><div class="detail-kpi">${this._money(a.cost, currency)}</div></div>
          <div><div class="stat-label">Al mese</div><div class="detail-kpi">${this._money(a.monthly_cost, currency)}</div></div>
          <div><div class="stat-label">A persona</div><div class="detail-kpi">${this._money(a.cost_per_person, currency)}</div></div>
        </div>

        <div class="detail-rows">
          ${rows.map(
            ([k, v]) => html`<div class="detail-row"><span>${k}</span><span class="v">${v}</span></div>`
          )}
        </div>

        <div class="chart-block">
          <div class="chart-head">
            <span>Storico prezzo</span>
            ${a.price_change_total
              ? html`<span style="color:${a.price_change_total > 0 ? STATUS_COLORS.expired : STATUS_COLORS.active}">
                  ${a.price_change_total > 0 ? "+" : ""}${this._money(a.price_change_total, currency)}
                </span>`
              : ""}
          </div>
          ${this._priceChart(s)}
        </div>

        <div class="detail-actions">
          <button @click=${(e) => { e.stopPropagation(); this._more(s.entity_id); }}>
            Dettagli entità
          </button>
        </div>
      </div>
    `;
  }

  _more(entityId) {
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  render() {
    if (!this.hass || !this._config) return html``;

    const subs = this._subscriptions();
    const tip = this._config.show_tip ? this._tip() : null;

    return html`
      <ha-card>
        ${this._renderHeader()}
        <div class="list">
          ${subs.length
            ? subs.map((s) => this._renderRow(s))
            : html`<div class="empty">Nessun abbonamento configurato.</div>`}
        </div>
        ${tip
          ? html`<div class="tip">
              <ha-icon icon="mdi:lightbulb-outline"></ha-icon>
              <span>${tip}</span>
            </div>`
          : ""}
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      ha-card { overflow: hidden; }

      .header { padding: 16px 16px 12px; }
      .kpi-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .kpi-label { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 6px; }
      .kpi-value { display: flex; align-items: baseline; gap: 7px; }
      .big { font-size: 29px; font-weight: 500; line-height: 1; }
      .unit { font-size: 15px; color: var(--secondary-text-color); }

      .stats {
        display: flex; gap: 16px; padding: 10px 16px;
        border-top: 1px solid var(--divider-color);
        border-bottom: 1px solid var(--divider-color);
        background: var(--secondary-background-color);
      }
      .stats > div { flex: 1; }
      .stats > div + div { border-left: 1px solid var(--divider-color); padding-left: 16px; }
      .stat-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 2px; }
      .stat-value { font-size: 15px; font-weight: 500; }

      .list { padding: 0 16px; }
      .row {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 0; cursor: pointer;
      }
      .row + .row, .detail + .row { border-top: 1px solid var(--divider-color); }
      .row.paused { opacity: 0.55; }
      .svc-icon { --mdc-icon-size: 22px; flex: none; }
      .row-main { flex: 1; min-width: 0; }
      .row-title { display: flex; align-items: center; gap: 6px; }
      .name { font-size: 14px; font-weight: 500; }
      .pill { font-size: 10px; padding: 1px 7px; border-radius: 99px; white-space: nowrap; }
      .row-sub { font-size: 12px; color: var(--secondary-text-color); margin-top: 3px; }
      .row-right { text-align: right; flex: none; }
      .cost { font-size: 14px; }
      .row-meta { font-size: 11px; color: var(--secondary-text-color); margin-top: 2px; }

      .detail {
        border-top: 1px solid var(--divider-color);
        margin: 0 -16px; padding: 0 16px;
        background: var(--secondary-background-color);
      }
      .detail-kpis { display: flex; gap: 14px; padding: 12px 0; }
      .detail-kpis > div { flex: 1; }
      .detail-kpis > div + div { border-left: 1px solid var(--divider-color); padding-left: 14px; }
      .detail-kpi { font-size: 16px; font-weight: 500; }

      .detail-rows { border-top: 1px solid var(--divider-color); padding: 4px 0; }
      .detail-row {
        display: flex; justify-content: space-between; gap: 12px;
        padding: 8px 0; font-size: 13px; color: var(--secondary-text-color);
      }
      .detail-row .v { color: var(--primary-text-color); text-align: right; }

      .chart-block { border-top: 1px solid var(--divider-color); padding: 12px 0; }
      .chart-head {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 13px; font-weight: 500; margin-bottom: 8px;
      }
      .chart { width: 100%; height: 74px; display: block; }
      .chart-label { font-size: 9px; fill: var(--secondary-text-color); }
      .chart-axis { font-size: 9px; fill: var(--disabled-text-color); }

      .detail-actions { padding: 4px 0 12px; }
      .detail-actions button {
        font: inherit; font-size: 13px; cursor: pointer;
        background: none; color: var(--primary-color);
        border: 1px solid var(--divider-color); border-radius: 8px;
        padding: 6px 12px;
      }

      .tip {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 12px 16px; border-top: 1px solid var(--divider-color);
        background: var(--secondary-background-color);
        font-size: 12px; line-height: 1.5; color: var(--secondary-text-color);
      }
      .tip ha-icon { --mdc-icon-size: 17px; flex: none; color: var(--warning-color, #BA7517); }

      .empty { padding: 16px 0; font-size: 13px; color: var(--secondary-text-color); }
    `;
  }
}

customElements.define("subscription-tracker-card", SubscriptionTrackerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "subscription-tracker-card",
  name: "Subscription Tracker Card",
  description: "Elenco abbonamenti con spesa ricorrente, rinnovi e storico prezzi.",
  preview: true,
});

console.info("%c SUBSCRIPTION-TRACKER-CARD %c 0.1.0 ", "background:#0F6E56;color:#fff", "");
