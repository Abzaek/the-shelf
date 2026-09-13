function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Wraps case-insensitive matches of `query` in the text layer with a highlight mark. */
export function highlightText(str: string, query: string): string {
  const q = query.trim();
  if (!q) return escapeHtml(str);
  const lower = str.toLowerCase();
  const needle = q.toLowerCase();
  let out = "";
  let last = 0;
  let index = lower.indexOf(needle);
  while (index !== -1) {
    out += escapeHtml(str.slice(last, index));
    out += `<mark class="highlight">${escapeHtml(str.slice(index, index + needle.length))}</mark>`;
    last = index + needle.length;
    index = lower.indexOf(needle, last);
  }
  return out + escapeHtml(str.slice(last));
}
