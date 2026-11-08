import { createButton } from './kit';
import { getShipById } from '../assets-config/ships';
import { MODULE_DEFINITIONS, getModuleById, calculateFitStats, fitModule, unfitModule, validateFit, getAutoFit, normalizeOwnedModules, getAvailableModuleCount, getModuleSellPrice, STARTER_OWNED_MODULE_COUNTS, type OwnedModuleCounts } from '../game/fitting';
import type { PlayerLoadout, SlotType } from '../game/types';
import type { I18n } from './i18n';
import { getModuleIconSvg, getSlotGlyphSvg } from './moduleIcons';

interface FittingPanelOptions {
  shipId: string;
  loadout: PlayerLoadout;
  i18n: I18n;
  ownedModuleIds?: string[];
  ownedCounts?: OwnedModuleCounts;
  /** Copies already fitted on any hull (cannot be sold). */
  fittedModuleCounts?: Record<string, number>;
  onClose: () => void;
  onApply?: (loadout: PlayerLoadout) => void;
  onSellModule?: (moduleId: string, qty: number) => void;
}

export class FittingPanel {
  private el: HTMLDivElement;
  private onClose: () => void;
  private onApply?: (loadout: PlayerLoadout) => void;
  private onSellModule?: (moduleId: string, qty: number) => void;
  private i18n: I18n;
  private loadout: PlayerLoadout;
  private originalLoadout: PlayerLoadout;
  private shipId: string;
  private role: 'combat' | 'support' | 'mining' = 'combat';
  private ownedCounts: OwnedModuleCounts;
  /** Copies available to this hull after copies fitted on other hulls are reserved. */
  private spareCounts: OwnedModuleCounts;
  private fittedModuleCounts: Record<string, number>;
  private moduleListEl: HTMLDivElement;
  private detailEl: HTMLDivElement;
  private statsEl: HTMLDivElement;
  private slotsEl: HTMLDivElement;
  private actionBarEl: HTMLDivElement;
  private applyBtn!: HTMLButtonElement;
  private toastEl: HTMLDivElement;
  private escHandler: (e: KeyboardEvent) => void;

  constructor(opts: FittingPanelOptions) {
    this.shipId = opts.shipId;
    this.loadout = JSON.parse(JSON.stringify(opts.loadout));
    this.originalLoadout = JSON.parse(JSON.stringify(opts.loadout));
    this.onClose = opts.onClose;
    this.onApply = opts.onApply;
    this.onSellModule = opts.onSellModule;
    this.i18n = opts.i18n;
    const hasProvidedInventory = opts.ownedCounts !== undefined || opts.ownedModuleIds !== undefined;
    const rawOwned = opts.ownedCounts ?? (opts.ownedModuleIds as unknown as OwnedModuleCounts | undefined);
    // Starter counts are only a fallback for callers with no inventory at all;
    // an empty profile inventory must stay empty (no free modules after selling out).
    this.ownedCounts = hasProvidedInventory
      ? normalizeOwnedModules(rawOwned)
      : normalizeOwnedModules(STARTER_OWNED_MODULE_COUNTS);
    this.fittedModuleCounts = opts.fittedModuleCounts ?? {};
    this.spareCounts = { ...this.ownedCounts };
    for (const [moduleId, owned] of Object.entries(this.ownedCounts)) {
      const savedOnThisHull = this.originalLoadout.modules.filter((m) => m.moduleId === moduleId).length;
      const elsewhere = Math.max(0, (this.fittedModuleCounts[moduleId] ?? 0) - savedOnThisHull);
      this.spareCounts[moduleId] = Math.max(0, owned - elsewhere);
    }
    const ship = getShipById(this.shipId);
    this.role = ship.hullClass === 'combat' ? 'combat' : ship.hullClass === 'logistics' ? 'support' : 'mining';

    this.el = document.createElement('div');
    this.el.className = 'fitting-screen';
    this.el.setAttribute('dir', this.i18n.dir);

    this.slotsEl = document.createElement('div');
    this.slotsEl.className = 'fitting-slots';
    this.moduleListEl = document.createElement('div');
    this.moduleListEl.className = 'fitting-module-list';
    this.detailEl = document.createElement('div');
    this.detailEl.className = 'fitting-detail';
    this.detailEl.style.display = 'none';
    this.statsEl = document.createElement('div');
    this.statsEl.className = 'fitting-stats';
    this.actionBarEl = document.createElement('div');
    this.actionBarEl.className = 'fitting-action-bar';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'fitting-toast';
    this.toastEl.style.display = 'none';

    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); this.tryClose(); }
    };
    window.addEventListener('keydown', this.escHandler);

    this.render();
    this.setupSlots();
  }

  private t(key: string, fallback?: string | Record<string, string | number>): string {
    try {
      if (fallback && typeof fallback === 'object') return this.i18n.t(key as Parameters<I18n['t']>[0], fallback);
      return this.i18n.t(key as Parameters<I18n['t']>[0]);
    } catch {
      return typeof fallback === 'string' ? fallback : key;
    }
  }

  private isFitted(moduleId: string): boolean {
    return this.loadout.modules.some((m) => m.moduleId === moduleId);
  }

  private unit(key: 'm' | 'mps' | 'm3' | 's' | 'dps' | 'perS'): string {
    return this.t(`unit.${key}`);
  }

  private isDirty(): boolean {
    return JSON.stringify(this.loadout.modules) !== JSON.stringify(this.originalLoadout.modules);
  }

  private tryClose(): void {
    if (this.isDirty()) {
      if (!confirm(this.t('fitting.confirmLeave', 'You have unapplied changes. Leave anyway?'))) return;
    }
    this.destroy();
    this.onClose();
  }

  private destroy(): void { window.removeEventListener('keydown', this.escHandler); }

  private showToast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.style.display = 'block';
    setTimeout(() => { this.toastEl.style.display = 'none'; }, 2000);
  }

  private render(): void {
    this.el.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'fitting-header';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'fitting-back-btn';
    backBtn.innerHTML = `<span class="fitting-back-arrow" aria-hidden="true">←</span><span>${this.t('fitting.back', 'Back')}</span>`;
    backBtn.addEventListener('click', () => this.tryClose());
    const title = document.createElement('h2');
    title.textContent = this.t('menu.fitting', 'Fitting');
    header.append(backBtn, title);

    const main = document.createElement('div');
    main.className = 'fitting-main';
    const leftCol = document.createElement('div');
    leftCol.className = 'fitting-left';
    const hull = document.createElement('div');
    hull.className = 'fitting-hull-preview';
    hull.innerHTML = '<div class="fitting-hull-ring"></div><div class="fitting-hull-model fitting-hull-model--3d"></div>';
    leftCol.append(hull, this.slotsEl);
    const rightCol = document.createElement('div');
    rightCol.className = 'fitting-right';
    rightCol.append(this.statsEl, this.moduleListEl, this.detailEl);
    main.append(leftCol, rightCol);

    this.renderActionBar();
    this.el.append(header, main, this.actionBarEl, this.toastEl);
    this.updateStats();
    this.updateDirty();
  }

  private renderActionBar(): void {
    this.actionBarEl.innerHTML = '';
    const reset = createButton({ label: this.t('fitting.reset', 'Reset'), onClick: () => this.reset() });
    const auto = createButton({ label: this.t('fitting.autofit', 'Auto-fit'), onClick: () => this.autoFit() });
    this.applyBtn = document.createElement('button');
    this.applyBtn.type = 'button';
    this.applyBtn.className = 'ui-button ui-button--solid is-primary fitting-apply-btn';
    this.applyBtn.addEventListener('click', () => this.apply());
    this.updateApplyLabel();
    this.actionBarEl.append(reset, auto, this.applyBtn);
  }

  private updateApplyLabel(): void {
    if (!this.applyBtn) return;
    const dirty = this.isDirty();
    this.applyBtn.innerHTML = dirty
      ? `<span>${this.t('fitting.apply', 'Apply fitting')}</span><span class="fitting-unsaved-badge" title="${this.t('fitting.dirty', 'Unsaved')}"></span>`
      : `<span>${this.t('fitting.apply', 'Apply fitting')}</span>`;
  }

  private updateDirty(): void { this.updateApplyLabel(); }

  private apply(): void {
    this.originalLoadout = JSON.parse(JSON.stringify(this.loadout));
    if (this.onApply) this.onApply(this.loadout);
    this.updateDirty();
    this.showToast(this.t('fitting.applied', 'Fitting applied'));
  }

  private reset(): void {
    this.loadout = JSON.parse(JSON.stringify(this.originalLoadout));
    this.detailEl.style.display = 'none';
    this.updateSlotVisuals();
    this.updateStats();
    this.updateDirty();
  }

  private autoFit(): void {
    this.loadout = getAutoFit(this.loadout, this.role, this.spareCounts);
    this.detailEl.style.display = 'none';
    this.updateSlotVisuals();
    this.updateStats();
    this.updateDirty();
  }

  private setupSlots(): void {
    this.slotsEl.innerHTML = '';
    const ship = getShipById(this.shipId);
    const createSlot = (type: SlotType, index: number, style: Partial<CSSStyleDeclaration>) => {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = `fitting-slot fitting-slot-${type}`;
      slot.dataset.type = type;
      slot.dataset.index = String(index);
      Object.assign(slot.style, style);
      slot.onclick = () => this.openModuleList(type, index);
      this.slotsEl.appendChild(slot);
    };
    for (let i = 0; i < ship.highSlots; i++) createSlot('high', i, { top: '8%', left: `${50 + (i - (ship.highSlots - 1) / 2) * 14}%` });
    for (let i = 0; i < ship.midSlots; i++) createSlot('mid', i, { top: `${46 + (i - (ship.midSlots - 1) / 2) * 11}%`, left: i % 2 === 0 ? '12%' : '88%' });
    for (let i = 0; i < ship.lowSlots; i++) createSlot('low', i, { bottom: '8%', left: `${50 + (i - (ship.lowSlots - 1) / 2) * 14}%` });
    this.updateSlotVisuals();
  }

  private fittedInSlot(type: SlotType, index: number) {
    return this.loadout.modules.find(m => m.slotIndex === index && getModuleById(m.moduleId)?.slot === type);
  }

  private updateSlotVisuals(): void {
    const slots = this.slotsEl.querySelectorAll('.fitting-slot');
    slots.forEach((slot) => {
      const type = slot.getAttribute('data-type') as SlotType;
      const index = parseInt(slot.getAttribute('data-index') || '0', 10);
      const fitted = this.fittedInSlot(type, index);
      if (fitted) {
        const module = getModuleById(fitted.moduleId);
        slot.classList.add('fitting-slot-filled');
        const icon = module ? getModuleIconSvg(module.type as Parameters<typeof getModuleIconSvg>[0], module.tier) : '';
        (slot as HTMLElement).innerHTML = `<span class="fitting-slot-icon">${icon}</span><span class="fitting-slot-tier tier-${module?.tier || 'I'}">${module?.tier || ''}</span>`;
        (slot as HTMLElement).title = module ? (this.i18n.dir === 'rtl' ? module.name.ar : module.name.en) : '';
      } else {
        slot.classList.remove('fitting-slot-filled');
        (slot as HTMLElement).innerHTML = `<span class="fitting-slot-glyph">${getSlotGlyphSvg(type)}</span>`;
        (slot as HTMLElement).title = this.t('fitting.emptySlot');
      }
    });
  }

  private openModuleList(slotType: SlotType, slotIndex: number): void {
    this.detailEl.style.display = 'none';
    this.moduleListEl.innerHTML = '';
    this.moduleListEl.style.display = 'flex';

    const header = document.createElement('div');
    header.className = 'fitting-module-header';
    header.textContent = `${this.t(`fitting.slot.${slotType}`, slotType.toUpperCase())} ${slotIndex + 1}`;
    this.moduleListEl.appendChild(header);

    const modules = MODULE_DEFINITIONS.filter((m) => m.slot === slotType && ((this.ownedCounts[m.id] ?? 0) > 0 || this.isFitted(m.id)));
    if (modules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'fitting-module-empty';
      empty.textContent = this.t('fitting.notOwned');
      this.moduleListEl.appendChild(empty);
    }
    for (const module of modules) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'fitting-module-item';
      const validation = validateFit(this.loadout, module.id, slotIndex, slotType, this.spareCounts);
      const owned = this.ownedCounts[module.id] ?? 0;
      const free = getAvailableModuleCount(this.spareCounts, this.loadout, module.id, slotIndex, slotType);
      const name = this.i18n.dir === 'rtl' ? module.name.ar : module.name.en;
      const icon = getModuleIconSvg(module.type as Parameters<typeof getModuleIconSvg>[0], module.tier);
      const statLine = this.statLine(module);
      const reason = !validation.valid ? this.localizeReason(validation.reason || '') : '';
      item.innerHTML = `
        <span class="fitting-module-icon">${icon}<span class="fitting-tier tier-${module.tier}">${module.tier}</span></span>
        <span class="fitting-module-info">
          <span class="fitting-module-name">${name}</span>
          <span class="fitting-module-stats">${this.t('fitting.cpu','CPU')} ${module.cpu} · ${this.t('fitting.power','PG')} ${module.powergrid}${statLine ? ' · ' + statLine : ''}</span>
          <span class="fitting-module-owned">${this.t('fitting.ownedFree', { owned, free })}</span>
          ${reason ? `<span class="fitting-module-reason">${reason}</span>` : ''}
        </span>
        <span class="fitting-module-cost">${module.creditCost} cr</span>
      `;
      if (!validation.valid) item.classList.add('is-disabled');
      item.onclick = () => this.showDetail(module, slotType, slotIndex, validation.valid, reason);
      this.moduleListEl.appendChild(item);
    }

    const unfit = createButton({ label: this.t('fitting.unfit', 'Unfit'), onClick: () => {
      this.loadout = unfitModule(this.loadout, slotIndex, slotType);
      this.detailEl.style.display = 'none';
      this.updateSlotVisuals(); this.updateStats(); this.updateDirty();
      this.openModuleList(slotType, slotIndex);
    }});
    unfit.style.marginTop = '8px';
    this.moduleListEl.appendChild(unfit);
  }

  private localizeReason(reason: string): string {
    if (!reason) return '';
    if (reason.toLowerCase().includes('cpu')) return this.t('fitting.notEnoughCpu');
    if (reason.toLowerCase().includes('power')) return this.t('fitting.notEnoughPower');
    if (reason.toLowerCase().includes('copies')) return this.t('fitting.noFreeCopies');
    return reason;
  }

  private statLine(module: ReturnType<typeof getModuleById>): string {
    if (!module) return '';
    const m = this.unit('m');
    const mps = this.unit('mps');
    const s = this.unit('s');
    if (module.dps) return `${module.dps} ${this.unit('dps')}`;
    if (module.alphaDamage) return `${module.alphaDamage} / ${s}`;
    if (module.miningYield) return `${module.miningYield}${this.unit('perS')}`;
    if (module.repairRate) return `${module.repairRate}${this.unit('perS')}`;
    if (module.range) return `${module.range} ${m}`;
    if (module.effects?.speedBoost) return `+${module.effects.speedBoost} ${mps}`;
    return '';
  }

  private showDetail(module: NonNullable<ReturnType<typeof getModuleById>>, slotType: SlotType, slotIndex: number, canFit: boolean, reason: string): void {
    this.detailEl.style.display = 'block';
    this.detailEl.innerHTML = '';
    const name = this.i18n.dir === 'rtl' ? module.name.ar : module.name.en;
    const desc = this.i18n.dir === 'rtl' ? module.description.ar : module.description.en;
    const current = this.fittedInSlot(slotType, slotIndex);
    const curMod = current ? getModuleById(current.moduleId) : undefined;

    const head = document.createElement('div');
    head.className = 'fitting-detail__head';
    head.innerHTML = `<strong>${name}</strong> <span class="fitting-tier tier-${module.tier}">${module.tier}</span>`;
    const body = document.createElement('div');
    body.className = 'fitting-detail__body';
    body.innerHTML = `<div><em>${this.t('fitting.whatItDoes')}:</em> ${desc}</div>`;

    const cmp = document.createElement('div');
    cmp.className = 'fitting-detail__compare';
    cmp.innerHTML = `<div class="fitting-detail__cmp-title">${this.t('fitting.compare')} ${this.t('fitting.currentlyFitted')}: ${curMod ? (this.i18n.dir==='rtl'?curMod.name.ar:curMod.name.en) : this.t('fitting.noneFitted')}</div>`;
    const rows = this.compareRows(module, curMod);
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'fitting-cmp-row ' + (r.delta > 0 ? 'is-up' : r.delta < 0 ? 'is-down' : 'is-same');
      const sign = r.delta > 0 ? '▲' : r.delta < 0 ? '▼' : '•';
      row.innerHTML = `<span>${r.label}</span><span>${r.cur} → ${r.next} <b>${sign}</b></span>`;
      cmp.appendChild(row);
    }
    if (reason) {
      const warn = document.createElement('div');
      warn.className = 'fitting-detail__warn';
      warn.textContent = reason;
      body.appendChild(warn);
    }

    const actions = document.createElement('div');
    actions.className = 'fitting-detail__actions';
    const fitBtn = createButton({ label: this.t('fitting.tapToFit'), onClick: () => {
      if (!canFit) return;
      this.loadout = fitModule(this.loadout, module.id, slotIndex, slotType, this.spareCounts);
      this.detailEl.style.display = 'none';
      this.updateSlotVisuals(); this.updateStats(); this.updateDirty();
      this.openModuleList(slotType, slotIndex);
    }});
    if (!canFit) fitBtn.setAttribute('disabled', 'true');
    actions.appendChild(fitBtn);

    // Copies fitted on other saved hulls are locked; copies in the current
    // (possibly unapplied) loadout are reserved too, so unsaved fits cannot be
    // sold out from under the player.
    const savedOnThisHull = this.originalLoadout.modules.filter((m) => m.moduleId === module.id).length;
    const savedOnOtherHulls = Math.max(0, (this.fittedModuleCounts[module.id] ?? 0) - savedOnThisHull);
    const localFitted = this.loadout.modules.filter((m) => m.moduleId === module.id).length;
    // Free against both the saved profile fit and the local draft: the smaller
    // of the two, so an unfitted draft copy cannot be sold while still saved.
    const reservedOnThisHull = Math.max(savedOnThisHull, localFitted);
    const sellable = Math.max(0, (this.ownedCounts[module.id] ?? 0) - savedOnOtherHulls - reservedOnThisHull);
    if (this.onSellModule && sellable > 0) {
      const price = getModuleSellPrice(module.id);
      const sellBtn = createButton({
        label: `${this.t('fitting.sellModule', 'Sell')} +${price} cr`,
        onClick: () => {
          if (!this.onSellModule) return;
          this.ownedCounts[module.id] = Math.max(0, (this.ownedCounts[module.id] ?? 0) - 1);
          this.spareCounts[module.id] = Math.max(0, (this.spareCounts[module.id] ?? 0) - 1);
          this.onSellModule(module.id, 1);
          this.showToast(`+${price} cr`);
          this.openModuleList(slotType, slotIndex);
        },
      });
      sellBtn.classList.add('fitting-sell-btn');
      actions.appendChild(sellBtn);
    }
    this.detailEl.append(head, body, cmp, actions);
  }

  private compareRows(next: NonNullable<ReturnType<typeof getModuleById>>, cur: ReturnType<typeof getModuleById> | undefined) {
    const m = this.unit('m'); const dps = this.unit('dps'); const ps = this.unit('perS');
    const val = (mod: typeof cur, key: string): number => {
      if (!mod) return 0;
      const anym = mod as unknown as Record<string, unknown>;
      if (typeof anym[key] === 'number') return anym[key] as number;
      const eff = (mod.effects || {}) as Record<string, number>;
      return typeof eff[key] === 'number' ? eff[key] : 0;
    };
    const mk = (label: string, key: string, unit: string) => {
      const cv = val(cur, key); const nv = val(next, key); return { label, cur: `${cv}${unit}`, next: `${nv}${unit}`, delta: nv - cv };
    };
    return [
      { label: this.t('fitting.damage'), cur: `${val(cur,'dps')}${dps}`, next: `${val(next,'dps')}${dps}`, delta: val(next,'dps') - val(cur,'dps') },
      { label: this.t('fitting.range'), cur: `${val(cur,'range')}${m}`, next: `${val(next,'range')}${m}`, delta: val(next,'range') - val(cur,'range') },
      mk(this.t('fitting.mining'), 'miningYield', ps),
      mk(this.t('fitting.repair'), 'repairRate', ps),
      mk(this.t('fitting.cpu'), 'cpu', ''),
      mk(this.t('fitting.power'), 'powergrid', ''),
    ].filter(r => !(r.cur === `0${dps}` && r.next === `0${dps}` && r.label === this.t('fitting.damage')) || r.delta !== 0);
  }

  private updateStats(): void {
    const stats = calculateFitStats(this.loadout);
    const m = this.unit('m'); const mps = this.unit('mps'); const ps = this.unit('perS'); const dpsu = this.unit('dps'); const m3 = this.unit('m3');
    const row = (label: string, val: string) => `<div class="fitting-stat-row"><span class="fitting-stat-label">${label}</span><span class="fitting-stat-val">${val}</span></div>`;
    this.statsEl.innerHTML = `
      <div class="fitting-stats-title">${this.t('fitting.stats','Ship stats')}</div>
      ${row(this.t('fitting.damage','Damage'), `${stats.dps} ${dpsu}`)}
      ${row(this.t('fitting.range','Range'), `${stats.range} ${m}`)}
      ${row(this.t('fitting.shield','Shield'), `${stats.maxShield}`)}
      ${row(this.t('fitting.hull','Hull'), `${stats.maxHull}`)}
      ${row(this.t('fitting.speed','Speed'), `${stats.speed} ${mps}`)}
      ${row(this.t('fitting.mining','Mining'), `${stats.miningYield}${ps}`)}
      ${row(this.t('fitting.cargo','Cargo'), `${stats.cargoCapacity} ${m3}`)}
      ${row(this.t('fitting.repair','Repair'), `${stats.repairRate}${ps}`)}
      <div class="fitting-bar"><span>${this.t('fitting.cpu','CPU')}</span><div class="fitting-bar-track"><div class="fitting-bar-fill" style="width:${Math.min(100,(stats.cpuUsed/stats.cpuCapacity)*100)}%"></div></div><span>${stats.cpuUsed}/${stats.cpuCapacity}</span></div>
      <div class="fitting-bar"><span>${this.t('fitting.power','Power Grid')}</span><div class="fitting-bar-track"><div class="fitting-bar-fill" style="width:${Math.min(100,(stats.powerUsed/stats.powerCapacity)*100)}%"></div></div><span>${stats.powerUsed}/${stats.powerCapacity}</span></div>
    `;
  }

  getElement(): HTMLElement { return this.el; }
  getLoadout(): PlayerLoadout { return this.loadout; }
}
