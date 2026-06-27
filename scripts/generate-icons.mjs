import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const markSvg = readFileSync(join(root, "public/brand-mark.svg"));
const appSvg = readFileSync(join(root, "public/app-icon.svg"));

/** Transparent mark for tabs; app-icon (soft tile) for home screen */
const jobs = [
  { svg: markSvg, sizes: [16, 32] },
  { svg: appSvg, sizes: [180, 192, 512] },
];

for (const { svg, sizes } of jobs) {
  for (const size of sizes) {
    const out = join(root, "public", `icon-${size}.png`);
    await sharp(svg).resize(size, size).png().toFile(out);
    console.log(`Generated ${out}`);
  }
}

console.log("Icons ready. brand-mark.svg (transparent) + app-icon.svg (tile) for PWA");
