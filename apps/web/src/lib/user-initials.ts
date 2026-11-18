// apps/web/src/lib/user-initials.ts
// Helper puro para derivar iniciales legibles de un usuario para avatares de sesión.

export function getUserInitials(name: string, email?: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const second = parts[1]?.[0] ?? "";
    const combined = `${first}${second}`.toUpperCase();
    if (combined.length > 0) return combined;
  }

  if (parts.length === 1 && parts[0]) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  if (email && email.trim().length > 0) {
    return email.trim().slice(0, 2).toUpperCase();
  }

  return "US";
}
