import { RESOURCES, RESOURCE_ORDER } from '../assets-config';
import { MODULE_DEFINITIONS, normalizeOwnedModules, getModuleSellPrice, type OwnedModuleCounts } from '../game/fitting';
import { MODULE_SELL_CONFIRM_CREDITS } from '../game/config';
import { HOME_STATION_ID, REFINE_RECIPES, ZONES } from '../game/worldData';
import { getRecipe, refineJobRemaining, type RefineryJobData, type MarketPriceTable } from '../game/economy';
import {
  missionIsReady,
  missionLabel,
  missionTargetLabel,
  type MissionOffer,
  type MissionTextContext,
  type MissionType,
} from '../game/missions';
import { MISSION_MAX_ACTIVE } from '../game/config';
import type { ResourceKind } from '../game/types';
import { createIcon, el, formatNumber, ICONS } from './dom';
import type { I18n } from './i18n';
import { createIconButton } from './kit';

export interface MarketState {
  credits: number;
  cargo: Partial<Record<ResourceKind, number>>;
  cargoUsed: number;
  cargoCap: number;
  storage: Partial<Record<ResourceKind, number>>;
  storageUsed: number;
  storageCap: number;
  /** 4D: moduleId -> owned quantity. */
  ownedModules: OwnedModuleCounts;
  /** 4D: moduleId -> fitted quantity (across hulls). */
  fittedModules?: Record<string, number>;
  trends?: Partial<Record<ResourceKind, number>>; // -1..1
  /** 4D: live prices at the current station. */
  prices?: Partial<MarketPriceTable>;
  /** 4D: refinery jobs saved on the profile. */
  refineryQueue?: RefineryJobData[];
  /** 4D: accepted + board missions. */
  missions?: MissionOffer[];
  missionBoard?: MissionOffer[];
  zoneId?: string;
  /** 4D: repair quote from the live ship. */
  repair?: { missingHull: number; missingShield: number; cost: number };
}

export interface MarketCallbacks {
  onBuyResource?: (kind: ResourceKind, qty: number) => void;
  onSellResource?: (kind: ResourceKind, qty: number) => void;
  onBuyModule?: (moduleId: string, qty: number) => void;
  onSellModule?: (moduleId: string, qty: number) => void;
  onTransfer?: (kind: ResourceKind, qty: number, direction: 'store' | 'withdraw') => void;
  onRefine?: (recipeId: string, batches: number) => void;
  onCollectRefine?: (jobId: string) => void;
  onRepair?: () => void;
  onAcceptMission?: (missionId: string) => void;
  onAbandonMission?: (missionId: string) => void;
  onClaimMission?: (missionId: string) => void;
}

type TabId = 'sell' | 'buy' | 'modules' | 'sellModules' | 'refine' | 'missions' | 'storage' | 'transfer';

type TabGroupId = 'trade' | 'modules' | 'station';

interface TabGroup {
  id: TabGroupId;
  labelKey: string;
  icon: string;
  tabs: Array<{ id: TabId; labelKey: string; icon: string }>;
}

const TAB_GROUPS: readonly TabGroup[] = [
  {
    id: 'trade',
    labelKey: 'market.group.trade',
    icon: ICONS.market,
    tabs: [
      { id: 'sell', labelKey: 'market.tab.sell', icon: ICONS.credits },
      { id: 'buy', labelKey: 'market.tab.buy', icon: ICONS.market },
    ],
  },
  {
    id: 'modules',
    labelKey: 'market.group.modules',
    icon: ICONS.wrench,
    tabs: [
      { id: 'modules', labelKey: 'market.tab.modules', icon: ICONS.wrench },
      { id: 'sellModules', labelKey: 'market.tab.sellModules', icon: ICONS.box },
    ],
  },
  {
    id: 'station',
    labelKey: 'market.group.station',
    icon: ICONS.ship,
    tabs: [
      { id: 'refine', labelKey: 'market.tab.refine', icon: ICONS.mine },
      { id: 'missions', labelKey: 'market.tab.missions', icon: ICONS.target },
      { id: 'storage', labelKey: 'market.tab.storage', icon: ICONS.box },
      { id: 'transfer', labelKey: 'market.tab.transfer', icon: ICONS.arrow },
    ],
  },
];

export class MarketPanel {
  public readonly root: HTMLDivElement;
  private readonly i18n: I18n;
  private readonly cb: MarketCallbacks;
  private readonly title: HTMLHeadingElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly creditsEl: HTMLElement;
  private readonly cargoBarFill: HTMLElement;
  private readonly cargoBarText: HTMLElement;
  private readonly storageBarFill: HTMLElement;
  private readonly storageBarText: HTMLElement;
  private readonly content: HTMLElement;
  private readonly tabScroll: HTMLDivElement;
  private readonly tabPrev: HTMLButtonElement;
  private readonly tabNext: HTMLButtonElement;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private readonly toast: HTMLDivElement;
  private toastTimer: number | null = null;
  private state: MarketState = { credits: 0, cargo: {}, cargoUsed: 0, cargoCap: 0, storage: {}, storageUsed: 0, storageCap: 0, ownedModules: {} };
  private tab: TabId = 'sell';
  private tickTimer: number | null = null;

  public constructor(root: HTMLElement, i18n: I18n, cb: MarketCallbacks = {}) {
    this.i18n = i18n;
    this.cb = cb;
    this.root = el('div', 'overlay overlay--market');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    const scrim = el('div', 'overlay__scrim');
    scrim.addEventListener('click', () => this.setVisible(false));
    const panel = el('div', 'overlay__panel overlay__panel--wide market-panel');
    const head = el('div', 'overlay__head');
    const headText = el('div', 'overlay__head-text');
    headText.append(el('span', 'overlay__eyebrow', 'NOVA PRIME'), this.title = el('h2', 'overlay__title'));
    this.closeButton = createIconButton({ label: i18n.t('market.close'), icon: ICONS.close, className: 'icon-button overlay__close', onClick: () => this.setVisible(false) });
    head.append(headText, this.closeButton);

    const headerBar = el('div', 'market-header-bar');
    this.creditsEl = el('div', 'market-header-stat market-header-credits');
    const cargoWrap = el('div', 'market-header-barwrap');
    const cargoLabel = el('div', 'market-header-stat', i18n.t('market.cargoCap'));
    const cargoTrack = el('div', 'market-cap-track');
    this.cargoBarFill = el('div', 'market-cap-fill');
    cargoTrack.appendChild(this.cargoBarFill);
    this.cargoBarText = el('div', 'market-cap-text');
    cargoWrap.append(cargoLabel, cargoTrack, this.cargoBarText);
    const storageWrap = el('div', 'market-header-barwrap');
    const storageLabel = el('div', 'market-header-stat', i18n.t('market.storageBar'));
    const storageTrack = el('div', 'market-cap-track');
    this.storageBarFill = el('div', 'market-cap-fill is-storage');
    storageTrack.appendChild(this.storageBarFill);
    this.storageBarText = el('div', 'market-cap-text');
    storageWrap.append(storageLabel, storageTrack, this.storageBarText);
    headerBar.append(this.creditsEl, cargoWrap, storageWrap);

    this.tabScroll = el('div', 'market-tabscroll');
    this.tabScroll.setAttribute('role', 'tablist');
    this.tabScroll.setAttribute('aria-label', i18n.t('market.title'));
    this.tabScroll.append(...TAB_GROUPS.map((group) => this.createTabGroup(group)));
    this.tabPrev = createIconButton({
      label: i18n.t('market.tabsScroll'),
      icon: ICONS.chevron,
      className: 'market-tabnav is-prev',
      onClick: () => this.scrollTabs(-1),
    });
    this.tabNext = createIconButton({
      label: i18n.t('market.tabsScroll'),
      icon: ICONS.chevron,
      className: 'market-tabnav is-next',
      onClick: () => this.scrollTabs(1),
    });
    this.tabPrev.hidden = true;
    this.tabNext.hidden = true;
    const tabbar = el('div', 'market-tabbar');
    tabbar.append(this.tabPrev, this.tabScroll, this.tabNext);
    this.content = el('div', 'market-content');
    this.toast = el('div', 'market-toast') as HTMLDivElement;
    this.toast.hidden = true;
    panel.append(head, headerBar, tabbar, this.content, this.toast);
    this.root.append(scrim, panel);
    root.appendChild(this.root);
    this.selectTab('sell', false);
    this.tabScroll.addEventListener('scroll', () => this.syncTabArrows(), { passive: true });
    this.tabScroll.addEventListener('keydown', (event) => this.onTabKey(event));
    window.addEventListener('resize', () => this.syncTabArrows());
    this.refresh();
  }

  private createTabGroup(group: TabGroup): HTMLElement {
    const wrap = el('div', 'market-tabgroup');
    const label = el('div', 'market-tabgroup-label');
    label.dataset.group = group.id;
    label.append(createIcon(group.icon), el('span', '', this.i18n.t(group.labelKey as never)));
    const buttons = el('div', 'market-tabgroup-buttons');
    for (const item of group.tabs) {
      const button = el('button', 'market-tab') as HTMLButtonElement;
      button.type = 'button';
      button.dataset.tab = item.id;
      button.dataset.labelKey = item.labelKey;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
      button.tabIndex = -1;
      const icon = createIcon(item.icon);
      icon.classList.add('market-tab-icon');
      button.append(icon, el('span', 'market-tab-label', this.i18n.t(item.labelKey as never)));
      button.addEventListener('click', () => this.selectTab(item.id));
      this.tabButtons.set(item.id, button);
      buttons.appendChild(button);
    }
    wrap.append(label, buttons);
    return wrap;
  }

  private selectTab(id: TabId, notify = true): void {
    if (!this.tabButtons.has(id)) return;
    this.tab = id;
    for (const [key, button] of this.tabButtons) {
      const active = key === id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    }
    const activeButton = this.tabButtons.get(id);
    if (activeButton && this.tabScroll.clientWidth > 0) {
      const left = activeButton.offsetLeft - this.tabScroll.clientLeft;
      const right = left + activeButton.offsetWidth;
      if (left < this.tabScroll.scrollLeft || right > this.tabScroll.scrollLeft + this.tabScroll.clientWidth) {
        this.tabScroll.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
      }
    }
    if (notify) this.renderContent();
    this.syncTabArrows();
  }

  private onTabKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const ids = [...this.tabButtons.keys()];
    const current = ids.indexOf(this.tab);
    if (current < 0) return;
    event.preventDefault();
    const rtl = this.i18n.dir === 'rtl';
    const step = event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : event.key === 'ArrowRight' ? (rtl ? -1 : 1) : 0;
    const next = event.key === 'Home'
      ? ids[0]
      : event.key === 'End'
        ? ids[ids.length - 1]
        : ids[(current + step + ids.length) % ids.length];
    this.selectTab(next);
    this.tabButtons.get(next)?.focus({ preventScroll: true });
  }

  private scrollTabs(direction: -1 | 1): void {
    const amount = Math.max(160, this.tabScroll.clientWidth * 0.7) * direction * (this.i18n.dir === 'rtl' ? -1 : 1);
    this.tabScroll.scrollBy({ left: amount, behavior: 'smooth' });
  }

  private syncTabArrows(): void {
    const overflow = this.tabScroll.scrollWidth - this.tabScroll.clientWidth > 4;
    this.tabPrev.hidden = !overflow;
    this.tabNext.hidden = !overflow;
    if (!overflow) return;
    const max = this.tabScroll.scrollWidth - this.tabScroll.clientWidth;
    this.tabPrev.disabled = this.tabScroll.scrollLeft <= 2;
    this.tabNext.disabled = this.tabScroll.scrollLeft >= max - 2;
  }

  private missionTextContext(): MissionTextContext {
    const fallbackZone = this.state.zoneId;
    const zoneName = (id?: string): string => {
      const zone = ZONES.find((z) => z.id === (id ?? fallbackZone));
      const name = this.i18n.dir === 'rtl' ? zone?.name.ar : zone?.name.en;
      return name ?? id ?? fallbackZone ?? '—';
    };
    return {
      t: (key, params) => this.i18n.t(key as never, params),
      resourceName: (id) => this.i18n.resourceLabel(id as ResourceKind),
      zoneName,
      stationName: (id) => {
        const zone = ZONES.find((z) => z.id === (id ?? HOME_STATION_ID));
        const name = this.i18n.dir === 'rtl' ? zone?.name.ar : zone?.name.en;
        return name ?? zoneName(fallbackZone);
      },
    };
  }

  private missionTypeIcon(type: MissionType): SVGSVGElement {
    const icon = createIcon(type === 'mine' ? ICONS.mine : type === 'destroy' ? ICONS.target : ICONS.box);
    icon.classList.add('mission-type-icon');
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', this.i18n.t(`mission.type.${type}` as never));
    return icon;
  }

  public setState(state: Partial<MarketState>): void {
    this.state = { ...this.state, ...state };
    this.renderHeader();
    this.renderContent();
  }

  private renderHeader(): void {
    this.creditsEl.textContent = `${this.i18n.t('market.balance')}: ${formatNumber(Math.max(0, Math.floor(this.state.credits)))} cr`;
    const cp = this.state.cargoCap > 0 ? Math.min(1, this.state.cargoUsed / this.state.cargoCap) : 0;
    this.cargoBarFill.style.width = `${(cp * 100).toFixed(1)}%`;
    this.cargoBarText.textContent = `${Math.floor(this.state.cargoUsed)}/${Math.floor(this.state.cargoCap)}`;
    const sp = this.state.storageCap > 0 ? Math.min(1, this.state.storageUsed / this.state.storageCap) : 0;
    this.storageBarFill.style.width = `${(sp * 100).toFixed(1)}%`;
    this.storageBarText.textContent = this.state.storageCap > 0 ? `${Math.floor(this.state.storageUsed)}/${Math.floor(this.state.storageCap)}` : '—';
  }

  private renderContent(): void {
    this.content.innerHTML = '';
    if (this.tab === 'sell' || this.tab === 'buy') this.renderResources(this.tab);
    else if (this.tab === 'storage') this.renderStorage();
    else if (this.tab === 'transfer') this.renderTransfer();
    else if (this.tab === 'modules') this.renderModules();
    else if (this.tab === 'sellModules') this.renderSellModules();
    else if (this.tab === 'refine') this.renderRefine();
    else if (this.tab === 'missions') this.renderMissions();
    else this.renderPlaceholder();
  }

  private renderPlaceholder(): void {
    const p = el('div', 'market-placeholder', this.i18n.t('market.comingSoon'));
    this.content.appendChild(p);
  }

  private renderResources(mode: 'sell' | 'buy'): void {
    const list = el('div', 'market-resource-list');
    for (const kind of RESOURCE_ORDER) {
      const res = RESOURCES[kind];
      const inCargo = Math.floor(this.state.cargo[kind] ?? 0);
      const inStorage = Math.floor(this.state.storage[kind] ?? 0);
      const priceTable = this.state.prices?.[kind];
      const price = mode === 'buy'
        ? priceTable?.buy ?? res.value * 1.35
        : priceTable?.sell ?? res.value * 1.2;
      const trend = priceTable?.trend ?? this.state.trends?.[kind] ?? 0;
      const row = el('div', 'market-res-row');
      const icon = el('span', 'market-dot');
      icon.dataset.resource = kind;
      const name = el('div', 'market-res-name');
      name.append(icon, el('span', '', this.i18n.resourceLabel(kind)));
      const meta = el('div', 'market-res-meta');
      meta.innerHTML = `<span>${this.i18n.t('market.inCargo')}: ${inCargo}</span><span>${this.i18n.t('market.inStorage')}: ${inStorage}</span>`;
      const priceEl = el('div', 'market-res-price');
      const arrow = trend > 0.02 ? '▲' : trend < -0.02 ? '▼' : '•';
      const arrowCls = trend > 0.02 ? 'is-up' : trend < -0.02 ? 'is-down' : '';
      priceEl.innerHTML = `<span>${formatNumber(price)} cr</span> <span class="market-trend ${arrowCls}">${arrow}</span>`;
      const qtyWrap = el('div', 'market-qty');
      const qtyInput = document.createElement('input');
      qtyInput.type = 'number'; qtyInput.min = '1'; qtyInput.value = '1'; qtyInput.className = 'market-qty-input';
      const allBtn = el('button', 'market-qty-all', this.i18n.t('market.all')) as HTMLButtonElement;
      allBtn.type = 'button';
      const total = el('div', 'market-total');
      const max = mode === 'sell' ? inCargo + inStorage : Math.max(0, Math.floor(this.state.credits / Math.max(1, price)));
      const updateTotal = () => {
        const q = Math.max(1, Math.min(max || 1, parseInt(qtyInput.value || '1', 10) || 1));
        qtyInput.value = String(q);
        total.textContent = `${this.i18n.t('market.total')}: ${formatNumber(q * price)} cr`;
      };
      allBtn.onclick = () => { qtyInput.value = String(Math.max(1, max || 1)); updateTotal(); };
      qtyInput.oninput = updateTotal;
      updateTotal();
      qtyWrap.append(qtyInput, allBtn, total);

      const action = el('button', 'toggle-button') as HTMLButtonElement;
      action.type = 'button';
      let disabled = false; let reason = '';
      if (mode === 'sell') {
        action.textContent = this.i18n.t('market.sell');
        if (inCargo + inStorage <= 0) { disabled = true; reason = this.i18n.t('market.inCargo') + ': 0'; }
        action.onclick = () => { if (!disabled) this.cb.onSellResource?.(kind, parseInt(qtyInput.value, 10) || 1); };
      } else if (mode === 'buy') {
        action.textContent = this.i18n.t('market.buy');
        if (this.state.credits < price) { disabled = true; reason = this.i18n.t('market.noCredits'); }
        else if (this.state.cargoCap > 0 && this.state.cargoUsed >= this.state.cargoCap) { disabled = true; reason = this.i18n.t('market.cargoFull'); }
        action.onclick = () => { if (!disabled) this.cb.onBuyResource?.(kind, parseInt(qtyInput.value, 10) || 1); };
      }
      action.disabled = disabled;
      if (reason) action.title = reason;

      row.append(name, meta, priceEl, qtyWrap, action);
      list.appendChild(row);
    }
    this.content.appendChild(list);
  }

  private renderModules(): void {
    const list = el('div', 'market-resource-list');
    const ownedCounts = normalizeOwnedModules(this.state.ownedModules);
    for (const mod of MODULE_DEFINITIONS) {
      const owned = ownedCounts[mod.id] ?? 0;
      const row = el('div', 'market-res-row market-mod-row');
      const name = el('div', 'market-res-name');
      name.textContent = this.i18n.dir === 'rtl' ? mod.name.ar : mod.name.en;
      const meta = el('div', 'market-res-meta');
      meta.textContent = `${this.i18n.t(`fitting.slot.${mod.slot}` as never)} · ${this.tier(mod.tier)} · CPU ${mod.cpu} · PG ${mod.powergrid}${owned > 0 ? ` · ×${owned}` : ''}`;
      const priceEl = el('div', 'market-res-price', `${formatNumber(mod.creditCost)} cr`);
      const qtyWrap = el('div', 'market-qty');
      const qtyInput = document.createElement('input');
      qtyInput.type = 'number'; qtyInput.min = '1'; qtyInput.value = '1'; qtyInput.className = 'market-qty-input';
      const max = Math.max(1, Math.floor(this.state.credits / Math.max(1, mod.creditCost)));
      const total = el('div', 'market-total');
      const updateTotal = () => {
        const q = Math.max(1, Math.min(max, parseInt(qtyInput.value || '1', 10) || 1));
        qtyInput.value = String(q);
        total.textContent = `${this.i18n.t('market.total')}: ${formatNumber(q * mod.creditCost)} cr`;
      };
      const allBtn = el('button', 'market-qty-all', this.i18n.t('market.all')) as HTMLButtonElement;
      allBtn.type = 'button';
      allBtn.onclick = () => { qtyInput.value = String(max); updateTotal(); };
      qtyInput.oninput = updateTotal;
      updateTotal();
      qtyWrap.append(qtyInput, allBtn, total);

      const action = el('button', 'toggle-button') as HTMLButtonElement;
      action.type = 'button';
      action.textContent = this.i18n.t('market.buyModule');
      const can = this.state.credits >= mod.creditCost;
      action.disabled = !can;
      action.title = can ? '' : this.i18n.t('market.noCredits');
      action.onclick = () => {
        if (!can) return;
        const q = Math.max(1, Math.min(max, parseInt(qtyInput.value, 10) || 1));
        this.cb.onBuyModule?.(mod.id, q);
      };
      row.append(name, meta, priceEl, qtyWrap, action);
      list.appendChild(row);
    }
    this.content.appendChild(list);
  }

  private renderSellModules(): void {
    const list = el('div', 'market-resource-list');
    const ownedCounts = normalizeOwnedModules(this.state.ownedModules);
    const fitted = this.state.fittedModules ?? {};
    let any = false;
    for (const mod of MODULE_DEFINITIONS) {
      const owned = ownedCounts[mod.id] ?? 0;
      if (owned <= 0) continue;
      const fittedCount = fitted[mod.id] ?? 0;
      const free = Math.max(0, owned - fittedCount);
      const price = getModuleSellPrice(mod.id);
      const row = el('div', 'market-res-row market-mod-row');
      const name = el('div', 'market-res-name');
      name.textContent = this.i18n.dir === 'rtl' ? mod.name.ar : mod.name.en;
      const meta = el('div', 'market-res-meta');
      meta.textContent = `${this.i18n.t(`fitting.slot.${mod.slot}` as never)} · ${this.tier(mod.tier)} · ×${owned}`;
      const priceEl = el('div', 'market-res-price', `${formatNumber(price)} cr`);
      const qtyWrap = el('div', 'market-qty');
      if (free > 0) {
        any = true;
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number'; qtyInput.min = '1'; qtyInput.max = String(free); qtyInput.value = '1'; qtyInput.className = 'market-qty-input';
        const allBtn = el('button', 'market-qty-all', this.i18n.t('market.all')) as HTMLButtonElement;
        allBtn.type = 'button';
        const total = el('div', 'market-total');
        const updateTotal = () => {
          const q = Math.max(1, Math.min(free, parseInt(qtyInput.value || '1', 10) || 1));
          qtyInput.value = String(q);
          total.textContent = `${this.i18n.t('market.total')}: ${formatNumber(q * price)} cr`;
        };
        allBtn.onclick = () => { qtyInput.value = String(free); updateTotal(); };
        qtyInput.oninput = updateTotal;
        updateTotal();
        qtyWrap.append(qtyInput, allBtn, total);
        const action = el('button', 'toggle-button') as HTMLButtonElement;
        action.type = 'button';
        action.textContent = this.i18n.t('market.sellModule');
        action.onclick = () => {
          const q = Math.max(1, Math.min(free, parseInt(qtyInput.value, 10) || 1));
          const confirmText = this.i18n.t('market.sellConfirm', {
            name: this.i18n.dir === 'rtl' ? mod.name.ar : mod.name.en,
            qty: q,
            price: formatNumber(q * price),
          });
          // Confirm step for expensive items (4D).
          if (q * price >= MODULE_SELL_CONFIRM_CREDITS && !window.confirm(confirmText)) return;
          this.cb.onSellModule?.(mod.id, q);
          this.showCreditToast(q * price);
        };
        row.append(name, meta, priceEl, qtyWrap, action);
      } else {
        const action = el('button', 'toggle-button') as HTMLButtonElement;
        action.type = 'button';
        action.textContent = this.i18n.t('market.unfitFirst');
        action.disabled = true;
        action.title = this.i18n.t('market.unfitFirst');
        row.append(name, meta, priceEl, qtyWrap, action);
      }
      list.appendChild(row);
    }
    if (!any) {
      list.appendChild(el('div', 'market-placeholder', this.i18n.t('market.noModulesToSell')));
    }
    this.content.appendChild(list);
  }

  /** Station Storage tab: read-only overview of what is parked at the station. */
  private renderStorage(): void {
    const list = el('div', 'market-resource-list');
    let total = 0;
    for (const kind of RESOURCE_ORDER) {
      const inStorage = Math.floor(this.state.storage[kind] ?? 0);
      if (inStorage <= 0) continue;
      total += inStorage;
      const row = el('div', 'market-res-row market-storage-row');
      const name = el('div', 'market-res-name');
      const icon = el('span', 'market-dot');
      icon.dataset.resource = kind;
      name.append(icon, el('span', '', this.i18n.resourceLabel(kind)));
      const meta = el('div', 'market-res-meta');
      meta.innerHTML = `<span>${this.i18n.t('market.inCargo')}: ${Math.floor(this.state.cargo[kind] ?? 0)}</span><span>${this.i18n.t('market.inStorage')}: ${inStorage}</span>`;
      row.append(name, meta);
      list.appendChild(row);
    }
    if (total === 0) {
      list.appendChild(el('div', 'market-placeholder', this.i18n.t('market.storageEmpty')));
    }
    this.content.appendChild(list);
  }

  /** Station Transfer tab: move stacks between the cargo hold and station storage. */
  private renderTransfer(): void {
    const list = el('div', 'market-resource-list');
    for (const kind of RESOURCE_ORDER) {
      const inCargo = Math.floor(this.state.cargo[kind] ?? 0);
      const inStorage = Math.floor(this.state.storage[kind] ?? 0);
      const row = el('div', 'market-res-row market-storage-row');
      const name = el('div', 'market-res-name');
      const icon = el('span', 'market-dot');
      icon.dataset.resource = kind;
      name.append(icon, el('span', '', this.i18n.resourceLabel(kind)));
      const meta = el('div', 'market-res-meta');
      meta.innerHTML = `<span>${this.i18n.t('market.inCargo')}: ${inCargo}</span><span>${this.i18n.t('market.inStorage')}: ${inStorage}</span>`;
      const qtyWrap = el('div', 'market-qty');
      const qtyInput = document.createElement('input');
      qtyInput.type = 'number'; qtyInput.min = '1'; qtyInput.value = '1'; qtyInput.className = 'market-qty-input';
      qtyWrap.append(qtyInput);
      const storeBtn = el('button', 'toggle-button', this.i18n.t('market.store')) as HTMLButtonElement;
      storeBtn.type = 'button'; storeBtn.disabled = inCargo <= 0;
      storeBtn.onclick = () => this.cb.onTransfer?.(kind, parseInt(qtyInput.value, 10) || 1, 'store');
      const withdrawBtn = el('button', 'toggle-button', this.i18n.t('market.withdraw')) as HTMLButtonElement;
      withdrawBtn.type = 'button'; withdrawBtn.disabled = inStorage <= 0;
      withdrawBtn.onclick = () => this.cb.onTransfer?.(kind, parseInt(qtyInput.value, 10) || 1, 'withdraw');
      row.append(name, meta, qtyWrap, storeBtn, withdrawBtn);
      list.appendChild(row);
    }
    this.content.appendChild(list);
  }

  private renderRefine(): void {
    if (this.state.repair && this.state.repair.cost > 0) {
      const repair = el('div', 'market-repair');
      const text = el('div', 'market-repair-text');
      const hull = Math.ceil(this.state.repair.missingHull);
      const shield = Math.ceil(this.state.repair.missingShield);
      text.textContent = `${this.i18n.t('market.repairQuote', { hull, shield })} · ${formatNumber(this.state.repair.cost)} cr`;
      const btn = el('button', 'toggle-button', this.i18n.t('market.repair')) as HTMLButtonElement;
      btn.type = 'button';
      btn.disabled = this.state.credits < this.state.repair.cost;
      btn.onclick = () => this.cb.onRepair?.();
      repair.append(text, btn);
      this.content.appendChild(repair);
    } else {
      const full = el('div', 'market-repair is-full');
      full.textContent = this.i18n.t('market.repairFull');
      this.content.appendChild(full);
    }

    const recipes = el('div', 'market-resource-list');
    for (const recipe of REFINE_RECIPES) {
      const inputName = this.i18n.resourceLabel(recipe.input);
      const outputName = this.i18n.resourceLabel(recipe.output);
      const available = Math.floor((this.state.cargo[recipe.input] ?? 0) + (this.state.storage[recipe.input] ?? 0));
      const row = el('div', 'market-res-row market-refine-row');
      const name = el('div', 'market-res-name', this.i18n.t('refine.recipe', { input: inputName, output: outputName }));
      const meta = el('div', 'market-res-meta');
      meta.textContent = `${recipe.inputAmount} ${inputName} → ${recipe.outputAmount} ${outputName} · ${recipe.timeSeconds}s · ${formatNumber(recipe.creditCost)} cr · ${this.i18n.t('refine.have', { amount: available })}`;
      const btn = el('button', 'toggle-button', this.i18n.t('refine.craft')) as HTMLButtonElement;
      btn.type = 'button';
      const hasInput = available >= recipe.inputAmount;
      const hasCredits = this.state.credits >= recipe.creditCost;
      btn.disabled = !hasInput || !hasCredits;
      btn.title = !hasInput ? this.i18n.t('refine.needInput') : !hasCredits ? this.i18n.t('market.noCredits') : '';
      btn.onclick = () => this.cb.onRefine?.(recipe.id, 1);
      row.append(name, meta, btn);
      recipes.appendChild(row);
    }
    this.content.appendChild(recipes);

    const queueTitle = el('h3', 'market-section-title', this.i18n.t('refine.queue'));
    this.content.appendChild(queueTitle);
    const queue = (this.state.refineryQueue ?? []).filter((job) => !job.completed);
    if (queue.length === 0) {
      this.content.appendChild(el('div', 'market-placeholder', this.i18n.t('refine.noQueue')));
    }
    const now = Date.now();
    for (const job of queue) {
      const recipe = getRecipe(job.recipeId);
      if (!recipe) continue;
      const remaining = Math.ceil(refineJobRemaining(job, now) / 1000);
      const row = el('div', 'market-res-row market-refine-row');
      const name = el('div', 'market-res-name', this.i18n.t('refine.recipe', {
        input: this.i18n.resourceLabel(recipe.input),
        output: this.i18n.resourceLabel(recipe.output),
      }));
      const meta = el('div', 'market-res-meta', remaining > 0
        ? this.i18n.t('refine.working', { seconds: remaining })
        : this.i18n.t('refine.ready'));
      const btn = el('button', 'toggle-button', this.i18n.t('refine.collect')) as HTMLButtonElement;
      btn.type = 'button';
      btn.disabled = remaining > 0;
      btn.onclick = () => this.cb.onCollectRefine?.(job.id);
      row.append(name, meta, btn);
      this.content.appendChild(row);
    }
  }

  private missionRow(mission: MissionOffer, ctx: MissionTextContext): HTMLElement {
    const row = el('div', 'market-res-row market-mission-row');
    const name = el('div', 'market-res-name');
    name.append(
      this.missionTypeIcon(mission.type),
      el('span', 'market-mission-title', missionLabel(mission, ctx)),
    );
    const meta = el('div', 'market-res-meta market-mission-meta');
    const target = el('span', 'market-mission-target', this.i18n.t('mission.target', {
      target: missionTargetLabel(mission, ctx),
    }));
    const danger = el('span', 'market-mission-danger', this.i18n.t('mission.danger', { level: mission.danger ?? 1 }));
    let rewardText = this.i18n.t('mission.reward', { credits: formatNumber(mission.reward) });
    if (mission.moduleReward) {
      const mod = MODULE_DEFINITIONS.find((m) => m.id === mission.moduleReward);
      if (mod) {
        const modName = this.i18n.dir === 'rtl' ? mod.name.ar : mod.name.en;
        rewardText += ` · ${this.i18n.t('mission.moduleReward', { name: modName })}`;
      }
    }
    const reward = el('span', 'market-mission-reward', rewardText);
    meta.append(target, danger, reward);
    row.append(name, meta);
    return row;
  }

  private renderMissions(): void {
    const ctx = this.missionTextContext();
    const accepted = (this.state.missions ?? []).filter((m) => m.accepted);
    const active = accepted.filter((m) => !missionIsReady(m));
    const title = el('h3', 'market-section-title', this.i18n.t('mission.active'));
    this.content.appendChild(title);
    if (accepted.length === 0) {
      this.content.appendChild(el('div', 'market-placeholder', this.i18n.t('mission.empty')));
    }
    for (const mission of accepted) {
      const row = this.missionRow(mission, ctx);
      const pct = Math.min(100, (mission.current / Math.max(1, mission.amount)) * 100);
      const progress = el('div', 'market-mission-progress');
      const bar = el('span', 'mission-progress');
      const fill = el('span');
      fill.style.width = `${pct.toFixed(0)}%`;
      bar.appendChild(fill);
      progress.append(
        bar,
        el('span', 'mission-count', `${Math.floor(mission.current)}/${mission.amount}`),
        el('span', 'mission-status', missionIsReady(mission) ? this.i18n.t('mission.ready') : ''),
      );
      row.querySelector('.market-mission-meta')?.appendChild(progress);
      if (missionIsReady(mission)) {
        const claim = el('button', 'toggle-button is-claim', this.i18n.t('mission.claim')) as HTMLButtonElement;
        claim.type = 'button';
        claim.dataset.missionId = mission.id;
        claim.onclick = () => this.cb.onClaimMission?.(mission.id);
        row.appendChild(claim);
      } else {
        const btn = el('button', 'toggle-button', this.i18n.t('mission.abandon')) as HTMLButtonElement;
        btn.type = 'button';
        btn.onclick = () => this.cb.onAbandonMission?.(mission.id);
        row.appendChild(btn);
      }
      this.content.appendChild(row);
    }

    const boardTitle = el('h3', 'market-section-title', this.i18n.t('mission.board'));
    this.content.appendChild(boardTitle);
    const board = (this.state.missionBoard ?? []).filter((m) => !m.accepted && !m.completed);
    if (board.length === 0) {
      this.content.appendChild(el('div', 'market-placeholder', this.i18n.t('mission.noOffers')));
    }
    for (const mission of board) {
      const row = this.missionRow(mission, ctx);
      const btn = el('button', 'toggle-button', this.i18n.t('mission.accept')) as HTMLButtonElement;
      btn.type = 'button';
      const full = active.length >= MISSION_MAX_ACTIVE;
      btn.disabled = full;
      btn.title = full ? this.i18n.t('mission.full') : '';
      btn.onclick = () => this.cb.onAcceptMission?.(mission.id);
      row.appendChild(btn);
      this.content.appendChild(row);
    }
  }

  private tier(t: string) { return t; }

  /** Visible confirmation inside the station panel (credits, missions). */
  public showToast(message: string): void {
    if (!message) return;
    this.toast.textContent = message;
    this.toast.hidden = false;
    this.toast.classList.add('is-visible');
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('is-visible');
      this.toast.hidden = true;
      this.toastTimer = null;
    }, 2600);
  }

  /** 4D: visible +credits confirmation inside the station panel. */
  private showCreditToast(amount: number): void {
    if (amount <= 0) return;
    this.showToast(`+${formatNumber(Math.floor(amount))} cr`);
  }

  public setHeader(state: { credits: number; cargoUsed?: number; cargoCap?: number }): void {
    this.setState({ credits: state.credits, cargoUsed: state.cargoUsed ?? this.state.cargoUsed, cargoCap: state.cargoCap ?? this.state.cargoCap });
  }

  /** True while the station panel is on screen (used to avoid hidden re-renders). */
  public get isOpen(): boolean {
    return !this.root.hidden;
  }

  public setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.root.classList.toggle('is-active', visible);
    this.root.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (visible) {
      this.refresh();
      // Live countdown for refinery jobs while the station panel is open.
      this.tickTimer = window.setInterval(() => {
        if (this.tab === 'refine') this.renderContent();
      }, 1000);
    }
  }

  public refresh(): void {
    this.title.textContent = this.i18n.t('market.title');
    this.closeButton.setAttribute('aria-label', this.i18n.t('market.close'));
    // Re-translate the grouped tabs on language switches.
    for (const group of TAB_GROUPS) {
      const label = this.tabScroll.querySelector<HTMLElement>(`[data-group="${group.id}"] span`);
      if (label) label.textContent = this.i18n.t(group.labelKey as never);
    }
    for (const button of this.tabButtons.values()) {
      const key = button.dataset.labelKey;
      const label = button.querySelector<HTMLElement>('.market-tab-label');
      if (key && label) label.textContent = this.i18n.t(key as never);
    }
    this.renderHeader();
    this.renderContent();
    this.syncTabArrows();
  }
}
