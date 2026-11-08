import { createIconButton } from './kit';
import { SOLAR_SYSTEM } from '../game/solarSystem';
import { el } from './dom';
import type { I18n } from './i18n';

export interface SectorMapCallbacks {
  onWarp: (targetId: string) => void;
  onClose: () => void;
}

export class SectorMap {
  public readonly root: HTMLDivElement;
  private readonly i18n: I18n;
  private readonly canvas: HTMLCanvasElement;
  private scale = 0.00008;
  private offsetX = 0;
  private offsetY = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private detailEl: HTMLDivElement;

  constructor(root: HTMLElement, i18n: I18n, _callbacks: SectorMapCallbacks) {
    this.i18n = i18n;
    void _callbacks;
    this.root = el('div', 'overlay overlay--map');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');

    const scrim = el('div', 'overlay__scrim');
    scrim.addEventListener('click', () => this.setVisible(false));

    const panel = el('div', 'overlay__panel overlay__panel--wide sector-map');
    const head = el('div', 'overlay__head');
    const title = el('h2', 'overlay__title');
    title.textContent = this.i18n.t('sector.title');
    const closeBtn = createIconButton({ label: this.i18n.t('map.close'), icon: 'close', onClick: () => this.setVisible(false) });
    head.append(title, closeBtn);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sector-map-canvas';
    this.canvas.width = 800;
    this.canvas.height = 500;

    this.detailEl = el('div', 'sector-map-detail');
    this.detailEl.innerHTML = '<div class="sector-map-detail-title">Select a target</div>';

    panel.append(head, this.canvas, this.detailEl);
    this.root.append(scrim, panel);
    root.appendChild(this.root);

    this.setupInteractions();
    this.draw();
  }

  private setupInteractions() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.offsetX += e.clientX - this.lastX;
      this.offsetY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.draw();
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.scale *= e.deltaY > 0 ? 0.9 : 1.1;
      this.scale = Math.max(0.00003, Math.min(0.0002, this.scale));
      this.draw();
    }, { passive: false });
    this.canvas.addEventListener('click', (_e) => {
      this.draw();
    });
  }

  private draw() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#020a14';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    const cx = this.canvas.width / 2 + this.offsetX;
    const cy = this.canvas.height / 2 + this.offsetY;
    
    // Star
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
    grad.addColorStop(0, '#fff4d6');
    grad.addColorStop(1, '#ff8a3d33');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // Planets/stations/gates
    for (const planet of SOLAR_SYSTEM.planets) {
      const angle = planet.orbitIndex * 0.8;
      const r = planet.orbitRadius * this.scale;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      ctx.strokeStyle = 'rgba(95,220,255,0.2)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = planet.type === 'gasgiant' ? '#d4a574' : planet.type === 'ice' ? '#b8e0ff' : planet.type === 'volcanic' ? '#ff6b35' : planet.type === 'terran' ? '#7dffb1' : '#999';
      ctx.beginPath();
      ctx.arc(x, y, planet.id === 'solace' || planet.id === 'nexus_gate' ? 4 : 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#fff';
      ctx.font = '10px Rajdhani';
      ctx.fillText(planet.name.en, x + 8, y + 3);
    }
  }

  public setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.root.classList.toggle('is-active', visible);
    if (visible) this.draw();
  }

  public get isVisible(): boolean {
    return !this.root.hidden;
  }
}
