const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const toIco = require("to-ico");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");

async function renderSvg(svgPath, size) {
  const svg = await fs.readFile(svgPath);
  return sharp(svg).resize(size, size).png().toBuffer();
}

async function main() {
  await fs.mkdir(ASSETS, { recursive: true });
  await fs.mkdir(path.join(ROOT, "public"), { recursive: true });

  const iconSvg = path.join(ASSETS, "icon.svg");
  const traySvg = path.join(ASSETS, "tray.svg");
  const iconSizes = [256, 128, 64, 48, 32, 16];

  const iconPngBuffers = await Promise.all(iconSizes.map((size) => renderSvg(iconSvg, size)));
  const trayPng = await renderSvg(traySvg, 32);
  const faviconPng = await renderSvg(iconSvg, 32);

  await fs.writeFile(path.join(ASSETS, "icon.png"), iconPngBuffers[0]);
  await fs.writeFile(path.join(ASSETS, "tray.png"), trayPng);
  await fs.writeFile(path.join(ASSETS, "favicon.png"), faviconPng);
  await fs.writeFile(path.join(ASSETS, "icon.ico"), await toIco(iconPngBuffers));
  await fs.writeFile(path.join(ROOT, "public", "favicon.png"), faviconPng);

  console.log("Generated assets/icon.png, assets/tray.png, assets/favicon.png, assets/icon.ico, public/favicon.png");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
