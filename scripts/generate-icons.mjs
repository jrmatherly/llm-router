import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (name) => readFileSync(path.join(root, "build", "icons", name), "utf8");
const out = (relative, data) => {
  writeFileSync(path.join(root, relative), data);
  console.log(relative);
};

const icon = source("icon.svg");
const iconSmall = source("icon-small.svg");
const tray = source("tray.svg");
const trayMascot = source("tray-mascot.svg");
// The tile spans 100..924 of the 1024 grid; web and Windows icons drop the macOS margin.
const iconBleed = icon.replace('viewBox="0 0 1024 1024"', 'viewBox="100 100 824 824"');
if (iconBleed === icon) {
  throw new Error("build/icons/icon.svg must keep viewBox=\"0 0 1024 1024\"");
}

const trayColors = {
  cyan: { base: "#06B6D4", dark: "#0E7490", light: "#A5F3FC" },
  orange: { base: "#F97316", dark: "#C2410C", light: "#FED7AA" },
  violet: { base: "#7C3AED", dark: "#5B21B6", light: "#C4B5FD" }
};

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(svg, size, style = "") {
  await page.setViewportSize({ height: size, width: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent;${style}">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`
  );
  return page.screenshot({ omitBackground: true, type: "png" });
}

function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ data, size }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

function icns(chunks) {
  const parts = chunks.map(({ data, type }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(8 + parts.reduce((total, part) => total + part.length, 0), 4);
  return Buffer.concat([head, ...parts]);
}

try {
  const master = await render(icon, 1024);
  const bleed = await render(iconBleed, 1024);
  for (const target of ["build/icon.png", "packages/electron/assets/logo.png", "packages/ui/src/assets/logo.png", "docs/public/logo.png"]) {
    out(target, master);
  }
  out("docs/public/llmr-icon.png", bleed);

  const icnsTypes = [["ic11", 32], ["ic12", 64], ["ic07", 128], ["ic13", 256], ["ic08", 256], ["ic14", 512], ["ic09", 512], ["ic10", 1024]];
  const icnsBySize = new Map([[1024, master]]);
  const icnsChunks = [];
  for (const [type, size] of icnsTypes) {
    if (!icnsBySize.has(size)) {
      icnsBySize.set(size, await render(icon, size));
    }
    icnsChunks.push({ data: icnsBySize.get(size), type });
  }
  out("build/icon.icns", icns(icnsChunks));

  const icoImages = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    icoImages.push({ data: await render(size <= 32 ? iconSmall : iconBleed, size), size });
  }
  out("build/icon.ico", ico(icoImages));

  out("packages/electron/assets/tray.png", await render(tray, 512));
  for (const [id, { base, dark, light }] of Object.entries(trayColors)) {
    const png = await render(trayMascot, 512, `--base:${base};--dark:${dark};--light:${light}`);
    out(`packages/electron/assets/tray-${id}.png`, png);
    out(`packages/ui/src/assets/tray-${id}.png`, png);
  }
} finally {
  await browser.close();
}
