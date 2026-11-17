// apps/api/src/ports/password-hasher.ts
// Puerto hexagonal para hashing y verificación segura de contraseñas.

export interface PasswordHasherPort {
  hash(plainText: string): Promise<string>;
  verify(plainText: string, passwordHash: string): Promise<boolean>;
}
