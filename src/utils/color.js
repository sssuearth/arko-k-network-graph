export function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function mix(hex, targetRgb, amount) {
  const { r, g, b } = hexToRgb(hex);
  const m = (a, t) => Math.round(a + (t - a) * amount);
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(m(r, targetRgb.r))}${toHex(m(g, targetRgb.g))}${toHex(m(b, targetRgb.b))}`;
}

export function lighten(hex, amount) {
  return mix(hex, { r: 255, g: 255, b: 255 }, amount);
}

export function darken(hex, amount) {
  return mix(hex, { r: 0, g: 0, b: 0 }, amount);
}
