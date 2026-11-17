// apps/api/src/adapters/bcrypt-password-hasher.ts
// Adaptador Bcrypt para PasswordHasherPort con salt rounds inyectados por constructor (CP-7: sin lectura directa de process.env).

import bcrypt from "bcryptjs";
import { WmsError } from "../plugins/error-handler.js";
import type { PasswordHasherPort } from "../ports/password-hasher.js";

export const DEFAULT_BCRYPT_SALT_ROUNDS = 12;
export const MIN_BCRYPT_SALT_ROUNDS = 10;
export const MAX_BCRYPT_SALT_ROUNDS = 14;

/**
 * Valida y resuelve el número de salt rounds para Bcrypt desde la configuración del composition root.
 * Exige un entero entre 10 y 14 (inclusive). Si no se provee, usa 12 por defecto.
 */
export function resolveBcryptSaltRounds(rawValue?: string | number): number {
  if (rawValue === undefined || rawValue === "") {
    return DEFAULT_BCRYPT_SALT_ROUNDS;
  }

  const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue.trim());
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_BCRYPT_SALT_ROUNDS ||
    parsed > MAX_BCRYPT_SALT_ROUNDS
  ) {
    throw new WmsError(
      "CONFIGURATION_ERROR",
      `BCRYPT_SALT_ROUNDS must be an integer between ${MIN_BCRYPT_SALT_ROUNDS} and ${MAX_BCRYPT_SALT_ROUNDS}`,
      500,
      { received: rawValue },
    );
  }

  return parsed;
}

export class BcryptPasswordHasher implements PasswordHasherPort {
  public readonly saltRounds: number;

  constructor(saltRounds: number = DEFAULT_BCRYPT_SALT_ROUNDS) {
    this.saltRounds = resolveBcryptSaltRounds(saltRounds);
  }

  public async hash(plainText: string): Promise<string> {
    if (typeof plainText !== "string" || plainText.length === 0) {
      throw new WmsError(
        "VALIDATION_ERROR",
        "Password cannot be empty",
        400,
      );
    }
    return bcrypt.hash(plainText, this.saltRounds);
  }

  public async verify(plainText: string, passwordHash: string): Promise<boolean> {
    if (
      typeof plainText !== "string" ||
      plainText.length === 0 ||
      typeof passwordHash !== "string" ||
      passwordHash.length === 0
    ) {
      return false;
    }
    return bcrypt.compare(plainText, passwordHash);
  }
}
