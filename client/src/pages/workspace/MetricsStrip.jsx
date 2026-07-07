function computeMetrics(tasks) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const completedThisWeek = tasks.filter(t => {
    if (t.status !== "done") return false;
    const updated = new Date(t.UpdatedAt || t.CreatedAt || 0);
    return updated >= weekAgo;
  }).length;

  const doneWithEstimate = tasks.filter(t => t.status === "done" && t.estimated_hours != null);
  const avgHours = doneWithEstimate.length
    ? doneWithEstimate.reduce((sum, t) => sum + t.estimated_hours, 0) / doneWithEstimate.length
    : null;

  const remainingHours = tasks
    .filter(t => t.status !== "done" && t.estimated_hours != null)
    .reduce((sum, t) => sum + t.estimated_hours, 0);

  const blockedCount = tasks.filter(t => t.status !== "done" && t.is_blocked).length;

  return { completedThisWeek, avgHours, remainingHours, blockedCount };
}

export default function MetricsStrip({ tasks }) {
  if (!tasks.length) return null;
  const { completedThisWeek, avgHours, remainingHours, blockedCount } = computeMetrics(tasks);

  return (
    <div className="metrics-strip">
      <div className="metric-tile">
        <p className="metric-label">Completadas esta semana</p>
        <p className="metric-value">{completedThisWeek}</p>
      </div>
      <div className="metric-tile">
        <p className="metric-label">Tiempo promedio / tarea</p>
        <p className="metric-value">{avgHours != null ? `${avgHours.toFixed(1)}h` : "—"}</p>
      </div>
      <div className="metric-tile">
        <p className="metric-label">Restante estimado</p>
        <p className="metric-value">{remainingHours > 0 ? `${remainingHours.toFixed(1)}h` : "—"}</p>
      </div>
      <div className="metric-tile">
        <p className="metric-label">Bloqueos</p>
        <p className={`metric-value${blockedCount > 0 ? " crit" : ""}`}>{blockedCount}</p>
      </div>
    </div>
  );
}
