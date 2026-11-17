// apps/mobile/src/theme/__tests__/app-config.test.ts
// Tests para verificar la configuración de iconos de marca Navelo en app.json y presencia de assets en apps/mobile.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Mobile App Config & Assets — Marca Navelo", () => {
  it("contiene los punteros canónicos a los iconos de marca en app.json", () => {
    const appJsonPath = path.resolve(__dirname, "../../../app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));

    expect(appJson.expo.icon).toBe("./assets/icon.png");
    expect(appJson.expo.android?.adaptiveIcon).toEqual({
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0F6E56",
    });
    expect(appJson.expo.web?.favicon).toBe("./assets/favicon.png");
  });

  it("verifica la existencia de los assets referenciados en apps/mobile/assets", () => {
    const mobileRoot = path.resolve(__dirname, "../../..");
    const iconPath = path.join(mobileRoot, "assets/icon.png");
    const adaptiveIconPath = path.join(mobileRoot, "assets/adaptive-icon.png");
    const faviconPath = path.join(mobileRoot, "assets/favicon.png");

    expect(fs.existsSync(iconPath)).toBe(true);
    expect(fs.existsSync(adaptiveIconPath)).toBe(true);
    expect(fs.existsSync(faviconPath)).toBe(true);
  });
});
