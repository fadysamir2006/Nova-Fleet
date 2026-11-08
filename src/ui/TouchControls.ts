import { clamp } from '../game/math';
import { createIcon, el, ICONS } from './dom';
import type { Haptics } from './haptics';
import type { I18n } from './i18n';
import type { InputController, TouchAction, TouchSide } from './InputController';

interface Stick {
  side: TouchSide;
  zone: HTMLDivElement;
  knob: HTMLDivElement;
  label: HTMLSpanElement;
  pointerId: number | null;
}

const ACTION_LABEL_KEYS: Record<TouchAction, 'hud.fire' | 'hud.mine' | 'hud.boostButton'> = {
  fire: 'hud.fire',
  mine: 'hud.mine',
  boost: 'hud.boostButton',
};

/**
 * Dual virtual sticks plus fire / mine / boost buttons. Controls are fixed to
 * safe-area-aware corners and use pointer capture so a finger can slide off
 * an element without dropping the input.
 */
export class TouchControls {
  public readonly root: HTMLDivElement;

  private readonly input: InputController;
  private readonly i18n: I18n;
  private readonly haptics: Haptics;
  private readonly sticks: Stick[] = [];
  private readonly actionButtons = new Map<TouchAction, HTMLButtonElement>();
  private readonly actionPointers = new Map<number, TouchAction>();
  private readonly fireButton: HTMLButtonElement;
  private readonly lockButton: HTMLButtonElement;
  private visible = false;

  constructor(
    container: HTMLElement,
    input: InputController,
    i18n: I18n,
    haptics: Haptics,
  ) {
    this.input = input;
    this.i18n = i18n;
    this.haptics = haptics;
    this.root = el('div', 'touch-controls');
    this.root.setAttribute('aria-hidden', 'true');
    container.appendChild(this.root);

    const left = this.createStick('left', 'left');
    const right = this.createStick('right', 'right');

    const actions = el('div', 'touch-actions');
    const fire = this.createActionButton('fire', true);
    const mine = this.createActionButton('mine', false);
    const boost = this.createActionButton('boost', false);
    const lock = this.createLockButton();
    actions.append(lock, boost, mine, fire);
    this.root.append(left, actions, right);
    this.fireButton = fire;
    this.lockButton = lock;
    this.refresh();
  }

  private createStick(side: TouchSide, position: 'left' | 'right'): HTMLDivElement {
    const zone = el('div', `touch-stick touch-stick--${position}`);
    const ring = el('div', 'touch-stick__ring');
    const cross = el('div', 'touch-stick__cross');
    const knob = el('div', 'touch-stick__knob');
    const label = el('span', 'touch-stick__label');
    zone.append(ring, cross, knob, label);
    zone.dataset.side = side;
    zone.addEventListener('pointerdown', (event) => this.beginStick(side, event));
    zone.addEventListener('pointermove', (event) => this.moveStick(side, event));
    zone.addEventListener('pointerup', (event) => this.endStick(side, event));
    zone.addEventListener('pointercancel', (event) => this.endStick(side, event));
    zone.addEventListener('lostpointercapture', (event) => this.endStick(side, event));
    zone.addEventListener('contextmenu', (event) => event.preventDefault());
    this.sticks.push({ side, zone, knob, label, pointerId: null });
    return zone;
  }

  private createActionButton(action: TouchAction, large: boolean): HTMLButtonElement {
    const button = el('button', `touch-action${large ? ' touch-action--large' : ''}`);
    button.type = 'button';
    button.dataset.action = action;
    const icon = createIcon(
      action === 'fire' ? ICONS.fire : action === 'mine' ? ICONS.mine : ICONS.boost,
    );
    const label = el('span', 'touch-action__label');
    button.append(icon, label);
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.hasPointerCapture(event.pointerId)) return;
      button.setPointerCapture(event.pointerId);
      this.actionPointers.set(event.pointerId, action);
      this.input.setTouchAction(action, true);
      button.classList.add('is-active');
      this.haptics.pulse(8);
    });
    const release = (event: PointerEvent): void => {
      const pointerAction = this.actionPointers.get(event.pointerId);
      if (pointerAction !== action) return;
      this.actionPointers.delete(event.pointerId);
      this.input.setTouchAction(action, false);
      if (![...this.actionPointers.values()].includes(action)) {
        button.classList.remove('is-active');
      }
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    this.actionButtons.set(action, button);
    return button;
  }

  private createLockButton(): HTMLButtonElement {
    const button = el('button', 'touch-action touch-action--lock');
    button.type = 'button';
    button.dataset.action = 'lock';
    const icon = createIcon(ICONS.target);
    const label = el('span', 'touch-action__label');
    button.append(icon, label);
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.input.requestTargetLock();
      this.haptics.pulse(10);
      button.classList.add('is-active');
      window.setTimeout(() => button.classList.remove('is-active'), 120);
    });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    return button;
  }

  private beginStick(side: TouchSide, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const stick = this.sticks.find((entry) => entry.side === side);
    if (!stick || stick.pointerId !== null) return;
    stick.pointerId = event.pointerId;
    stick.zone.setPointerCapture(event.pointerId);
    stick.zone.classList.add('is-active');
    this.haptics.pulse(6);
    this.moveStick(side, event);
  }

  private moveStick(side: TouchSide, event: PointerEvent): void {
    const stick = this.sticks.find((entry) => entry.side === side);
    if (!stick || stick.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rect = stick.zone.getBoundingClientRect();
    const max = Math.max(rect.width * 0.3, 18);
    const dx = clamp(event.clientX - (rect.left + rect.width * 0.5), -max, max);
    const dy = clamp(event.clientY - (rect.top + rect.height * 0.5), -max, max);
    stick.knob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    this.input.setTouchStick(side, dx / max, -dy / max);
  }

  private endStick(side: TouchSide, event: PointerEvent): void {
    const stick = this.sticks.find((entry) => entry.side === side);
    if (!stick || stick.pointerId !== event.pointerId) return;
    stick.pointerId = null;
    stick.zone.classList.remove('is-active');
    stick.knob.style.transform = 'translate3d(0, 0, 0)';
    this.input.setTouchStick(side, 0, 0);
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.classList.toggle('is-visible', visible);
    this.root.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible) this.releaseAll();
  }

  public get isVisible(): boolean {
    return this.visible;
  }

  public refresh(): void {
    for (const stick of this.sticks) {
      stick.label.textContent = this.i18n.t(
        stick.side === 'left' ? 'hud.thrust' : 'hud.steer',
      );
      stick.zone.setAttribute(
        'aria-label',
        this.i18n.t(stick.side === 'left' ? 'a11y.leftStick' : 'a11y.rightStick'),
      );
    }
    for (const [action, button] of this.actionButtons) {
      const label = this.i18n.t(ACTION_LABEL_KEYS[action]);
      button.setAttribute('aria-label', label);
      const text = button.querySelector<HTMLElement>('.touch-action__label');
      if (text) text.textContent = label;
    }
    const lockLabel = this.i18n.t('hud.targetLock');
    this.lockButton.setAttribute('aria-label', lockLabel);
    const lockText = this.lockButton.querySelector<HTMLElement>('.touch-action__label');
    if (lockText) lockText.textContent = lockLabel;
  }

  public pulseFire(): void {
    this.fireButton.classList.add('is-pulsing');
    window.setTimeout(() => this.fireButton.classList.remove('is-pulsing'), 120);
  }

  private releaseAll(): void {
    this.actionPointers.clear();
    for (const [action, button] of this.actionButtons) {
      button.classList.remove('is-active');
      this.input.setTouchAction(action, false);
    }
    for (const stick of this.sticks) {
      stick.pointerId = null;
      stick.zone.classList.remove('is-active');
      stick.knob.style.transform = 'translate3d(0, 0, 0)';
      this.input.setTouchStick(stick.side, 0, 0);
    }
  }
}
