import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// brand-mark.svg no trae color por defecto (currentColor puro — BrandMark.tsx
// lo fija vía CSS para la barra de navegación/login). Fuera de React no hay
// cascada que lo resuelva, así que aquí se inyecta el verde de marca a mano
// para que icon-16/32 no salgan en negro (initial value de `color` en SVG).
const BRAND_GREEN = '#2d6a4f';
const markSvg = Buffer.from(
  readFileSync(join(root, 'public/brand-mark.svg'), 'utf8').replace(
    '<svg ',
    `<svg color="${BRAND_GREEN}" `
  )
);
const appSvg = readFileSync(join(root, 'public/app-icon.svg'));
const maskableSvg = readFileSync(join(root, 'public/app-icon-maskable.svg'));

async function transparentIcon(svg, size, scale = 0.88) {
  const inner = Math.max(1, Math.round(size * scale));
  const mark = await sharp(svg).resize(inner, inner).png().ensureAlpha().toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer();
}

/** Browser tabs: transparent mark. PWA / iPhone tile: app-icon with soft background */
const jobs = [
  { svg: markSvg, sizes: [16, 32], transparent: true },
  { svg: appSvg, sizes: [180, 192, 512], transparent: false },
  { svg: maskableSvg, sizes: [512], transparent: false, suffix: '-maskable' },
];

for (const { svg, sizes, transparent, suffix = '' } of jobs) {
  for (const size of sizes) {
    const out = join(root, 'public', `icon-${size}${suffix}.png`);
    if (transparent) {
      const buf = await transparentIcon(svg, size);
      await sharp(buf).toFile(out);
    } else {
      await sharp(svg).resize(size, size).png().toFile(out);
    }
    console.log(`Generated ${out}${transparent ? ' (transparent)' : ''}`);
  }
}

console.log('Icons ready. favicon.svg + icon-16/32 transparent; PWA uses app-icon tile');
