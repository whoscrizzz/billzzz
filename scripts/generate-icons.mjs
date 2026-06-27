import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const flatSvg = readFileSync(join(root, "public/brand-mark.svg"));
const icon3dSvg = readFileSync(join(root, "public/brand-mark-3d.svg"));

/** Flat mark for tiny favicons; 3D mark for home screen / PWA */
const jobs = [
  { svg: flatSvg, sizes: [16, 32] },
  { svg: icon3dSvg, sizes: [180, 192, 512] },
];

for (const { svg, sizes } of jobs) {
  for (const size of sizes) {
    const out = join(root, "public", `icon-${size}.png`);
    await sharp(svg).resize(size, size).png().toFile(out);
    console.log(`Generated ${out}`);
  }
}

console.log("Icons ready. favicon.svg (flat) + icon-180/192/512 (3D) from brand-mark-3d.svg");
