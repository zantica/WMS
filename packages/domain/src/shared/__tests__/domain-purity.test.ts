import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda arquitectónica (ADR 006): el dominio es TypeScript puro.
 * Falla si algún fichero de src/ importa infraestructura o APIs de Node.
 */
const SRC_DIR = join(__dirname, "..", "..");
const FORBIDDEN = [
  /^@wms\/db/,
  /^@prisma\//,
  /^prisma$/,
  /^fastify/,
  /^@fastify\//,
  /^react/,
  /^next(\/|$)/,
  /^expo/,
  /^node:/,
  /^(fs|path|crypto|http|https|os|child_process|stream|buffer|util)(\/|$)/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "__tests__" ? [] : sourceFiles(full);
    }
    return full.endsWith(".ts") ? [full] : [];
  });
}

function importedModules(source: string): string[] {
  const pattern = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  return [...source.matchAll(pattern)].flatMap((match) => (match[1] ? [match[1]] : []));
}

describe("Pureza del dominio — guarda de imports", () => {
  const files = sourceFiles(SRC_DIR);

  it("encuentra los ficheros fuente del dominio", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("no importa infraestructura, frameworks ni APIs de Node", () => {
    const violations = files.flatMap((file) =>
      importedModules(readFileSync(file, "utf8"))
        .filter((module) => FORBIDDEN.some((rule) => rule.test(module)))
        .map((module) => `${file} -> ${module}`),
    );
    expect(violations).toEqual([]);
  });

  it("no lee process.env", () => {
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes("process.env"));
    expect(offenders).toEqual([]);
  });

  it("el detector reconoce imports prohibidos (la guarda no es vacua)", () => {
    const sample = 'import { prisma } from "@wms/db";\nimport fs from "node:fs";\nimport x from "./ok.js";';
    const found = importedModules(sample).filter((m) => FORBIDDEN.some((rule) => rule.test(m)));
    expect(found).toEqual(["@wms/db", "node:fs"]);
  });
});
