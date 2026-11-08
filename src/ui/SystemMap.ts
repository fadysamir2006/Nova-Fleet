import type { I18n } from './i18n';
import { el, ICONS } from './dom';
import { createIconButton } from './kit';
import { SOLAR_SYSTEM } from '../game/solarSystem';
import { ZONES } from '../game/worldData';
import type { ResourceKind } from '../game/types';

export interface SystemMapCallbacks {
  onWarp: (targetId: string) => void;
  onSetDestination?: (targetId: string) => void;
  onLaunch?: () => void;
  onClose: () => void;
}

export interface SystemMapState {
  mode: 'menu' | 'flight';
  currentZoneId?: string;
  startingZoneId?: string;
  inCombat?: boolean;
  launchReady?: boolean;
}

interface MapTarget {
  id: string;
  name: { en: string; ar: string };
  kind: 'planet' | 'station' | 'gate' | 'debris' | 'nebula';
  orbit: number; // visual radius factor
  angle: number;
  color: string;
  resource?: ResourceKind;
  danger: number;
  description: { en: string; ar: string };
  behindGate?: boolean;
  services?: string[];
  warpTime: number;
}

const TARGET_COLORS: Record<MapTarget['kind'], string> = {
  planet: '#7dffb1',
  station: '#5fdcff',
  gate: '#b388ff',
  debris: '#ffb36b',
  nebula: '#8ef0ff',
};

function buildTargets(): MapTarget[] {
  const targets: MapTarget[] = [];
  for (const p of SOLAR_SYSTEM.planets) {
    const kind = p.id === 'solace' ? 'station' : p.id === 'nexus_gate' ? 'gate' : 'planet';
    const color =
      kind === 'station' ? TARGET_COLORS.station :
      kind === 'gate' ? TARGET_COLORS.gate :
      p.type === 'gasgiant' ? '#d4a574' : p.type === 'ice' ? '#b8e0ff' : p.type === 'volcanic' ? '#ff6b35' : p.type === 'terran' ? '#7dffb1' : '#aab';
    targets.push({
      id: p.id,
      name: p.name,
      kind,
      orbit: Math.max(1, p.orbitIndex + 1),
      angle: p.orbitIndex * 0.82 + 0.4,
      color,
      resource: p.uniqueResource,
      danger: kind === 'station' ? 1 : kind === 'gate' ? 2 : Math.min(5, Math.max(1, p.orbitIndex + 1)),
      description: p.description,
      behindGate: false,
      services: p.id === 'solace' ? ['market', 'colony', 'repair'] : undefined,
      warpTime: 2 + Math.min(6, p.orbitIndex),
    });
  }
  // Zones behind Nexus gate (Derelict Debris Field, Nebula Pocket)
  const debris = ZONES.find(z => z.id === 'debris-field');
  const nebula = ZONES.find(z => z.id === 'nebula-pocket');
  if (debris) {
    targets.push({
      id: debris.id,
      name: debris.name,
      kind: 'debris',
      orbit: 8.2,
      angle: 5.1,
      color: TARGET_COLORS.debris,
      resource: debris.uniqueResources[0],
      danger: debris.dangerLevel,
      description: debris.description,
      behindGate: true,
      warpTime: 6,
    });
  }
  if (nebula) {
    targets.push({
      id: nebula.id,
      name: nebula.name,
      kind: 'nebula',
      orbit: 9.0,
      angle: 5.75,
      color: TARGET_COLORS.nebula,
      resource: nebula.uniqueResources[0],
      danger: nebula.dangerLevel,
      description: nebula.description,
      behindGate: true,
      warpTime: 7,
    });
  }
  return targets;
}

export class SystemMap {
  public readonly root: HTMLDivElement;
  private readonly i18n: I18n;
  private readonly cb: SystemMapCallbacks;
  private readonly targets = buildTargets();
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly detailEl: HTMLDivElement;
  private readonly nextLaunchEl: HTMLDivElement;
  private readonly actionBtn: HTMLButtonElement;
  private readonly actionReason: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly zoomInBtn: HTMLButtonElement;
  private readonly zoomOutBtn: HTMLButtonElement;

  private state: SystemMapState = { mode: 'menu', startingZoneId: 'nova-prime', currentZoneId: 'nova-prime' };
  private selectedId: string | null = null;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOffX = 0;
  private dragOffY = 0;
  private pinchDist = 0;
  private visible = false;
  private raf = 0;

  constructor(root: HTMLElement, i18n: I18n, cb: SystemMapCallbacks) {
    this.i18n = i18n;
    this.cb = cb;
    this.root = el('div', 'overlay overlay--map');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');

    const scrim = el('div', 'overlay__scrim');
    scrim.addEventListener('click', () => this.close());

    const panel = el('div', 'overlay__panel overlay__panel--wide sysmap-panel');
    const head = el('div', 'overlay__head');
    const headText = el('div', 'overlay__head-text');
    headText.append(el('span', 'overlay__eyebrow', 'NOVA PRIME'), this.title = el('h2', 'overlay__title'));
    this.closeBtn = createIconButton({ label: i18n.t('map.close'), icon: ICONS.close, onClick: () => this.close() });
    head.append(headText, this.closeBtn);

    this.nextLaunchEl = el('div', 'sysmap-nextlaunch');

    const body = el('div', 'sysmap-body');
    const mapWrap = el('div', 'sysmap-mapwrap');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sysmap-canvas';
    this.ctx = this.canvas.getContext('2d');
    const controls = el('div', 'sysmap-controls');
    this.zoomInBtn = this.mkCtrl('+', i18n.t('map.zoomIn'), () => this.zoom(1.18));
    this.zoomOutBtn = this.mkCtrl('−', i18n.t('map.zoomOut'), () => this.zoom(1 / 1.18));
    this.resetBtn = this.mkCtrl('◎', i18n.t('map.recenter'), () => this.recenter());
    controls.append(this.zoomInBtn, this.zoomOutBtn, this.resetBtn);
    mapWrap.append(this.canvas, controls);

    this.detailEl = el('div', 'sysmap-detail');
    body.append(mapWrap, this.detailEl);

    const footer = el('div', 'sysmap-footer');
    this.actionReason = el('div', 'sysmap-reason');
    this.actionBtn = el('button', 'launch-button sysmap-action') as HTMLButtonElement;
    this.actionBtn.type = 'button';
    this.actionBtn.addEventListener('click', () => this.doAction());
    footer.append(this.actionReason, this.actionBtn);

    panel.append(head, this.nextLaunchEl, body, footer);
    this.root.append(scrim, panel);
    root.appendChild(this.root);

    this.bindInput();
    this.refresh();
  }

  private mkCtrl(text: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'sysmap-ctrl', text) as HTMLButtonElement;
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  private bindInput(): void {
    this.canvas.addEventListener('mousedown', (e) => {
      this.dragging = true; this.dragStartX = e.clientX; this.dragStartY = e.clientY; this.dragOffX = this.offsetX; this.dragOffY = this.offsetY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.offsetX = this.dragOffX + (e.clientX - this.dragStartX);
      this.offsetY = this.dragOffY + (e.clientY - this.dragStartY);
      this.draw();
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1 / 1.12 : 1.12); }, { passive: false });
    this.canvas.addEventListener('click', (e) => {
      if (Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY) > 6) return;
      this.pick(e);
    });
    // touch pan/pinch
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        this.dragging = true; this.dragStartX = t.clientX; this.dragStartY = t.clientY; this.dragOffX = this.offsetX; this.dragOffY = this.offsetY;
      } else if (e.touches.length === 2) {
        this.pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.dragging) {
        const t = e.touches[0];
        this.offsetX = this.dragOffX + (t.clientX - this.dragStartX);
        this.offsetY = this.dragOffY + (t.clientY - this.dragStartY);
        this.draw();
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (this.pinchDist > 0) this.zoom(d / this.pinchDist);
        this.pinchDist = d;
      }
    }, { passive: true });
    this.canvas.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) this.dragging = false;
      if (e.changedTouches.length === 1 && Math.hypot(e.changedTouches[0].clientX - this.dragStartX, e.changedTouches[0].clientY - this.dragStartY) < 8) {
        this.pick(e.changedTouches[0]);
      }
    }, { passive: true });
  }

  private zoom(f: number): void {
    this.scale = Math.max(0.5, Math.min(3.5, this.scale * f));
    this.draw();
  }
  private recenter(): void { this.offsetX = 0; this.offsetY = 0; this.scale = 1; this.draw(); }

  private resize(): void {
    const r = this.canvas.parentElement?.getBoundingClientRect();
    if (!r) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(280, Math.floor(r.width));
    const h = Math.max(220, Math.floor(r.height));
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
  }

  private worldToScreen(orbit: number, angle: number): { x: number; y: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cx = (this.canvas.width / dpr) / 2 + this.offsetX;
    const cy = (this.canvas.height / dpr) / 2 + this.offsetY;
    const base = Math.min(this.canvas.width / dpr, this.canvas.height / dpr) * 0.085 * this.scale;
    const r = orbit * base;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  }

  private pick(e: { clientX: number; clientY: number }): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: MapTarget | null = null;
    let bestD = 22;
    for (const t of this.targets) {
      const p = this.worldToScreen(t.orbit, t.angle);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best) {
      this.selectedId = best.id;
      this.draw();
      this.renderDetail();
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.resize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#020812';
    ctx.fillRect(0, 0, w, h);

    const center = this.worldToScreen(0, 0);
    const base = Math.min(w, h) * 0.085 * this.scale;

    // orbit rings
    for (let i = 1; i <= 9; i++) {
      ctx.strokeStyle = i >= 8 ? 'rgba(179,136,255,0.18)' : 'rgba(95,220,255,0.14)';
      ctx.lineWidth = i >= 8 ? 1.2 : 1;
      if (i >= 8) ctx.setLineDash([4, 6]); else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, i * base, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // gate divider hint
    const gate = this.targets.find(t => t.kind === 'gate');
    if (gate) {
      ctx.strokeStyle = 'rgba(179,136,255,0.22)';
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(center.x, center.y, gate.orbit * base + base * 0.4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // dashed route
    const sel = this.targets.find(t => t.id === this.selectedId);
    const cur = this.targets.find(t => t.id === (this.state.mode === 'flight' ? this.state.currentZoneId : this.state.startingZoneId));
    if (sel && cur && sel.id !== cur.id) {
      const a = this.worldToScreen(cur.orbit, cur.angle);
      const b = this.worldToScreen(sel.orbit, sel.angle);
      ctx.strokeStyle = 'rgba(125,255,177,0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // star
    const sg = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 18 * this.scale);
    sg.addColorStop(0, '#fff7dd');
    sg.addColorStop(0.4, '#ffcf70');
    sg.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(center.x, center.y, 18 * this.scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff4d6';
    ctx.beginPath(); ctx.arc(center.x, center.y, 5 * this.scale, 0, Math.PI * 2); ctx.fill();

    // targets
    for (const t of this.targets) {
      const p = this.worldToScreen(t.orbit, t.angle);
      const selected = t.id === this.selectedId;
      const isCurrent = t.id === (this.state.mode === 'flight' ? this.state.currentZoneId : this.state.startingZoneId);
      const r = (t.kind === 'station' || t.kind === 'gate' ? 5 : t.kind === 'planet' ? 6.5 : 5.5) * Math.max(0.8, this.scale);
      if (selected) {
        ctx.strokeStyle = 'rgba(125,255,177,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2); ctx.stroke();
      }
      if (isCurrent) {
        ctx.strokeStyle = 'rgba(95,220,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = t.color;
      ctx.beginPath();
      if (t.kind === 'gate') {
        // diamond
        ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath();
      } else if (t.kind === 'station') {
        ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      } else {
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = 'rgba(240,248,255,0.92)';
      ctx.font = `${Math.max(10, 11 * Math.max(0.85, this.scale))}px Rajdhani, Segoe UI, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(t.name[this.i18n.lang === 'ar' ? 'ar' : 'en'], p.x + r + 5, p.y + 4);
    }

    // player marker (flight mode)
    if (this.state.mode === 'flight' && cur) {
      const p = this.worldToScreen(cur.orbit, cur.angle);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 13); ctx.lineTo(p.x - 4, p.y - 6); ctx.lineTo(p.x + 4, p.y - 6); ctx.closePath(); ctx.fill();
    }

    ctx.restore();
  }

  private targetById(id: string | null | undefined): MapTarget | null {
    return this.targets.find(t => t.id === id) ?? null;
  }

  private serviceLabel(id: string): string {
    const map: Record<string, string> = {
      market: 'menu.nav.market',
      colony: 'menu.nav.colony',
      repair: 'service.repair',
    };
    const key = map[id];
    if (!key) return id;
    try { return this.i18n.t(key as Parameters<I18n['t']>[0]); } catch { return id; }
  }

  private renderDetail(): void {
    const t = this.targetById(this.selectedId);
    const lang = this.i18n.lang === 'ar' ? 'ar' : 'en';
    if (!t) {
      this.detailEl.innerHTML = `<div class="sysmap-empty">${this.i18n.t('map.select')}</div>`;
      this.actionBtn.disabled = true;
      this.actionBtn.textContent = this.i18n.t('map.selectTarget');
      this.actionReason.textContent = '';
      return;
    }
    const resName = t.resource ? this.i18n.resourceLabel(t.resource) : '—';
    const dangerDots = '●'.repeat(t.danger) + '○'.repeat(Math.max(0, 5 - t.danger));
    this.detailEl.innerHTML = `
      <div class="sysmap-detail__name">${t.name[lang]}</div>
      <div class="sysmap-detail__desc">${t.description[lang]}</div>
      <div class="sysmap-detail__row"><span>${this.i18n.t('map.danger')}</span><b>${dangerDots}</b></div>
      <div class="sysmap-detail__row"><span>${this.i18n.t('map.resources')}</span><b>${resName}</b></div>
      <div class="sysmap-detail__row"><span>${this.i18n.t('map.warpTime')}</span><b>${t.warpTime}s</b></div>
      ${t.services ? `<div class="sysmap-detail__row"><span>${this.i18n.t('map.services')}</span><b>${t.services.map((s) => this.serviceLabel(s)).join(' · ')}</b></div>` : ''}
      ${t.behindGate ? `<div class="sysmap-detail__gate">${this.i18n.t('map.behindGate')}</div>` : ''}
    `;
    this.updateAction(t);
  }

  private updateAction(t: MapTarget): void {
    let label: string;
    let disabled = false;
    let reason = '';
    if (this.state.mode === 'menu') {
      const isStart = this.state.startingZoneId === t.id;
      label = isStart ? this.i18n.t('map.launchHere') : this.i18n.t('map.setDestination');
      if (!this.state.launchReady) reason = this.i18n.t('menu.loading');
    } else {
      const isHere = this.state.currentZoneId === t.id;
      label = this.i18n.t('map.warp');
      if (isHere) { disabled = true; reason = this.i18n.t('map.alreadyHere'); }
      else if (this.state.inCombat) { disabled = true; reason = this.i18n.t('map.warpDisabledCombat'); }
    }
    this.actionBtn.textContent = label;
    this.actionBtn.disabled = disabled;
    this.actionReason.textContent = reason;
  }

  private doAction(): void {
    const t = this.targetById(this.selectedId);
    if (!t) return;
    if (this.state.mode === 'menu') {
      if (this.state.startingZoneId !== t.id) {
        this.state.startingZoneId = t.id;
        this.cb.onSetDestination?.(t.id);
        this.renderNextLaunch();
        this.draw();
        this.renderDetail();
      } else {
        if (!this.state.launchReady) return;
        this.cb.onLaunch?.();
      }
    } else {
      if (this.actionBtn.disabled) return;
      this.cb.onWarp(t.id);
    }
  }

  private renderNextLaunch(): void {
    const t = this.targetById(this.state.startingZoneId ?? 'nova-prime');
    const name = t ? t.name[this.i18n.lang === 'ar' ? 'ar' : 'en'] : (this.state.startingZoneId ?? 'Nova Prime');
    this.nextLaunchEl.textContent = `${this.i18n.t('map.nextLaunch')}: ${name}`;
    this.nextLaunchEl.hidden = this.state.mode !== 'menu';
  }

  public setState(next: Partial<SystemMapState>): void {
    this.state = { ...this.state, ...next };
    if (!this.selectedId) this.selectedId = this.state.startingZoneId ?? this.state.currentZoneId ?? null;
    this.renderNextLaunch();
    this.renderDetail();
    this.draw();
  }

  public setVisible(v: boolean): void {
    this.visible = v;
    this.root.hidden = !v;
    this.root.classList.toggle('is-active', v);
    if (v) {
      this.refresh();
      cancelAnimationFrame(this.raf);
      const tick = () => { if (!this.visible) return; this.draw(); this.raf = requestAnimationFrame(tick); };
      this.raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(this.raf);
      this.cb.onClose();
    }
  }

  public close(): void { this.setVisible(false); }
  public get isVisible(): boolean { return this.visible; }

  public refresh(): void {
    this.title.textContent = this.i18n.t('map.title');
    this.closeBtn.setAttribute('aria-label', this.i18n.t('map.close'));
    this.zoomInBtn.title = this.i18n.t('map.zoomIn');
    this.zoomOutBtn.title = this.i18n.t('map.zoomOut');
    this.resetBtn.title = this.i18n.t('map.recenter');
    this.renderNextLaunch();
    this.renderDetail();
    if (this.visible) this.draw();
  }
}