/**
 * Nova Fleet shared UI kit.
 *
 * One small, framework-free DOM layer for the controls that recur across the
 * menu, flight HUD, overlays, and later roadmap screens. Import primitives from
 * this file and load `kit.css` before component styles so screens can override
 * the baseline. Everything here is original project code.
 */

import { createIcon, el, ICONS, setPressed } from '../dom';

export type KitTone = 'neutral' | 'accent' | 'good' | 'warm' | 'danger' | 'muted';
export type KitSize = 'sm' | 'md' | 'lg';
export type ButtonVariant = 'solid' | 'ghost' | 'quiet';

let uid = 0;
const nextId = (prefix: string): string => `${prefix}-${(uid += 1)}`;

const classes = (...values: Array<string | false | null | undefined>): string =>
  values.filter((value): value is string => Boolean(value)).join(' ');

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/* ========================================================================== */
/* Buttons                                                                    */
/* ========================================================================== */

export interface ButtonOptions {
  /** Accessible name. Also used as visible text unless `text` or `iconOnly` is set. */
  label: string;
  text?: string;
  icon?: string;
  iconOnly?: boolean;
  tone?: KitTone;
  variant?: ButtonVariant;
  size?: KitSize;
  className?: string;
  title?: string;
  pressed?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: MouseEvent) => void;
}

export const createButton = (options: ButtonOptions): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = options.type ?? 'button';
  button.className = classes(
    'ui-button',
    options.variant && `ui-button--${options.variant}`,
    options.tone && options.tone !== 'neutral' && `ui-button--${options.tone}`,
    options.size && options.size !== 'md' && `ui-button--${options.size}`,
    options.iconOnly && 'ui-button--icon',
    options.className,
  );
  button.setAttribute('aria-label', options.label);
  if (options.title) button.title = options.title;
  if (options.disabled) button.disabled = true;
  if (options.pressed !== undefined) setPressed(button, options.pressed);
  if (options.icon) button.appendChild(createIcon(options.icon));
  if (!options.iconOnly) {
    const label = el('span', 'ui-button__label', options.text ?? options.label);
    button.appendChild(label);
  }
  if (options.onClick) button.addEventListener('click', options.onClick);
  return button;
};

export type IconButtonOptions = Omit<ButtonOptions, 'iconOnly' | 'text'> & {
  icon: string;
};

export const createIconButton = (options: IconButtonOptions): HTMLButtonElement =>
  createButton({ ...options, iconOnly: true });

/* ========================================================================== */
/* Panels                                                                     */
/* ========================================================================== */

export interface PanelOptions {
  tag?: 'div' | 'section' | 'aside' | 'article';
  className?: string;
  title?: string;
  eyebrow?: string;
  titleId?: string;
  /** Custom header. When set, the automatic title/actions header is skipped. */
  header?: HTMLElement;
  actions?: readonly Node[];
  children?: readonly Node[];
  footer?: readonly Node[];
  bodyClassName?: string;
  bodyLayout?: 'flow' | 'contents';
  surface?: boolean;
  closeLabel?: string;
  onClose?: () => void;
}

export interface PanelHandle {
  readonly root: HTMLElement;
  readonly head: HTMLElement | null;
  readonly body: HTMLDivElement;
  readonly footer: HTMLElement | null;
  readonly title: HTMLElement | null;
  setTitle(text: string): void;
}

export const createPanel = (options: PanelOptions = {}): PanelHandle => {
  const root = document.createElement(options.tag ?? 'div');
  root.className = classes(
    'ui-panel',
    options.surface && 'ui-panel--surface',
    options.className,
  );

  let titleNode: HTMLElement | null = null;
  let head = options.header ?? null;
  if (!head && (options.title || options.eyebrow || options.actions?.length || options.onClose)) {
    head = el('div', 'ui-panel__head');
    const heading = el('div', 'ui-panel__heading');
    if (options.eyebrow) heading.appendChild(el('span', 'ui-panel__eyebrow', options.eyebrow));
    if (options.title) {
      titleNode = el('strong', 'ui-panel__title', options.title);
      titleNode.dataset.uiPanelTitle = 'true';
      const titleId = options.titleId ?? nextId('ui-panel-title');
      titleNode.id = titleId;
      root.setAttribute('aria-labelledby', titleId);
      heading.appendChild(titleNode);
    }
    if (heading.childElementCount > 0) head.appendChild(heading);
    if (options.actions?.length || options.onClose) {
      const actions = el('div', 'ui-panel__actions');
      for (const action of options.actions ?? []) actions.appendChild(action);
      if (options.onClose) {
        actions.appendChild(
          createIconButton({
            label: options.closeLabel ?? 'Close',
            icon: ICONS.close,
            className: 'ui-panel__close',
            onClick: options.onClose,
          }),
        );
      }
      head.appendChild(actions);
    }
  }
  if (head) root.appendChild(head);

  const body = el(
    'div',
    classes(
      'ui-panel__body',
      options.bodyLayout === 'contents' ? 'ui-panel__body--contents' : 'ui-panel__body--flow',
      options.bodyClassName,
    ),
  );
  for (const child of options.children ?? []) body.appendChild(child);
  root.appendChild(body);

  let footer: HTMLElement | null = null;
  if (options.footer?.length) {
    footer = el('div', 'ui-panel__foot');
    for (const child of options.footer) footer.appendChild(child);
    root.appendChild(footer);
  }

  return {
    root,
    head,
    body,
    footer,
    title: titleNode,
    setTitle(text: string): void {
      if (titleNode) titleNode.textContent = text;
    },
  };
};

/* ========================================================================== */
/* Bars                                                                       */
/* ========================================================================== */

export interface BarOptions {
  className?: string;
  fillClassName?: string;
  tone?: KitTone;
  size?: KitSize;
  label?: string;
  value?: number;
}

export interface BarHandle {
  readonly root: HTMLDivElement;
  readonly fill: HTMLSpanElement;
  value: number;
  set(value: number, label?: string): void;
  setLabel(label?: string): void;
}

export const createBar = (options: BarOptions = {}): BarHandle => {
  const root = el(
    'div',
    classes(
      'ui-bar',
      options.tone && options.tone !== 'neutral' && `ui-bar--${options.tone}`,
      options.size && options.size !== 'md' && `ui-bar--${options.size}`,
      options.className,
    ),
  );
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  root.setAttribute('aria-valuenow', '0');

  const fill = el('span', classes('ui-bar__fill', options.fillClassName));
  root.appendChild(fill);

  const handle: BarHandle = {
    root,
    fill,
    value: 0,
    set(value: number, label?: string): void {
      const ratio = clamp01(value);
      const width = `${(ratio * 100).toFixed(1)}%`;
      if (fill.style.width !== width) fill.style.width = width;
      const percent = String(Math.round(ratio * 100));
      if (root.getAttribute('aria-valuenow') !== percent) {
        root.setAttribute('aria-valuenow', percent);
      }
      handle.value = ratio;
      if (label !== undefined) handle.setLabel(label);
    },
    setLabel(label?: string): void {
      if (label) root.setAttribute('aria-label', label);
      else root.removeAttribute('aria-label');
    },
  };

  if (options.label) handle.setLabel(options.label);
  handle.set(options.value ?? 0);
  return handle;
};

/* ========================================================================== */
/* Rings                                                                      */
/* ========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface RingArcOptions {
  radius: number;
  className?: string;
  value?: number;
}

export interface RingOptions {
  viewBox?: number;
  className?: string;
  arcs: readonly RingArcOptions[];
  ariaLabel?: string;
}

export interface RingArcHandle {
  readonly element: SVGCircleElement;
  value: number;
  set(value: number): void;
}

export interface RingHandle {
  readonly root: SVGSVGElement;
  readonly arcs: readonly RingArcHandle[];
  set(index: number, value: number): void;
}

export const createRing = (options: RingOptions): RingHandle => {
  const size = options.viewBox ?? 220;
  const center = size / 2;
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('viewBox', `0 0 ${size} ${size}`);
  root.setAttribute('class', classes('ui-ring', options.className));
  root.setAttribute('focusable', 'false');
  if (options.ariaLabel) {
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', options.ariaLabel);
  } else {
    root.setAttribute('aria-hidden', 'true');
  }

  const arcs = options.arcs.map((arc) => {
    const element = document.createElementNS(SVG_NS, 'circle');
    element.setAttribute('class', classes('ui-ring__arc', arc.className));
    element.setAttribute('cx', String(center));
    element.setAttribute('cy', String(center));
    element.setAttribute('r', String(arc.radius));
    element.setAttribute('pathLength', '100');
    element.setAttribute('stroke-dasharray', '100');
    element.setAttribute('stroke-dashoffset', '0');
    const handle: RingArcHandle = {
      element,
      value: 0,
      set(value: number): void {
        const ratio = clamp01(value);
        const offset = ((1 - ratio) * 100).toFixed(1);
        if (element.dataset.offset !== offset) {
          element.dataset.offset = offset;
          element.setAttribute('stroke-dashoffset', offset);
        }
        handle.value = ratio;
      },
    };
    handle.set(arc.value ?? 0);
    root.appendChild(element);
    return handle;
  });

  return {
    root,
    arcs,
    set(index: number, value: number): void {
      arcs[index]?.set(value);
    },
  };
};

/* ========================================================================== */
/* Tabs                                                                       */
/* ========================================================================== */

export interface TabItem<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
}

export interface TabsOptions<T extends string> {
  items: readonly TabItem<T>[];
  label: string;
  value?: T;
  className?: string;
  tabClassName?: string;
  onChange?: (id: T) => void;
}

export interface TabsHandle<T extends string> {
  readonly root: HTMLDivElement;
  readonly buttons: ReadonlyMap<T, HTMLButtonElement>;
  readonly value: T;
  select(id: T, options?: { notify?: boolean; focus?: boolean }): void;
  setLabel(id: T, label: string): void;
}

export const createTabs = <T extends string>(options: TabsOptions<T>): TabsHandle<T> => {
  if (options.items.length === 0) throw new Error('createTabs requires at least one tab.');

  const root = el('div', classes('ui-tabs', options.className));
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', options.label);

  const buttons = new Map<T, HTMLButtonElement>();
  const items = new Map<T, TabItem<T>>();
  for (const item of options.items) {
    const button = el('button', classes('ui-tabs__tab', options.tabClassName));
    button.type = 'button';
    button.dataset.tab = item.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.textContent = item.label;
    button.tabIndex = -1;
    if (item.disabled) button.disabled = true;
    buttons.set(item.id, button);
    items.set(item.id, item);
    root.appendChild(button);
  }

  const fallback = options.items.find((item) => !item.disabled)?.id ?? options.items[0]!.id;
  let active = options.value && items.has(options.value) ? options.value : fallback;

  const handle: TabsHandle<T> = {
    root,
    buttons,
    get value(): T {
      return active;
    },
    select(id: T, settings: { notify?: boolean; focus?: boolean } = {}): void {
      const item = items.get(id);
      if (!item || item.disabled) return;
      const changed = active !== id;
      active = id;
      for (const [key, button] of buttons) {
        const selected = key === id;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.tabIndex = selected ? 0 : -1;
      }
      if (settings.focus) buttons.get(id)?.focus({ preventScroll: true });
      if (changed && settings.notify !== false) options.onChange?.(id);
    },
    setLabel(id: T, label: string): void {
      const button = buttons.get(id);
      if (button) button.textContent = label;
    },
  };

  for (const [id, button] of buttons) {
    button.addEventListener('click', () => handle.select(id));
  }

  root.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const enabled = options.items.filter((item) => !item.disabled);
    if (enabled.length === 0) return;
    event.preventDefault();
    const current = enabled.findIndex((item) => item.id === active);
    const rtl = window.getComputedStyle(root).direction === 'rtl';
    let delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (rtl) delta *= -1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? enabled.length - 1
          : (current + delta + enabled.length) % enabled.length;
    handle.select(enabled[next]!.id, { focus: true });
  });

  handle.select(active, { notify: false });
  return handle;
};

/* ========================================================================== */
/* Tooltips                                                                   */
/* ========================================================================== */

export type TooltipPlacement = 'top' | 'bottom' | 'start' | 'end';

export interface TooltipOptions {
  placement?: TooltipPlacement;
  delay?: number;
}

let tooltipNode: HTMLDivElement | null = null;
let tooltipOwner: HTMLElement | null = null;
let tooltipGlobalBound = false;

const hideTooltip = (owner?: HTMLElement): void => {
  if (owner && tooltipOwner && tooltipOwner !== owner) return;
  if (tooltipNode) tooltipNode.hidden = true;
  tooltipOwner = null;
};

const positionTooltip = (
  node: HTMLDivElement,
  target: HTMLElement,
  placement: TooltipPlacement,
): void => {
  const gap = 8;
  const rect = target.getBoundingClientRect();
  const tip = node.getBoundingClientRect();
  const rtl = window.getComputedStyle(target).direction === 'rtl';
  let side = placement;
  if (placement === 'start') side = rtl ? 'end' : 'start';
  else if (placement === 'end') side = rtl ? 'start' : 'end';

  let left = rect.left + rect.width / 2 - tip.width / 2;
  let top = rect.top - tip.height - gap;
  if (side === 'bottom') {
    top = rect.bottom + gap;
  } else if (side === 'start') {
    left = rect.left - tip.width - gap;
    top = rect.top + rect.height / 2 - tip.height / 2;
  } else if (side === 'end') {
    left = rect.right + gap;
    top = rect.top + rect.height / 2 - tip.height / 2;
  } else if (top < gap) {
    top = rect.bottom + gap;
  }

  left = Math.max(gap, Math.min(left, window.innerWidth - tip.width - gap));
  top = Math.max(gap, Math.min(top, window.innerHeight - tip.height - gap));
  node.dataset.placement = side;
  node.style.left = `${Math.round(left)}px`;
  node.style.top = `${Math.round(top)}px`;
};

const ensureTooltip = (): HTMLDivElement => {
  if (tooltipNode) return tooltipNode;
  tooltipNode = el('div', 'ui-tooltip');
  tooltipNode.id = 'nova-fleet-ui-tooltip';
  tooltipNode.setAttribute('role', 'tooltip');
  tooltipNode.hidden = true;
  document.body.appendChild(tooltipNode);
  if (!tooltipGlobalBound) {
    tooltipGlobalBound = true;
    window.addEventListener('scroll', () => hideTooltip(), true);
    window.addEventListener('resize', () => hideTooltip());
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') hideTooltip();
      },
      true,
    );
  }
  return tooltipNode;
};

const showTooltip = (target: HTMLElement, text: string, placement: TooltipPlacement): void => {
  if (!text || !target.isConnected) return;
  const node = ensureTooltip();
  node.textContent = text;
  node.hidden = false;
  tooltipOwner = target;
  positionTooltip(node, target, placement);
};

/**
 * Adds a non-blocking visual tooltip while keeping the target's existing
 * `aria-label`. The getter is read on every show so language changes are
 * reflected without rebuilding the control.
 */
export const attachTooltip = (
  target: HTMLElement,
  getText: () => string,
  options: TooltipOptions = {},
): (() => void) => {
  const placement = options.placement ?? 'top';
  const delay = options.delay ?? 260;
  let timer = 0;

  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      showTooltip(target, getText(), placement);
    }, delay);
  };
  const hide = (): void => {
    window.clearTimeout(timer);
    timer = 0;
    hideTooltip(target);
  };
  const onFocus = (): void => {
    if (target.matches(':focus-visible')) showTooltip(target, getText(), placement);
  };

  target.addEventListener('pointerenter', schedule);
  target.addEventListener('pointerleave', hide);
  target.addEventListener('focus', onFocus);
  target.addEventListener('blur', hide);
  target.addEventListener('pointerdown', hide);

  return () => {
    window.clearTimeout(timer);
    target.removeEventListener('pointerenter', schedule);
    target.removeEventListener('pointerleave', hide);
    target.removeEventListener('focus', onFocus);
    target.removeEventListener('blur', hide);
    target.removeEventListener('pointerdown', hide);
    hideTooltip(target);
  };
};
