import { ENEMY_TUNING, buildPlayerLoadout } from '../game/config';
import type { LocalizedText, PlayerLoadout } from '../game/types';

export interface ShipStats {
  speed: number;
  armor: number;
  weapon: number;
  mining: number;
}

export interface ShipDefinition {
  id: string;
  name: LocalizedText;
  role: LocalizedText;
  lore: LocalizedText;
  /** Change this single path to swap in a real glTF/GLB. Set null for procedural fallback. */
  modelPath: string | null;
  placeholder: boolean;
  accent: string;
  engineColor: string;
  scale: number;
  stats: ShipStats;
  loadout: PlayerLoadout;
  hullClass: 'logistics' | 'combat' | 'prospector';
  highSlots: number;
  midSlots: number;
  lowSlots: number;
}

export const PLAYER_SHIPS: readonly ShipDefinition[] = [
  {
    id: 'helix',
    name: { en: 'Helix Logistics', ar: 'هليكس للدعم' },
    role: { en: 'Logistics Support Ship', ar: 'سفينة دعم لوجستي' },
    lore: {
      en: 'A modular support hull built for fleet sustainment. Equipped with remote repair beams, a shield emission aura, and drone bays for coordinated assistance. Optimized for utility fitting.',
      ar: 'هيكل دعم معياري مصمم للإسناد اللوجستي. مزود بأشعة إصلاح عن بُعد وهالة درع وطائرات مسيرة للمساعدة المتبادلة.',
    },
    modelPath: '/models/skylance.glb',
    placeholder: true,
    accent: '#7dffb1',
    engineColor: '#a8ffdc',
    scale: 1,
    stats: { speed: 68, armor: 64, weapon: 28, mining: 36 },
    loadout: buildPlayerLoadout('helix', 'skylance'),
    hullClass: 'logistics',
    highSlots: 2,
    midSlots: 4,
    lowSlots: 3,
  },
  {
    id: 'ironharrow',
    name: { en: 'Ironharrow', ar: 'آيرونهارو' },
    role: { en: 'Heavy Combat Warship', ar: 'سفينة حربية ثقيلة' },
    lore: {
      en: 'A plated dread-style hull with multi-turret hardpoints, reinforced armor plating, and integrated missile launchers for sustained frontline engagements. Heavily armed with broad fitting flexibility.',
      ar: 'هيكل مدرع بثلاثة نقاط متعددة لأبراج المدافع ودروع معززة وقاذفات صواريخ للقتال الجبهوي المستمر.',
    },
    modelPath: '/models/ironwake.glb',
    placeholder: true,
    accent: '#ff8a3d',
    engineColor: '#ffb36b',
    scale: 1,
    stats: { speed: 42, armor: 98, weapon: 92, mining: 18 },
    loadout: buildPlayerLoadout('ironharrow', 'ironwake'),
    hullClass: 'combat',
    highSlots: 5,
    midSlots: 3,
    lowSlots: 3,
  },
  {
    id: 'deepmaw',
    name: { en: 'Deepmaw', ar: 'ديبماو' },
    role: { en: 'Prospector Mining Vessel', ar: 'سفينة تنقيب واستخراج' },
    lore: {
      en: 'A frontier prospector with high-yield strip miners, wide-capacity ore holds, long-range scanner probes, and optimized routing for rare planetary resources. Purpose-built for extraction and surveying.',
      ar: 'سفينة حدودية عالية الإنتاج مع مستخرجات شريطية وسعة خام كبيرة وأجهزة مسح بعيدة المدى لاكتشاف الموارد النادرة.',
    },
    modelPath: '/models/deepmaw.glb',
    placeholder: true,
    accent: '#8ef0a8',
    engineColor: '#a8ffbc',
    scale: 1,
    stats: { speed: 58, armor: 70, weapon: 34, mining: 100 },
    loadout: buildPlayerLoadout('deepmaw', 'deepmaw'),
    hullClass: 'prospector',
    highSlots: 3,
    midSlots: 3,
    lowSlots: 4,
  },
];

export const ENEMY_SHIP = {
  modelPath: '/models/raider.glb' as string | null,
  modelId: 'raider',
  radius: ENEMY_TUNING.radius,
};

export const getShipById = (id: string): ShipDefinition =>
  PLAYER_SHIPS.find((ship) => ship.id === id) ?? PLAYER_SHIPS[0];
