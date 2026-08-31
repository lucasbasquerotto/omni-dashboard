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
