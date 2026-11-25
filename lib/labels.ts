// Format UI labels without lowercasing acronyms, names, or the underlying values.
export function labelCase(label: string) {
  return label.replace(/(^|[\s–—/-])([a-z])/g, (_, separator: string, initial: string) => separator + initial.toUpperCase());
}
