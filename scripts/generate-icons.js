const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const toIco = require("to-ico");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const BUILD = path.join(ROOT, "build");

async function renderSvgSquare(svgPath, size) {
  const svg = await fs.readFile(svgPath);
  return sharp(svg).resize(size, size).png().toBuffer();
}

async function renderSvgToBmp(svgPath, width, height, outputPath) {
  const svg = await fs.readFile(svgPath);
  const { data } = await sharp(svg)
    .resize(width, height)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buffer = Buffer.alloc(fileSize);

  buffer.write("BM", 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelDataSize, 34);

  let offset = 54;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      buffer[offset++] = data[index + 2];
      buffer[offset++] = data[index + 1];
      buffer[offset++] = data[index];
    }
    offset += rowSize - width * 3;
  }

  await fs.writeFile(outputPath, buffer);
}

async function main() {
  await fs.mkdir(ASSETS, { recursive: true });
  await fs.mkdir(BUILD, { recursive: true });
  await fs.mkdir(path.join(ROOT, "public"), { recursive: true });

  const iconSvg = path.join(ASSETS, "icon.svg");
  const traySvg = path.join(ASSETS, "tray.svg");
  const iconSizes = [256, 128, 64, 48, 32, 16];

  const iconPngBuffers = await Promise.all(iconSizes.map((size) => renderSvgSquare(iconSvg, size)));
  const trayPng = await renderSvgSquare(traySvg, 32);
  const faviconPng = await renderSvgSquare(iconSvg, 32);

  await fs.writeFile(path.join(ASSETS, "icon.png"), iconPngBuffers[0]);
  await fs.writeFile(path.join(ASSETS, "tray.png"), trayPng);
  await fs.writeFile(path.join(ASSETS, "favicon.png"), faviconPng);
  await fs.writeFile(path.join(ASSETS, "icon.ico"), await toIco(iconPngBuffers));
  await fs.writeFile(path.join(ROOT, "public", "favicon.png"), faviconPng);

  await renderSvgToBmp(path.join(ASSETS, "installer-sidebar.svg"), 164, 314, path.join(BUILD, "installer-sidebar.bmp"));
  await renderSvgToBmp(
    path.join(ASSETS, "installer-uninstall-sidebar.svg"),
    164,
    314,
    path.join(BUILD, "uninstaller-sidebar.bmp")
  );
  await renderSvgToBmp(path.join(ASSETS, "installer-header.svg"), 150, 57, path.join(BUILD, "installer-header.bmp"));

  console.log(
    "Generated app icons, installer sidebar/header BMPs, and public/favicon.png"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
