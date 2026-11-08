export type ModuleIconType = 'weapon' | 'miner' | 'repair' | 'shield' | 'propulsion' | 'scanner' | 'armor' | 'reactor' | 'cargo';

const TIER_COLORS: Record<string, { stroke: string; fill: string }> = {
  I: { stroke: '#7dffb1', fill: '#7dffb133' },
  II: { stroke: '#5fdcff', fill: '#5fdcff33' },
  III: { stroke: '#ff8a3d', fill: '#ff8a3d33' },
};

function roman(tier: string): string {
  return tier === 'III' ? 'III' : tier === 'II' ? 'II' : 'I';
}

/** Original procedural SVG icon per module type. Distinct shapes/colors, tier as border color cue. */
export function getModuleIconSvg(type: ModuleIconType, tier: string = 'I'): string {
  const t = TIER_COLORS[tier] || TIER_COLORS.I;
  const c = t.stroke;
  const f = t.fill;
  const r = roman(tier);
  // Distinct geometry per type; tier ring + small numeral mark
  const shapes: Record<ModuleIconType, string> = {
    weapon: `<polygon points="16,3 20,11 28,11 22,17 24,26 16,21 8,26 10,17 4,11 12,11" fill="${f}" stroke="${c}" stroke-width="1.5"/><path d="M16 11v8M13 16h6" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`,
    miner: `<path d="M16 4 L16 16" stroke="${c}" stroke-width="2" stroke-linecap="round"/><path d="M8 14 L16 22 L24 14" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><rect x="11" y="18" width="10" height="7" rx="1.5" fill="${f}" stroke="${c}" stroke-width="1.5"/><circle cx="16" cy="10" r="3" fill="${c}" opacity="0.7"/>`,
    repair: `<rect x="13" y="5" width="6" height="22" rx="1" fill="${f}" stroke="${c}" stroke-width="1.5"/><rect x="5" y="13" width="22" height="6" rx="1" fill="${f}" stroke="${c}" stroke-width="1.5"/><circle cx="16" cy="16" r="9" fill="none" stroke="${c}" stroke-width="1.2" stroke-dasharray="2 2"/>`,
    shield: `<path d="M16 3 L27 8 V15 C27 22 21 27 16 29 C11 27 5 22 5 15 V8 Z" fill="${f}" stroke="${c}" stroke-width="1.8"/><path d="M16 8 L16 24 M10 16 L22 16" stroke="${c}" stroke-width="1.2" opacity="0.8"/>`,
    propulsion: `<path d="M6 16 L20 16" stroke="${c}" stroke-width="2"/><path d="M16 10 L24 16 L16 22 Z" fill="${c}"/><path d="M4 12 L8 16 L4 20" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="10" cy="16" rx="2" ry="4" fill="${f}" stroke="${c}" stroke-width="1"/>`,
    scanner: `<circle cx="16" cy="14" r="5" fill="${f}" stroke="${c}" stroke-width="1.6"/><circle cx="16" cy="14" r="2" fill="${c}"/><path d="M16 19 L16 28 M11 23 L21 23 M4 14 A12 12 0 0 1 28 14" fill="none" stroke="${c}" stroke-width="1.4"/>`,
    armor: `<rect x="5" y="5" width="22" height="22" rx="3" fill="${f}" stroke="${c}" stroke-width="2"/><path d="M5 11 H27 M5 17 H27 M11 5 V27 M17 5 V27 M21 11 V17" stroke="${c}" stroke-width="1.2" opacity="0.75"/>`,
    reactor: `<circle cx="16" cy="16" r="10" fill="${f}" stroke="${c}" stroke-width="1.8"/><circle cx="16" cy="16" r="4" fill="${c}" opacity="0.5"/><path d="M16 6 V12 M16 20 V26 M6 16 H12 M20 16 H26" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
    cargo: `<path d="M7 11 L16 6 L25 11 V22 L16 27 L7 22 Z" fill="${f}" stroke="${c}" stroke-width="1.8"/><path d="M7 11 L16 16 L25 11 M16 16 V27" stroke="${c}" stroke-width="1.2"/><rect x="12" y="4" width="8" height="3" rx="1" fill="${c}" opacity="0.6"/>`,
  };
  const body = shapes[type] || shapes.weapon;
  return `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><circle cx="16" cy="16" r="14.5" fill="rgba(10,18,28,0.7)" stroke="${c}" stroke-width="1.2" opacity="0.9"/>${body}<text x="27" y="30" font-size="6" font-weight="700" text-anchor="end" fill="${c}" font-family="monospace">${r}</text></svg>`;
}

export function getSlotGlyphSvg(slot: 'high' | 'mid' | 'low'): string {
  const label = slot === 'high' ? 'H' : slot === 'mid' ? 'M' : 'L';
  return `<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1.5" stroke-dasharray="3 3"/><text x="16" y="20" font-size="11" font-weight="700" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-family="monospace">${label}</text></svg>`;
}
