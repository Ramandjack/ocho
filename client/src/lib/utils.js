export function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 1)  return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString("es-AR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(dateStr);
  }
}

export function smartDate(dateStr) {
  if (!dateStr) return "—";
  const days = (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
  if (days < 7) return timeAgo(dateStr);
  return new Date(dateStr).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: days > 365 ? "numeric" : undefined,
  });
}
