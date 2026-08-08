/**
 * Joins class names, dropping falsy entries. Deliberately dependency-free —
 * the project has no need for full Tailwind class-conflict resolution.
 */
export function cn(
  ...classes: (string | false | null | undefined)[]
): string {
  return classes.filter(Boolean).join(" ");
}
