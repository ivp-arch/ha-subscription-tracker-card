const LitElement =
  customElements.get("ha-panel-lovelace") &&
  Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const CARD_VERSION = "0.1.0";
const THEMES = ["auto", "orbit"];

// Icone generiche per categoria (nessun marchio). Disegnate qui, nessuna risorsa esterna.
const ICONS = {
  video: html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/></svg>`,
  audio: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  other: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  paused: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
};

class SubscriptionTrackerCard extends LitElement {
  static get properties() {
    return { hass: {}, _config: {}, _open: {}, theme: { reflect: true, type: String } };
  }

  constructor() {
    super();
    this._open = null;
    this.theme = "auto";
  }

  setConfig(config) {
    const theme = THEMES.includes(config?.theme) ? config.theme : "auto";
    this._config = {
      summary_entity: "sensor.abbonamenti_totale",
      show_paused: true,
      show_tip: true,
      show_timeline: true,
      show_budget: true,
      ...config,
      theme,
    };
    this.theme = theme;
  }

  getCardSize() {
    const n = this.hass ? this._subscriptions().length : 3;
    return 3 + (this._config?.show_timeline ? 2 : 0) + n;
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

  _urgency(days) {
    if (days <= 3) return "danger";
    if (days <= 7) return "warn";
    return "accent";
  }

  _daysLabel(days) {
    if (days === 0) return "oggi";
    if (days === 1) return "domani";
    return `tra ${days} giorni`;
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

    const x = (i) => 6 + (i / Math.max(history.length - 1, 1)) * (W - 24);
    const y = (p) => 56 - ((p - min) / range) * 40;

    // Linea a gradini: il prezzo resta costante finche' non cambia.
    let d = `${x(0)},${y(prices[0])}`;
    for (let i = 1; i < history.length; i++) {
      d += ` ${x(i)},${y(prices[i - 1])} ${x(i)},${y(prices[i])}`;
    }

    const last = history[history.length - 1];
    const summary = history
      .map((h) => `${this._date(h.date).getFullYear()}: ${Number(h.price).toFixed(2)}`)
      .join(", ");

    // Costruito con createElementNS: i template html annidati dentro un <svg>
    // creerebbero elementi nel namespace HTML e le etichette non verrebbero disegnate.
    const NS = "http://www.w3.org/2000/svg";
    const el = (tag, attrs = {}, text) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`,
      class: "chart",
      role: "img",
      "aria-label": "Storico dei prezzi. " + summary,
    });
    svg.append(
      el("polyline", {
        points: d, fill: "none", class: "chart-line", "stroke-width": 2,
        "stroke-linejoin": "round", "stroke-linecap": "round",
      }),
      el("circle", { cx: x(history.length - 1), cy: y(Number(last.price)), r: 3.2, class: "chart-dot" })
    );
    history.forEach((h, i) => {
      const anchor = i === history.length - 1 ? "end" : "start";
      svg.append(
        el("text", { x: x(i), y: y(Number(h.price)) - 7, class: "chart-label", "text-anchor": anchor }, Number(h.price).toFixed(2)),
        el("text", { x: x(i), y: H - 3, class: "chart-axis", "text-anchor": anchor }, String(this._date(h.date).getFullYear()))
      );
    });
    return svg;
  }

  /* ---------- render ---------- */

  _toggle(entityId) {
    this._open = this._open === entityId ? null : entityId;
  }

  _renderRing(a, currency) {
    const pct = Number(a.budget_used_pct);
    const shown = Math.max(0, Math.min(pct, 100));
    const R = 26;
    const C = 2 * Math.PI * R;
    const tone = a.budget_exceeded ? "danger" : pct >= 85 ? "warn" : "accent";
    const label = `Budget mensile: ${Math.round(pct)} % di ${this._money(a.budget, currency)}`;
    return html`
      <div class="ring tone-${tone}" role="img" aria-label=${label}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle class="ring-track" cx="32" cy="32" r=${R} fill="none" stroke-width="6"></circle>
          <circle class="ring-bar" cx="32" cy="32" r=${R} fill="none" stroke-width="6"
                  stroke-linecap="round" transform="rotate(-90 32 32)"
                  stroke-dasharray=${`${(C * shown) / 100} ${C}`}></circle>
        </svg>
        <span class="ring-pct">${Math.round(pct)}%</span>
      </div>
    `;
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
    const hasBudget =
      this._config.show_budget && a.budget !== null && a.budget !== undefined &&
      a.budget_used_pct !== null && a.budget_used_pct !== undefined;
    const rem = Number(a.budget_remaining);

    return html`
      <div class="header">
        <div class="kpi-main">
          <div>
            <div class="kpi-label">Spesa ricorrente</div>
            <div class="kpi-value">
              <span class="big">${Number(sum.state).toFixed(2).replace(".", ",")}</span>
              <span class="unit">${currency === "EUR" ? "€" : currency}/mese</span>
            </div>
            ${hasBudget
              ? html`<div class="budget-line ${a.budget_exceeded ? "over" : ""}">
                  ${a.budget_exceeded
                    ? `Budget superato di ${this._money(Math.abs(rem), currency)}`
                    : `Restano ${this._money(rem, currency)} su ${this._money(a.budget, currency)}`}
                </div>`
              : ""}
            ${a.mixed_currency
              ? html`<div class="budget-line">
                  Esclusi ${a.other_currency_count} abbonamenti in un'altra valuta
                </div>`
              : ""}
          </div>
          ${hasBudget ? this._renderRing(a, currency) : ""}
        </div>
      </div>

      <div class="stats">
        <div><div class="stat-label">Attivi</div><div class="stat-value">${a.active_count ?? "—"}</div></div>
        <div><div class="stat-label">Annuo</div><div class="stat-value">${this._money(a.yearly_cost, currency)}</div></div>
        <div>
          <div class="stat-label">In scadenza</div>
          <div class="stat-value ${a.expiring_count ? "tone-warn" : ""}">${a.expiring_count ?? 0}</div>
        </div>
      </div>
    `;
  }

  _renderTimeline() {
    const sum = this._summary;
    if (!sum || !this._config.show_timeline) return "";
    const a = sum.attributes;
    const items = Array.isArray(a.upcoming) ? a.upcoming : [];
    const window = Number(a.upcoming_days) || 30;
    const currency = a.currency || "EUR";

    return html`
      <section class="timeline" aria-labelledby="stc-tl-title">
        <div class="tl-head">
          <h3 id="stc-tl-title">Prossimi ${window} giorni</h3>
          <span class="tl-total">${items.length ? this._money(a.upcoming_total, currency) + " in uscita" : ""}</span>
        </div>
        ${items.length
          ? html`
              <div class="tl-track" aria-hidden="true">
                ${items.map(
                  (it) => html`<span class="tl-dot tone-${this._urgency(it.days)}"
                    style=${`left:${Math.max(0, Math.min(100, (it.days / window) * 100))}%`}></span>`
                )}
              </div>
              <ol class="tl-list">
                ${items.map(
                  (it) => html`<li>
                    <span class="tl-dotsm tone-${this._urgency(it.days)}" aria-hidden="true"></span>
                    <span class="tl-name">${it.name}</span>
                    <span class="tl-when">${this._daysLabel(it.days)} · ${this._shortDate(it.renewal)}</span>
                    <span class="tl-cost">${this._money(it.cost, currency)}</span>
                  </li>`
                )}
              </ol>
            `
          : html`<div class="empty">Nessun rinnovo nei prossimi ${window} giorni.</div>`}
      </section>
    `;
  }

  _renderRow(s) {
    const a = s.attributes;
    const days = Number(s.state);
    const paused = a.status === "paused";
    const open = this._open === s.entity_id;
    const currency = a.currency || "EUR";
    const kind = paused ? "paused" : ICONS[a.category] ? a.category : "other";
    const tone = a.status === "expiring_soon" ? "warn" : "ok";

    return html`
      <button type="button" class="row ${paused ? "paused" : ""}"
              aria-expanded=${open ? "true" : "false"}
              aria-controls=${"stc-d-" + s.entity_id.replace(/\W/g, "_")}
              @click=${() => this._toggle(s.entity_id)}>
        <span class="svc-icon kind-${kind}">${ICONS[kind]}</span>
        <span class="row-main">
          <span class="row-title">
            <span class="name">${a.display_name}</span>
            ${!paused && a.status !== "active"
              ? html`<span class="pill tone-${tone}">${days < 0 ? "scaduto" : days + " gg"}</span>`
              : ""}
          </span>
          <span class="row-sub">
            ${paused
              ? "In pausa"
              : `${a.plan ? a.plan + " · " : ""}${this._cycleLabel(a.billing_cycle)} · ${this._shortDate(a.next_renewal)}`}
          </span>
        </span>
        <span class="row-right">
          <span class="cost">${paused ? "—" : this._money(a.cost, currency)}</span>
          ${!paused && a.shared_count > 1
            ? html`<span class="row-meta">1 di ${a.shared_count}</span>`
            : !paused && a.billing_cycle === "yearly"
            ? html`<span class="row-meta">${this._money(a.monthly_cost, currency)}/mese</span>`
            : ""}
        </span>
      </button>
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
      <div class="detail" id=${"stc-d-" + s.entity_id.replace(/\W/g, "_")}>
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
              ? html`<span class="${a.price_change_total > 0 ? "tone-danger" : "tone-ok"}">
                  ${a.price_change_total > 0 ? "+" : ""}${this._money(a.price_change_total, currency)}
                </span>`
              : ""}
          </div>
          ${this._priceChart(s)}
        </div>

        <div class="detail-actions">
          <button type="button" class="btn" @click=${() => this._more(s.entity_id)}>
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
        ${this._renderHeader()} ${this._renderTimeline()}
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
      /* Token pubblici: --stc-*. Se non impostati ereditano il tema di Home Assistant.
         Si possono sovrascrivere da un tema HA o da card-mod. Il preset theme: orbit
         imposta valori fissi. Gli alias --_x sono interni. */
      :host {
        display: block;
        --_bg: var(--stc-bg, var(--ha-card-background, var(--card-background-color, #fff)));
        --_surface: var(--stc-surface, var(--secondary-background-color, #f5f5f5));
        --_border: var(--stc-border, var(--divider-color, #e0e0e0));
        --_text: var(--stc-text, var(--primary-text-color, #212121));
        --_muted: var(--stc-muted, var(--secondary-text-color, #727272));
        --_accent: var(--stc-accent, var(--primary-color, #03a9f4));
        --_ok: var(--stc-ok, var(--success-color, #2e7d32));
        --_warn: var(--stc-warn, var(--warning-color, #b26a00));
        --_danger: var(--stc-danger, var(--error-color, #c62828));
        --_video: var(--stc-video, var(--_accent));
        --_audio: var(--stc-audio, var(--_ok));
        --_other: var(--stc-other, var(--_muted));
        --_radius: var(--stc-radius, var(--ha-card-border-radius, 12px));
        --_row-radius: var(--stc-row-radius, 12px);
        --_font: var(--stc-font, inherit);
        --_font-display: var(--stc-font-display, inherit);
        --_font-mono: var(--stc-font-mono, inherit);
      }
      :host([theme="orbit"]) {
        --stc-bg: #05070c;
        --stc-surface: #0c1019;
        --stc-border: #1c2331;
        --stc-text: #e8ecf4;
        --stc-muted: #9aa4b6;
        --stc-accent: #4fd6f0;
        --stc-ok: #3ddc84;
        --stc-warn: #f5b74a;
        --stc-danger: #ff5a5f;
        --stc-video: #4fd6f0;
        --stc-audio: #8c7cff;
        --stc-other: #9aa4b6;
        --stc-radius: 24px;
        --stc-row-radius: 16px;
        --stc-font: Inter, system-ui, sans-serif;
        --stc-font-display: "Space Grotesk", Inter, system-ui, sans-serif;
        --stc-font-mono: "JetBrains Mono", ui-monospace, monospace;
      }

      ha-card {
        overflow: hidden;
        background: var(--_bg);
        color: var(--_text);
        border-radius: var(--_radius);
        font-family: var(--_font);
      }
      :host([theme="orbit"]) ha-card { border: 1px solid var(--_border); }

      .tone-ok { color: var(--_ok); }
      .tone-warn { color: var(--_warn); }
      .tone-danger { color: var(--_danger); }
      .tone-accent { color: var(--_accent); }

      button { font: inherit; color: inherit; }
      button:focus-visible {
        outline: 2px solid var(--_accent);
        outline-offset: -2px;
      }

      .header { padding: 16px 16px 12px; }
      .kpi-main { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .kpi-label { font-size: 12px; color: var(--_muted); margin-bottom: 6px; }
      :host([theme="orbit"]) .kpi-label,
      :host([theme="orbit"]) .stat-label { font-family: var(--_font-mono); text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; }
      .kpi-value { display: flex; align-items: baseline; gap: 7px; }
      .big { font-family: var(--_font-display); font-size: 29px; font-weight: 500; line-height: 1; }
      :host([theme="orbit"]) .big { font-size: 46px; font-weight: 600; }
      .unit { font-size: 15px; color: var(--_muted); }
      .budget-line { font-size: 12px; color: var(--_muted); margin-top: 8px; }
      .budget-line.over { color: var(--_danger); }

      .ring { position: relative; width: 64px; height: 64px; flex: none; }
      .ring svg { width: 100%; height: 100%; display: block; }
      .ring-track { stroke: var(--_border); }
      .ring-bar { stroke: currentColor; }
      .ring-pct {
        position: absolute; inset: 0; display: grid; place-items: center;
        font-family: var(--_font-display); font-size: 14px; font-weight: 600; color: var(--_text);
      }

      .stats {
        display: flex; gap: 16px; padding: 10px 16px;
        border-top: 1px solid var(--_border);
        border-bottom: 1px solid var(--_border);
        background: var(--_surface);
      }
      .stats > div { flex: 1; }
      .stats > div + div { border-left: 1px solid var(--_border); padding-left: 16px; }
      .stat-label { font-size: 11px; color: var(--_muted); margin-bottom: 2px; }
      .stat-value { font-family: var(--_font-display); font-size: 15px; font-weight: 500; }

      .timeline { padding: 14px 16px; border-bottom: 1px solid var(--_border); }
      .tl-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
      .tl-head h3 { margin: 0; font-size: 13px; font-weight: 500; }
      .tl-total { font-size: 12px; color: var(--_muted); }
      .tl-track {
        position: relative; height: 14px; margin: 14px 7px 10px;
        border-bottom: 2px solid var(--_border);
      }
      .tl-dot {
        position: absolute; top: 0; width: 12px; height: 12px; margin-left: -6px;
        border-radius: 50%; background: currentColor;
        border: 2px solid var(--_bg); box-sizing: content-box;
      }
      .tl-list { list-style: none; margin: 0; padding: 0; }
      .tl-list li {
        display: grid; grid-template-columns: 10px 1fr auto; column-gap: 10px; align-items: baseline;
        padding: 5px 0; font-size: 13px;
      }
      .tl-dotsm { width: 8px; height: 8px; border-radius: 50%; background: currentColor; align-self: center; grid-row: 1 / span 2; }
      .tl-name { font-weight: 500; }
      .tl-cost { font-family: var(--_font-display); text-align: right; }
      .tl-when { grid-column: 2; font-size: 12px; color: var(--_muted); }
      .tl-cost { grid-column: 3; grid-row: 1 / span 2; align-self: center; }

      .list { padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
      .row {
        display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box;
        min-height: 64px; padding: 8px 10px; margin: 0; text-align: left; cursor: pointer;
        background: transparent; border: 1px solid transparent; border-radius: var(--_row-radius);
      }
      .row:hover { background: var(--_surface); }
      :host([theme="orbit"]) .row { background: var(--_surface); border-color: var(--_border); }
      .row.paused { opacity: 0.6; }
      .row > span { display: block; }
      .svc-icon {
        flex: none; width: 42px; height: 42px; border-radius: 12px; display: grid !important; place-items: center;
        color: var(--_other);
        background: color-mix(in srgb, currentColor 14%, transparent);
      }
      .svc-icon svg { width: 22px; height: 22px; }
      .kind-video { color: var(--_video); }
      .kind-audio { color: var(--_audio); }
      .kind-other, .kind-paused { color: var(--_other); }
      .row-main { flex: 1; min-width: 0; }
      .row-title { display: flex !important; align-items: center; gap: 6px; }
      .name { font-size: 14px; font-weight: 500; }
      .pill {
        font-size: 11px; padding: 1px 8px; border-radius: 99px; white-space: nowrap;
        background: color-mix(in srgb, currentColor 14%, transparent);
      }
      .row-sub { font-size: 12px; color: var(--_muted); margin-top: 3px; }
      .row-right { text-align: right; flex: none; }
      .cost { font-family: var(--_font-display); font-size: 14px; }
      .row-meta { font-size: 11px; color: var(--_muted); margin-top: 2px; }

      .detail {
        margin: 0 0 4px; padding: 0 14px;
        background: var(--_surface); border-radius: var(--_row-radius);
      }
      .detail-kpis { display: flex; gap: 14px; padding: 12px 0; }
      .detail-kpis > div { flex: 1; }
      .detail-kpis > div + div { border-left: 1px solid var(--_border); padding-left: 14px; }
      .detail-kpi { font-family: var(--_font-display); font-size: 16px; font-weight: 500; }

      .detail-rows { border-top: 1px solid var(--_border); padding: 4px 0; }
      .detail-row {
        display: flex; justify-content: space-between; gap: 12px;
        padding: 8px 0; font-size: 13px; color: var(--_muted);
      }
      .detail-row .v { color: var(--_text); text-align: right; }

      .chart-block { border-top: 1px solid var(--_border); padding: 12px 0; }
      .chart-head {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 13px; font-weight: 500; margin-bottom: 8px;
      }
      .chart { width: 100%; height: 74px; display: block; }
      .chart-line { stroke: var(--_accent); }
      .chart-dot { fill: var(--_accent); }
      .chart-label { font-size: 9px; fill: var(--_muted); }
      .chart-axis { font-size: 9px; fill: var(--_muted); }

      .detail-actions { padding: 4px 0 12px; }
      .btn {
        min-height: 44px; min-width: 44px; padding: 0 16px; cursor: pointer;
        font-size: 13px; background: none; color: var(--_accent);
        border: 1px solid var(--_border); border-radius: 10px;
      }
      .btn:hover { background: color-mix(in srgb, var(--_accent) 10%, transparent); }

      .tip {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 12px 16px; border-top: 1px solid var(--_border);
        background: var(--_surface);
        font-size: 12px; line-height: 1.5; color: var(--_muted);
      }
      .tip ha-icon { --mdc-icon-size: 17px; flex: none; color: var(--_warn); }

      .empty { padding: 12px 0; font-size: 13px; color: var(--_muted); }

      @media (prefers-reduced-motion: no-preference) {
        .ring-bar { transition: stroke-dasharray 0.4s ease; }
      }
    `;
  }
}

customElements.define("subscription-tracker-card", SubscriptionTrackerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "subscription-tracker-card",
  name: "Subscription Tracker Card",
  description: "Elenco abbonamenti con spesa ricorrente, budget, timeline dei rinnovi e storico prezzi.",
  preview: true,
});

console.info(
  `%c SUBSCRIPTION-TRACKER-CARD %c ${CARD_VERSION} `,
  "background:#0F6E56;color:#fff",
  ""
);
