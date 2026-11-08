import { clamp } from '../game/math';
import type { PlayerInput } from '../game/types';
import { createEmptyInput } from '../game/types';

export type TouchAction = 'fire' | 'mine' | 'boost';
export type TouchSide = 'left' | 'right';

export interface InputCallbacks {
  onPause: () => void;
  onDebug: () => void;
  onToggleAudio: () => void;
  onInteract: () => void;
  onCycleTarget: () => void;
}

const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyZ',
  'KeyX',
  'KeyE',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const curve = (value: number): number => {
  const magnitude = Math.abs(value);
  if (magnitude < 0.07) return 0;
  const scaled = (magnitude - 0.07) / 0.93;
  return Math.sign(value) * Math.pow(scaled, 1.25);
};

interface TouchAxes {
  x: number;
  y: number;
}

/**
 * Desktop keyboard/mouse plus a shared state surface for the on-screen
 * controls. Flight input is only emitted while `enabled` is true so menu
 * clicks and pause controls never leak into the simulation.
 */
export class InputController {
  public enabled = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: InputCallbacks;
  private readonly keys = new Set<string>();
  private readonly touchSticks: Record<TouchSide, TouchAxes> = {
    left: { x: 0, y: 0 },
    right: { x: 0, y: 0 },
  };
  private readonly touchActions: Record<TouchAction, boolean> = {
    fire: false,
    mine: false,
    boost: false,
  };
  private mouseSteer = { x: 0, y: 0 };
  private mouseFiring = false;
  private hasMousePosition = false;
  private sensitivity = 1;
  /** Persistent forward throttle set from the HUD control (0…1). */
  private throttle = 0;
  private firePulseUntil = 0;
  private minePulseUntil = 0;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.callbacks.onInteract();
    if (event.code === 'Escape' || event.code === 'KeyP') {
      event.preventDefault();
      this.callbacks.onPause();
      return;
    }
    if (event.code === 'F3') {
      event.preventDefault();
      this.callbacks.onDebug();
      return;
    }
    if (event.code === 'KeyM') {
      this.callbacks.onToggleAudio();
      return;
    }
    if (this.enabled && event.code === 'Tab') {
      event.preventDefault();
      this.callbacks.onCycleTarget();
      return;
    }
    if (!this.enabled || !GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (GAME_KEYS.has(event.code)) {
      event.preventDefault();
      this.keys.delete(event.code);
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.callbacks.onInteract();
    if (!this.enabled) return;
    if (event.pointerType === 'mouse' && event.button === 0) {
      this.mouseFiring = true;
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button === 0) this.mouseFiring = false;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    this.hasMousePosition = true;
    const width = Math.max(window.innerWidth, 1);
    const height = Math.max(window.innerHeight, 1);
    this.mouseSteer = {
      x: curve(clamp((event.clientX / width) * 2 - 1, -1, 1)),
      y: curve(clamp(1 - (event.clientY / height) * 2, -1, 1)),
    };
  };

  private readonly onPointerLeave = (): void => {
    this.hasMousePosition = false;
    this.mouseSteer = { x: 0, y: 0 };
  };

  private readonly onBlur = (): void => this.reset();

  private readonly onContextMenu = (event: Event): void => {
    if (this.enabled) event.preventDefault();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey) event.preventDefault();
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (this.enabled) event.preventDefault();
  };

  private readonly onGestureStart = (event: Event): void => {
    if (this.enabled) event.preventDefault();
  };

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    document.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('touchmove', this.onTouchMove, { passive: false });
    document.addEventListener('gesturestart', this.onGestureStart);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.reset();
  }

  public setTouchStick(side: TouchSide, x: number, y: number): void {
    this.touchSticks[side].x = clamp(x, -1, 1);
    this.touchSticks[side].y = clamp(y, -1, 1);
  }

  public setTouchAction(action: TouchAction, active: boolean): void {
    this.touchActions[action] = active;
  }

  public setSensitivity(sensitivity: number): void {
    this.sensitivity = clamp(sensitivity, 0.3, 1.8);
  }

  /** HUD throttle lever; keyboard/touch thrust temporarily overrides it. */
  public setThrottle(value: number): void {
    this.throttle = clamp(value, 0, 1);
  }

  public getThrottle(): number {
    return this.throttle;
  }

  /** Brief trigger press from the Overview Fire action. */
  public pulseFire(durationMs = 900): void {
    this.firePulseUntil = performance.now() + durationMs;
  }

  /** Brief mining hold from the Overview Mine action. */
  public pulseMine(durationMs = 1500): void {
    this.minePulseUntil = performance.now() + durationMs;
  }

  public requestTargetLock(): void {
    this.callbacks.onCycleTarget();
  }

  public reset(): void {
    this.keys.clear();
    this.mouseFiring = false;
    this.mouseSteer = { x: 0, y: 0 };
    this.hasMousePosition = false;
    this.throttle = 0;
    this.firePulseUntil = 0;
    this.minePulseUntil = 0;
    for (const side of ['left', 'right'] as const) {
      this.touchSticks[side].x = 0;
      this.touchSticks[side].y = 0;
    }
    for (const action of ['fire', 'mine', 'boost'] as const) {
      this.touchActions[action] = false;
    }
  }

  public getInput(): PlayerInput {
    if (!this.enabled) return createEmptyInput();

    const keyboardThrottle =
      (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const keyboardStrafe =
      (this.keys.has('KeyX') ? 1 : 0) - (this.keys.has('KeyZ') ? 1 : 0);
    const keyboardYaw =
      (this.keys.has('KeyD') ? 1 : 0) -
      (this.keys.has('KeyA') ? 1 : 0) +
      (this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('ArrowLeft') ? 1 : 0);
    const keyboardPitch =
      (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);

    const mouseYaw = this.hasMousePosition ? this.mouseSteer.x : 0;
    const mousePitch = this.hasMousePosition ? this.mouseSteer.y : 0;
    const left = this.touchSticks.left;
    const right = this.touchSticks.right;
    const manualThrottle = keyboardThrottle + left.y;
    const now = performance.now();

    return {
      throttle: clamp(manualThrottle !== 0 ? manualThrottle : this.throttle, -1, 1),
      strafe: clamp(keyboardStrafe + left.x, -1, 1),
      yaw: clamp((keyboardYaw + mouseYaw + right.x) * this.sensitivity, -1, 1),
      pitch: clamp((keyboardPitch + mousePitch + right.y) * this.sensitivity, -1, 1),
      fire:
        this.mouseFiring ||
        this.keys.has('Space') ||
        this.touchActions.fire ||
        now < this.firePulseUntil,
      mine: this.keys.has('KeyE') || this.touchActions.mine || now < this.minePulseUntil,
      boost:
        this.keys.has('ShiftLeft') ||
        this.keys.has('ShiftRight') ||
        this.touchActions.boost,
    };
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('touchmove', this.onTouchMove);
    document.removeEventListener('gesturestart', this.onGestureStart);
  }
}
