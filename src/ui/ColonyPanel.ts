import type { ColonyBuildingType, ResourceKind } from '../game/types';
import { el, formatNumber, ICONS } from './dom';
import type { I18n, StringKey } from './i18n';
import { createIconButton } from './kit';

interface BuildingCost { ferrite: number; alloys: number; credits: number; }
interface BuildingDef { type: ColonyBuildingType; cost: BuildingCost; icon: string; color: string; }

const BUILDINGS: readonly BuildingDef[] = [
  { type: 'command',   cost: { ferrite: 100, alloys: 10, credits: 0 },    icon: '⌂', color: '#5fdcff' },
  { type: 'extractor', cost: { ferrite: 80,  alloys: 5,  credits: 500 },  icon: '⛏', color: '#ffb36b' },
  { type: 'shipyard',  cost: { ferrite: 150, alloys: 25, credits: 2000 }, icon: '⚓', color: '#8ef0a8' },
  { type: 'rnd',       cost: { ferrite: 60,  alloys: 20, credits: 1500 }, icon: '✦', color: '#b388ff' },
  { type: 'barracks',  cost: { ferrite: 90,  alloys: 8,  credits: 800 },  icon: '⚔', color: '#ff8a8a' },
  { type: 'refinery',  cost: { ferrite: 120, alloys: 15, credits: 1200 }, icon: '⚗', color: '#ffd36b' },
];

export interface ColonyPlot { id: number; building?: ColonyBuildingType; level: number; startedAt?: number; endsAt?: number; }
export interface ColonyPlayerState { credits: number; resources?: Partial<Record<ResourceKind, number>>; plots?: ColonyPlot[]; }
export interface ColonyCallbacks { onPlaceBuilding?: (plotId: number, building: ColonyBuildingType) => void; }

export class ColonyPanel {
  public readonly root: HTMLDivElement;
  private readonly i18n: I18n;
  private readonly cb: ColonyCallbacks;
  private readonly title: HTMLHeadingElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly plotsEl: HTMLElement;
  private readonly popupEl: HTMLElement;
  private readonly detailEl: HTMLElement;
  private readonly creditsEl: HTMLElement;
  private playerState: ColonyPlayerState = { credits: 0 };
  private selectedPlotId: number | null = null;

  public constructor(root: HTMLElement, i18n: I18n, cb: ColonyCallbacks = {}) {
    this.i18n = i18n;
    this.cb = cb;
    this.root = el('div', 'overlay overlay--colony');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    const scrim = el('div', 'overlay__scrim');
    scrim.addEventListener('click', () => { this.hidePopup(); this.setVisible(false); });
    const panel = el('div', 'overlay__panel overlay__panel--wide colony-panel-v2');
    const head = el('div', 'overlay__head');
    const headText = el('div', 'overlay__head-text');
    headText.append(el('span', 'overlay__eyebrow', 'NOVA PRIME'), this.title = el('h2', 'overlay__title'));
    this.creditsEl = el('div', 'colony-header-credits');
    this.closeButton = createIconButton({ label: i18n.t('colony.close'), icon: ICONS.close, className: 'icon-button overlay__close', onClick: () => { this.hidePopup(); this.setVisible(false); } });
    head.append(headText, this.creditsEl, this.closeButton);

    const layout = el('div', 'colony-v2-layout');
    const left = el('div', 'colony-v2-left');
    const plotsTitle = el('h3', 'colony-plots-title', i18n.t('colony.plots'));
    this.plotsEl = el('div', 'colony-plots-v2');
    left.append(plotsTitle, this.plotsEl);
    this.detailEl = el('div', 'colony-detail-panel');
    layout.append(left, this.detailEl);
    this.popupEl = el('div', 'colony-popup');
    this.popupEl.style.display = 'none';
    panel.append(head, layout, this.popupEl);
    this.root.append(scrim, panel);
    root.appendChild(this.root);
    this.refresh();
  }

  public setPlayerState(state: ColonyPlayerState): void {
    this.playerState = state;
    this.creditsEl.textContent = `${this.i18n.t('market.balance')}: ${formatNumber(Math.max(0, Math.floor(this.playerState.credits ?? 0)))} cr`;
    this.renderPlots();
    this.renderDetail();
  }

  private getPlots(): ColonyPlot[] {
    return this.playerState.plots ?? Array.from({ length: 6 }, (_, i) => ({ id: i, level: 0 }));
  }

  private canAfford(cost: BuildingCost): boolean {
    const res = this.playerState.resources ?? {};
    return (res.ferrite ?? 0) >= cost.ferrite && (res.alloys ?? 0) >= cost.alloys && (this.playerState.credits ?? 0) >= cost.credits;
  }

  private resDot(_kind: ResourceKind, color: string): string {
    return `<span class="colony-cost-dot" style="--c:${color}"></span>`;
  }

  private costHtml(cost: BuildingCost): string {
    const res = this.playerState.resources ?? {};
    const ferrOk = (res.ferrite ?? 0) >= cost.ferrite;
    const alloyOk = (res.alloys ?? 0) >= cost.alloys;
    const crOk = (this.playerState.credits ?? 0) >= cost.credits;
    const parts = [
      `<span class="colony-cost-item ${ferrOk ? 'is-ok' : 'is-no'}">${this.resDot('ferrite','#c08a59')}${this.i18n.resourceLabel('ferrite')} ${cost.ferrite}</span>`,
      `<span class="colony-cost-item ${alloyOk ? 'is-ok' : 'is-no'}">${this.resDot('alloys','#ffe7b3')}${this.i18n.resourceLabel('alloys')} ${cost.alloys}</span>`,
    ];
    if (cost.credits > 0) parts.push(`<span class="colony-cost-item ${crOk ? 'is-ok' : 'is-no'}"><span class="colony-cost-dot" style="--c:#7dffb1"></span>${formatNumber(cost.credits)} cr</span>`);
    return parts.join('');
  }

  private renderPlots(): void {
    this.plotsEl.innerHTML = '';
    const now = Date.now();
    for (const plot of this.getPlots()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'colony-plot-v2' + (plot.building ? ' is-built' : ' is-empty') + (this.selectedPlotId === plot.id ? ' is-selected' : '');
      if (plot.building) {
        const def = BUILDINGS.find(b => b.type === plot.building);
        const progress = plot.endsAt && plot.startedAt ? Math.max(0, Math.min(1, (now - plot.startedAt) / Math.max(1, plot.endsAt - plot.startedAt))) : 1;
        const name = this.i18n.t(`colony.${plot.building}` as StringKey);
        btn.innerHTML = `
          <span class="colony-tile" style="--bcolor:${def?.color ?? '#5fdcff'}">
            <svg class="colony-tile__iso" viewBox="0 0 64 64" aria-hidden="true">
              <polygon points="32,8 56,22 56,42 32,56 8,42 8,22" fill="rgba(10,18,28,0.85)" stroke="${def?.color ?? '#5fdcff'}" stroke-width="1.5"/>
              <polygon points="32,8 56,22 32,36 8,22" fill="${def?.color ?? '#5fdcff'}" opacity="0.18"/>
              <text x="32" y="38" text-anchor="middle" font-size="18" fill="${def?.color ?? '#5fdcff'}">${def?.icon ?? '?'}</text>
            </svg>
            <span class="colony-tile__ring" style="--p:${(progress * 100).toFixed(0)}"></span>
            <span class="colony-tile__lvl">Lv ${plot.level || 1}</span>
          </span>
          <span class="colony-tile__name">${name}</span>`;
        btn.onclick = () => { this.selectedPlotId = plot.id; this.hidePopup(); this.renderPlots(); this.renderDetail(); };
      } else {
        btn.innerHTML = `<span class="colony-tile colony-tile--empty"><span class="colony-tile__plus">+</span></span><span class="colony-tile__name">${this.i18n.t('colony.emptyPlot')}</span>`;
        btn.onclick = () => { this.selectedPlotId = plot.id; this.showBuildPopup(plot.id); this.renderPlots(); };
      }
      this.plotsEl.appendChild(btn);
    }
  }

  private showBuildPopup(plotId: number): void {
    this.popupEl.style.display = 'block';
    this.popupEl.innerHTML = '';
    const head = el('div', 'colony-popup__head', this.i18n.t('colony.selectBuilding'));
    this.popupEl.appendChild(head);
    for (const b of BUILDINGS) {
      const ok = this.canAfford(b.cost);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'colony-popup__row' + (ok ? '' : ' is-disabled');
      row.innerHTML = `
        <span class="colony-popup__icon" style="color:${b.color}">${b.icon}</span>
        <span class="colony-popup__info">
          <span class="colony-popup__name">${this.i18n.t(`colony.${b.type}` as StringKey)}</span>
          <span class="colony-popup__desc">${this.i18n.t(`colony.${b.type}Desc` as StringKey)}</span>
          <span class="colony-popup__cost">${this.costHtml(b.cost)}</span>
        </span>`;
      row.onclick = () => {
        if (!ok) return;
        this.cb.onPlaceBuilding?.(plotId, b.type);
        this.hidePopup();
      };
      this.popupEl.appendChild(row);
    }
    const cancel = el('button', 'colony-popup__cancel', this.i18n.t('colony.close')) as HTMLButtonElement;
    cancel.type = 'button';
    cancel.onclick = () => this.hidePopup();
    this.popupEl.appendChild(cancel);
  }

  private hidePopup(): void { this.popupEl.style.display = 'none'; this.popupEl.innerHTML = ''; }

  private renderDetail(): void {
    this.detailEl.innerHTML = '';
    const plot = this.getPlots().find(p => p.id === this.selectedPlotId);
    if (!plot || !plot.building) {
      this.detailEl.innerHTML = `<div class="colony-detail-empty">${this.i18n.t('colony.selectPlot')}</div>`;
      return;
    }
    const def = BUILDINGS.find(b => b.type === plot.building);
    const name = this.i18n.t(`colony.${plot.building}` as StringKey);
    const desc = this.i18n.t(`colony.${plot.building}Desc` as StringKey);
    const upCost = def ? { ferrite: Math.floor(def.cost.ferrite * 0.6 * (plot.level + 1)), alloys: Math.floor(def.cost.alloys * 0.6 * (plot.level + 1)), credits: Math.floor(def.cost.credits * 0.5 * (plot.level + 1)) } : null;
    const progress = plot.endsAt && plot.startedAt ? Math.max(0, Math.min(1, (Date.now() - plot.startedAt) / Math.max(1, plot.endsAt - plot.startedAt))) : 1;
    this.detailEl.innerHTML = `
      <div class="colony-detail__head"><span style="color:${def?.color ?? '#fff'};font-size:22px">${def?.icon ?? ''}</span><strong>${name}</strong></div>
      <div class="colony-detail__desc">${desc}</div>
      <div class="colony-detail__row"><span>${this.i18n.t('colony.level')}</span><b>${plot.level || 1}</b></div>
      <div class="colony-detail__row"><span>${this.i18n.t('colony.progress')}</span><b>${Math.floor(progress * 100)}%</b></div>
      ${upCost ? `<div class="colony-detail__up"><div>${this.i18n.t('colony.upgradeCost')}</div><div class="colony-popup__cost">${this.costHtml(upCost)}</div></div>` : ''}
    `;
  }

  public setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.root.classList.toggle('is-active', visible);
    if (visible) this.refresh();
  }

  public refresh(): void {
    this.title.textContent = this.i18n.t('colony.title');
    this.closeButton.setAttribute('aria-label', this.i18n.t('colony.close'));
    const pt = this.root.querySelector('.colony-plots-title');
    if (pt) pt.textContent = this.i18n.t('colony.plots');
    this.renderPlots();
    this.renderDetail();
  }
}
