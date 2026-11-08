import { createIconButton } from './kit';
import { RESOURCES, RESOURCE_ORDER } from '../assets-config';
import { RESOURCE_INFO, ZONES, REFINE_RECIPES } from '../game/worldData';
import { el, clear } from './dom';
import type { I18n } from './i18n';
import type { ResourceKind } from '../game/types';

type ShapeKind = 'chunk' | 'crystal' | 'magma' | 'lattice' | 'canister' | 'ingot';
const SHAPE_BY_RESOURCE: Record<ResourceKind, ShapeKind> = {
  ferrite: 'chunk', aurium: 'chunk', cryonite: 'crystal', hexite: 'crystal', thryxium: 'crystal',
  magmarite: 'magma', nanocarbon: 'lattice', isotopes: 'canister', alloys: 'ingot',
};

function drawPreview(canvas: HTMLCanvasElement, kind: ResourceKind, t: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const info = RESOURCES[kind];
  const shape = SHAPE_BY_RESOURCE[kind];
  const rot = t * 0.0012;
  const tilt = 0.55 + Math.sin(t * 0.0007) * 0.08;
  const c = Math.cos(rot), s = Math.sin(rot);
  const project = (x: number, y: number, z: number) => {
    const rx = x * c - z * s;
    const rz = x * s + z * c;
    const ry = y * Math.cos(tilt) - rz * Math.sin(tilt);
    const rz2 = y * Math.sin(tilt) + rz * Math.cos(tilt);
    const p = 1 / (1 + rz2 * 0.35);
    return { x: cx + rx * 52 * p, y: cy + ry * 52 * p, d: rz2 };
  };
  const faces: Array<{ pts: Array<{x:number;y:number;d:number}>; shade: number }> = [];
  const poly = (pts3: [number,number,number][], shade: number) => {
    faces.push({ pts: pts3.map(([x,y,z]) => project(x,y,z)), shade });
  };
  if (shape === 'crystal') {
    const top:[number,number,number]=[0,-1.2,0], bot:[number,number,number]=[0,1.2,0];
    const ring:[[number,number,number],[number,number,number]][] = [[[0.7,0,0],[0,0,0.7]],[[0,0,0.7],[-0.7,0,0]],[[-0.7,0,0],[0,0,-0.7]],[[0,0,-0.7],[0.7,0,0]]];
    ring.forEach(([a,b],i)=>{ poly([top,a,b],0.8+(i%2)*0.15); poly([bot,b,a],0.55+(i%2)*0.12); });
  } else if (shape === 'canister') {
    for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2,b=((i+1)/8)*Math.PI*2; const r=0.45;
      poly([[Math.cos(a)*r,-0.8,Math.sin(a)*r],[Math.cos(b)*r,-0.8,Math.sin(b)*r],[Math.cos(b)*r,0.8,Math.sin(b)*r],[Math.cos(a)*r,0.8,Math.sin(a)*r]],0.65+Math.cos(a+rot)*0.2);
    }
  } else if (shape === 'ingot') {
    const v:[number,number,number][]=[[-0.7,-0.35,-0.45],[0.7,-0.35,-0.45],[0.7,0.35,-0.45],[-0.7,0.35,-0.45],[-0.7,-0.35,0.45],[0.7,-0.35,0.45],[0.7,0.35,0.45],[-0.7,0.35,0.45]];
    const f=[[0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,3,7,4]];
    f.forEach((idx,i)=>poly(idx.map(j=>v[j]),0.55+i*0.07));
  } else {
    const ico: [number,number,number][] = [[0,1,0],[0.89,0.45,0],[0.28,0.45,0.85],[-0.72,0.45,0.53],[-0.72,0.45,-0.53],[0.28,0.45,-0.85],[0.72,-0.45,0.53],[-0.28,-0.45,0.85],[-0.89,-0.45,0],[ -0.28,-0.45,-0.85],[0.72,-0.45,-0.53],[0,-1,0]].map(p=>[p[0]*0.95,p[1]*0.95,p[2]*0.95]);
    const tris=[[0,1,2],[0,2,3],[0,3,4],[0,4,5],[0,5,1],[1,6,2],[2,6,7],[2,7,3],[3,7,8],[3,8,4],[4,8,9],[4,9,5],[5,9,10],[5,10,1],[1,10,6],[11,7,6],[11,8,7],[11,9,8],[11,10,9],[11,6,10]];
    tris.forEach((tri,i)=>poly(tri.map(j=>ico[j]), shape==='magma'?0.45+((i*7)%10)/18:0.55+((i*5)%10)/22));
  }
  faces.sort((a,b)=> (a.pts.reduce((n,p)=>n+p.d,0)/a.pts.length) - (b.pts.reduce((n,p)=>n+p.d,0)/b.pts.length));
  for (const f of faces) {
    ctx.beginPath(); f.pts.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.closePath();
    const base = info.cssColor;
    ctx.fillStyle = base; ctx.globalAlpha = Math.max(0.25, Math.min(1, f.shade));
    ctx.fill();
    if (shape === 'crystal' || shape === 'canister') { ctx.globalAlpha = 0.22; ctx.fillStyle = '#ffffff'; ctx.fill(); }
    if (shape === 'magma') { ctx.globalAlpha = 0.28; ctx.fillStyle = '#ffcc66'; ctx.fill(); }
    ctx.globalAlpha = 0.55; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export interface ResourceCodexCallbacks {
  onClose: () => void;
  getDiscovered: () => ResourceKind[];
}

export class ResourceCodex {
  public readonly root: HTMLDivElement;
  private readonly i18n: I18n;
  private readonly getDiscovered: () => ResourceKind[];
  private readonly grid: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private selected: ResourceKind | null = null;
  private raf = 0;
  private previewCanvas: HTMLCanvasElement | null = null;

  constructor(root: HTMLElement, i18n: I18n, callbacks: ResourceCodexCallbacks) {
    this.i18n = i18n;
    this.getDiscovered = callbacks.getDiscovered;
    this.root = el('div', 'overlay');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');

    const scrim = el('div', 'overlay__scrim');
    scrim.addEventListener('click', () => this.setVisible(false));
    const panel = el('div', 'overlay__panel overlay__panel--wide codex-panel');
    const head = el('div', 'overlay__head');
    const title = el('h2', 'overlay__title');
    title.textContent = this.i18n.t('codex.title');
    head.append(title, createIconButton({ label: this.i18n.t('map.close'), icon: 'close', onClick: () => { this.setVisible(false); callbacks.onClose(); } }));
    const body = el('div', 'codex-body');
    this.grid = el('div', 'codex-grid');
    this.detail = el('div', 'codex-detail');
    body.append(this.grid, this.detail);
    panel.append(head, body);
    this.root.append(scrim, panel);
    root.appendChild(this.root);
  }

  private zonesFor(kind: ResourceKind): string {
    const lang = this.i18n.lang === 'ar' ? 'ar' : 'en';
    const names = ZONES.filter(z => z.uniqueResources.includes(kind)).map(z => z.name[lang]);
    return names.length ? names.join(' · ') : '—';
  }

  private usesFor(kind: ResourceKind): string {
    const info = RESOURCE_INFO[kind];
    if (!info) return '—';
    const recipeUses = REFINE_RECIPES.filter(r => r.input === kind).map(r => `${r.output} (${r.inputAmount}→${r.outputAmount})`);
    return [...info.uses, ...recipeUses].join(' · ');
  }

  private renderGrid(): void {
    clear(this.grid);
    const discovered = new Set(this.getDiscovered());
    for (const kind of RESOURCE_ORDER) {
      const info = RESOURCES[kind];
      const isKnown = discovered.has(kind);
      const card = el('button', `codex-card${isKnown ? '' : ' is-unknown'}${this.selected === kind ? ' is-selected' : ''}`);
      card.type = 'button';
      const swatch = el('span', 'codex-swatch');
      swatch.style.background = isKnown ? info.cssColor : 'rgba(140,160,180,0.25)';
      const name = el('span', 'codex-name', isKnown ? this.i18n.resourceLabel(kind) : '???');
      const sub = el('span', 'codex-sub', isKnown ? (this.i18n.lang === 'ar' ? (kind === 'alloys' || kind === 'nanocarbon' ? 'مكرر' : 'خام') : (RESOURCE_INFO[kind]?.category ?? '')) : this.i18n.t('codex.undiscovered'));
      card.append(swatch, name, sub);
      card.addEventListener('click', () => { this.selected = kind; this.renderGrid(); this.renderDetail(); });
      this.grid.appendChild(card);
    }
  }

  private renderDetail(): void {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    clear(this.detail);
    const kind = this.selected ?? RESOURCE_ORDER[0];
    const discovered = new Set(this.getDiscovered());
    const known = discovered.has(kind);
    const r = RESOURCES[kind];
    const info = RESOURCE_INFO[kind];
    const head = el('div', 'codex-detail__head');
    const name = el('h3', 'codex-detail__name', known ? this.i18n.resourceLabel(kind) : '???');
    name.style.color = known ? r.cssColor : 'rgba(255,255,255,0.45)';
    head.appendChild(name);
    const previewWrap = el('div', 'codex-preview');
    this.previewCanvas = document.createElement('canvas');
    this.previewCanvas.width = 180; this.previewCanvas.height = 160;
    this.previewCanvas.className = 'codex-preview__canvas';
    previewWrap.appendChild(this.previewCanvas);
    if (known) {
      const loop = (t: number) => { if (!this.root.hidden && this.previewCanvas) drawPreview(this.previewCanvas, kind, t); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    } else {
      const ctx = this.previewCanvas.getContext('2d');
      if (ctx) { ctx.fillStyle = 'rgba(120,140,160,0.15)'; ctx.beginPath(); ctx.arc(90,80,44,0,Math.PI*2); ctx.fill(); ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font='600 28px Rajdhani,sans-serif'; ctx.textAlign='center'; ctx.fillText('?',90,90); }
    }
    const rows = el('div', 'codex-detail__rows');
    const row = (k: string, v: string) => { const d = el('div','codex-row'); d.innerHTML = `<span>${k}</span><b>${v}</b>`; rows.appendChild(d); };
    row(this.i18n.t('codex.discovered'), known ? this.i18n.t('codex.discovered') : this.i18n.t('codex.undiscovered'));
    if (known && info) {
      row(this.i18n.t('codex.category'), this.i18n.lang === 'ar' ? (info.category === 'raw' ? 'خام' : 'مكرر') : info.category);
      row(this.i18n.t('codex.rarity'), `${Math.round(info.rarity * 100)}%`);
      row(this.i18n.t('codex.where'), this.zonesFor(kind));
      row(this.i18n.t('codex.price'), `${info.basePriceMin}–${info.basePriceMax} cr`);
      const desc = el('p','codex-desc', info.description[this.i18n.lang === 'ar' ? 'ar' : 'en']);
      const uses = el('p','codex-desc'); uses.innerHTML = `<strong>${this.i18n.t('codex.refinesInto')}:</strong> ${this.usesFor(kind)}`;
      this.detail.append(head, previewWrap, rows, desc, uses);
    } else {
      row(this.i18n.t('codex.where'), '—');
      const desc = el('p','codex-desc', this.i18n.t('codex.undiscovered'));
      this.detail.append(head, previewWrap, rows, desc);
    }
  }

  public setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.root.classList.toggle('is-open', visible);
    if (visible) {
      if (!this.selected) this.selected = RESOURCE_ORDER[0];
      this.renderGrid();
      this.renderDetail();
    } else if (this.raf) {
      cancelAnimationFrame(this.raf); this.raf = 0;
    }
  }

  public isVisible(): boolean { return !this.root.hidden; }
  public refresh(): void { if (!this.root.hidden) { this.renderGrid(); this.renderDetail(); } }
}
