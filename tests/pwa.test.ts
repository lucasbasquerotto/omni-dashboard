import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── PWA install splash: navy #0a0f1e background ──
// The Android PWA install splash renders the manifest background_color/theme_color
// (plus the theme-color meta tag). Regression test for task
// task_omnidev_dashboard_pwa_install_background_navy.

const html = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
const manifest = JSON.parse(
  readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf-8"),
);

describe("PWA manifest (public/manifest.webmanifest)", () => {
  it("declares navy background_color #0a0f1e", () => {
    assert.equal(manifest.background_color, "#0a0f1e");
  });

  it("declares navy theme_color #0a0f1e", () => {
    assert.equal(manifest.theme_color, "#0a0f1e");
  });

  it("is installable: standalone display + start_url + icons", () => {
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.start_url, "/");
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  });
});

describe("index.html PWA wiring", () => {
  it("links the web app manifest", () => {
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  });

  it("sets theme-color meta to #0a0f1e", () => {
    assert.match(html, /<meta name="theme-color" content="#0a0f1e" \/>/);
  });
});

describe("PWA install icons (public/icons)", () => {
  const pngIcons = (
    manifest.icons as Array<{
      src: string;
      sizes: string;
      type: string;
      purpose?: string;
    }>
  ).filter((icon) => icon.type === "image/png");

  it("declares raster PNG icons with sizes 192x192 and 512x512", () => {
    const sizes = pngIcons.map((icon) => icon.sizes);
    assert.ok(sizes.includes("192x192"), "a 192x192 PNG icon must be declared");
    assert.ok(sizes.includes("512x512"), "a 512x512 PNG icon must be declared");
  });

  it("declares PNG icons for purpose any and purpose maskable", () => {
    const purposes = pngIcons.map((icon) => icon.purpose ?? "any");
    assert.ok(purposes.includes("any"), "an 'any' purpose PNG icon must be declared");
    assert.ok(purposes.includes("maskable"), "a 'maskable' purpose PNG icon must be declared");
  });

  for (const icon of pngIcons) {
    it(`icon file exists, is a non-empty PNG and matches its declared size: ${icon.src}`, () => {
      const filePath = new URL(`../public${icon.src}`, import.meta.url);
      const data = readFileSync(filePath);
      assert.ok(data.length > 1000, `${icon.src} must not be empty`);
      assert.deepEqual(
        [...data.subarray(0, 8)],
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        `${icon.src} must be a PNG file`,
      );
      const width = data.readUInt32BE(16);
      const height = data.readUInt32BE(20);
      const [declaredWidth, declaredHeight] = icon.sizes.split("x").map((part) => Number(part));
      assert.equal(width, declaredWidth, `${icon.src} width must match its declared size`);
      assert.equal(height, declaredHeight, `${icon.src} height must match its declared size`);
    });
  }
});
