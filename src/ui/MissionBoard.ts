import { createButton, createIconButton } from './kit';
import { el } from './dom';
import type { I18n } from './i18n';

export interface MissionBoardCallbacks {
  onAccept: (missionId: string) => void;
  onClose: () => void;
}

export class MissionBoard {
  public readonly root: HTMLDivElement;
  private readonly i18n: I18n;
  private readonly callbacks: MissionBoardCallbacks;

  constructor(root: HTMLElement, i18n: I18n, callbacks: MissionBoardCallbacks) {
    this.i18n = i18n;
    this.callbacks = callbacks;
    this.root = el('div', 'overlay');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');

    const scrim = el('div', 'overlay__scrim');
    scrim.addEventListener('click', () => this.setVisible(false));

    const panel = el('div', 'overlay__panel');
    const head = el('div', 'overlay__head');
    const title = el('h2', 'overlay__title');
    title.textContent = this.i18n.t('missions.title');
    const closeBtn = createIconButton({ label: this.i18n.t('map.close'), icon: 'close', onClick: () => this.setVisible(false) });
    head.append(title, closeBtn);

    const body = el('div', 'overlay__body');
    const missions = [
      { id: 'm1', type: 'mine', desc: 'Mine 20 Ferrite at Aurelia Belt', reward: 5000 },
      { id: 'm2', type: 'destroy', desc: 'Destroy 5 hostiles in Thryx Wreckage', reward: 8500 },
      { id: 'm3', type: 'deliver', desc: 'Deliver 10 Aurium to Solace Station', reward: 6200 },
    ];
    for (const m of missions) {
      const card = el('div', 'market-row');
      const info = el('div');
      const name = el('div');
      name.textContent = m.desc;
      const reward = el('div');
      reward.textContent = `${m.reward} Cr`;
      info.append(name, reward);
      const btn = createButton({ label: this.i18n.t('missions.accept'), onClick: () => this.callbacks.onAccept(m.id) });
      card.append(info, btn);
      body.appendChild(card);
    }

    panel.append(head, body);
    this.root.append(scrim, panel);
    root.appendChild(this.root);
  }

  public setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.root.classList.toggle('is-active', visible);
  }
}
