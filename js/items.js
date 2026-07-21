// Recall variants share a `name` with their base item (see DESIGN.md,
// "Recall Variants"). Deduping and keeping the first occurrence in file
// order means the base item - authored ahead of its variants - is the
// one kept, since it's the one that should represent that name wherever
// only one entry per real-world item is wanted.
export function dedupeByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}
