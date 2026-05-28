const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const toIco = require("to-ico");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const BUILD = path.join(ROOT, "build");
const LOGO_SOURCE = path.join(ASSETS, "logo-source.png");
const TRAY_DARK_SOURCE = path.join(ASSETS, "tray-dark-source.png");
const TRAY_LIGHT_SOURCE = path.join(ASSETS, "tray-light-source.png");

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const BRAND_BG = { r: 0, g: 0, b: 0, alpha: 1 };
const EDGE_CROP_PX = 2;
const BACKGROUND_KEY_THRESHOLD = 42;
const SOURCE_CROP_X = 4;

let processedLogoCache = null;
let trimmedLogoCache = null;

function keyOutDarkBackground(data) {
  for (let i = 0; i < data.length; i += 4) {
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    if (red <= BACKGROUND_KEY_THRESHOLD && green <= BACKGROUND_KEY_THRESHOLD && blue <= BACKGROUND_KEY_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
}

async function buildTrimmedLogoFromSource() {
  if (trimmedLogoCache) {
    return trimmedLogoCache;
  }

  const meta = await sharp(LOGO_SOURCE).metadata();
  const left = Math.min(SOURCE_CROP_X, Math.floor(((meta.width || 1) - 1) / 2));
  const width = Math.max(1, (meta.width || 1) - left * 2);
  const height = meta.height || 1;

  const { data, info } = await sharp(LOGO_SOURCE)
    .extract({ left, top: 0, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  keyOutDarkBackground(data);

  trimmedLogoCache = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .trim({ threshold: 8 })
    .png()
    .toBuffer();

  return trimmedLogoCache;
}

async function buildProcessedLogo() {
  if (processedLogoCache) {
    return processedLogoCache;
  }

  const meta = await sharp(LOGO_SOURCE).metadata();
  const crop = Math.min(EDGE_CROP_PX, Math.floor(((meta.width || 1) - 1) / 2), Math.floor(((meta.height || 1) - 1) / 2));
  const width = Math.max(1, (meta.width || 1) - crop * 2);
  const height = Math.max(1, (meta.height || 1) - crop * 2);

  const { data, info } = await sharp(LOGO_SOURCE)
    .extract({ left: crop, top: crop, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  keyOutDarkBackground(data);

  processedLogoCache = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .trim({ threshold: 8 })
    .png()
    .toBuffer();

  return processedLogoCache;
}

async function renderAppIcon(size, padding = 2) {
  const trimmed = await buildTrimmedLogoFromSource();
  const inner = Math.max(1, size - padding * 2);
  const logo = await sharp(trimmed)
    .resize(inner, inner, {
      fit: "contain",
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function renderInstallerLogo(size) {
  const trimmed = await buildTrimmedLogoFromSource();

  return sharp(trimmed)
    .resize(size, size, {
      fit: "contain",
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();
}

async function renderTitlebarLogo(size) {
  const trimmed = await buildTrimmedLogoFromSource();

  return sharp(trimmed)
    .resize(size, size, {
      fit: "contain",
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();
}

async function renderFavicon(size) {
  const processed = await buildProcessedLogo();
  const padding = 1;
  const inner = Math.max(1, size - padding * 2);

  return sharp(processed)
    .resize(inner, inner, {
      fit: "contain",
      background: TRANSPARENT,
    })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();
}

async function renderTransparentLogo(size, padding = 0) {
  const processed = await buildProcessedLogo();
  const inner = Math.max(1, size - padding * 2);

  return sharp(processed)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();
}

async function renderTrayIcon(sourcePath, size = 32, fallbackPadding = 2) {
  try {
    await fs.access(sourcePath);
    return sharp(sourcePath)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    return renderTransparentLogo(size, fallbackPadding);
  }
}

async function pngBufferToBmp(pngBuffer, width, height) {
  const { data } = await sharp(pngBuffer)
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

  return buffer;
}

function installerLabelSvg(width, height, lines, accent = "#14B8A6") {
  const textLines = lines
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${line.y}" text-anchor="middle" fill="${line.color || "#eef3f8"}" font-family="Segoe UI, Arial, sans-serif" font-size="${line.size}" font-weight="${line.weight || 400}">${line.text}</text>`
    )
    .join("");

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="transparent"/>${textLines}<rect x="${width - 6}" width="6" height="${height}" fill="${accent}" opacity="0.28"/></svg>`
  );
}

async function renderInstallerSidebar(lines, accent) {
  const width = 164;
  const height = 314;
  const logo = await renderInstallerLogo(84);

  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 11, g: 14, b: 18, alpha: 1 },
    },
  });

  const labeled = await base
    .composite([
      { input: logo, top: 42, left: 40 },
      { input: installerLabelSvg(width, height, lines, accent), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  return pngBufferToBmp(labeled, width, height);
}

async function renderInstallerHeader() {
  const width = 150;
  const height = 57;
  const logo = await renderInstallerLogo(36);

  const labeled = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 17, g: 22, b: 28, alpha: 1 },
    },
  })
    .composite([
      { input: logo, top: 10, left: 12 },
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="58" y="34" fill="#eef3f8" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">G Skydimo Ambilight App</text><rect y="53" width="${width}" height="4" fill="#14B8A6"/></svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  return pngBufferToBmp(labeled, width, height);
}

async function main() {
  const uiAssets = path.join(ROOT, "src", "assets");

  await fs.mkdir(ASSETS, { recursive: true });
  await fs.mkdir(BUILD, { recursive: true });
  await fs.mkdir(uiAssets, { recursive: true });
  await fs.mkdir(path.join(ROOT, "public"), { recursive: true });

  await fs.access(LOGO_SOURCE);

  processedLogoCache = null;
  trimmedLogoCache = null;

  const iconSizes = [256, 128, 64, 48, 32, 16];
  const iconPngBuffers = await Promise.all(iconSizes.map((size) => renderAppIcon(size)));
  const titlebarLogo = await renderTitlebarLogo(64);
  const trayDarkPng = await renderTrayIcon(TRAY_DARK_SOURCE, 32);
  const trayLightPng = await renderTrayIcon(TRAY_LIGHT_SOURCE, 32);
  const faviconPng = await renderFavicon(32);

  await fs.writeFile(path.join(ASSETS, "icon.png"), iconPngBuffers[0]);
  await fs.writeFile(path.join(ASSETS, "tray-dark.png"), trayDarkPng);
  await fs.writeFile(path.join(ASSETS, "tray-light.png"), trayLightPng);
  await fs.writeFile(path.join(ASSETS, "tray.png"), trayLightPng);
  await fs.writeFile(path.join(ASSETS, "favicon.png"), faviconPng);
  await fs.writeFile(path.join(ASSETS, "icon.ico"), await toIco(iconPngBuffers));
  await fs.writeFile(path.join(ROOT, "public", "favicon.png"), faviconPng);
  await fs.writeFile(path.join(uiAssets, "app-logo.png"), titlebarLogo);

  await fs.writeFile(
    path.join(BUILD, "installer-sidebar.bmp"),
    await renderInstallerSidebar(
      [
        { text: "G Skydimo", y: 152, size: 15, weight: 700 },
        { text: "Ambilight App", y: 172, size: 11, weight: 600, color: "#14B8A6" },
        { text: "Screen sync • Colors • Animations", y: 196, size: 8.5, color: "#8b949e" },
      ],
      "#14B8A6"
    )
  );

  await fs.writeFile(
    path.join(BUILD, "uninstaller-sidebar.bmp"),
    await renderInstallerSidebar(
      [
        { text: "Uninstall", y: 152, size: 14, weight: 700 },
        { text: "G Skydimo Ambilight", y: 172, size: 11, weight: 600, color: "#FF6B6B" },
        { text: "Remove the app from your PC", y: 196, size: 8.5, color: "#8b949e" },
      ],
      "#FF6B6B"
    )
  );

  await fs.writeFile(path.join(BUILD, "installer-header.bmp"), await renderInstallerHeader());

  console.log("Generated app icons, tray dark/light icons, installer graphics, and UI favicon");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
