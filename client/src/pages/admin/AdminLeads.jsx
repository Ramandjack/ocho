import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../hooks/useToast.js";
import { formatDate, exportCSV, ToastContainer, ModalRow } from "./adminUtils.jsx";

function stageClass(stage) {
  if (stage === "new")       return "warning";
  if (stage === "qualified") return "success";
  if (stage === "closed")    return "danger";
  return "";
}

function leadId(lead) {
  return lead.nocodb_id || lead.nocodb_record_id || lead.Id || "";
}

export default function AdminLeads() {
  const [leads, setLeads]         = useState([]);
  const [search, setSearch]       = useState("");
  const [stageFilter, setStage]   = useState("all");
  const [modal, setModal]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const { toasts, show } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/leads");
      setLeads(res.leads ?? []);
    } catch (err) {
      show(err.message, "danger");
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return leads.filter(l => {
      const text = `${l.name || ""} ${l.email || ""} ${l.company || ""} ${l.project_type || ""}`.toLowerCase();
      return (!s || text.includes(s)) && (stageFilter === "all" || (l.stage || "new") === stageFilter);
    }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [leads, search, stageFilter]);

  async function updateStage(rid, newStage) {
    if (!rid) { show("ID de lead no disponible.", "danger"); return; }
    try {
      await apiFetch(`/api/admin/leads/${rid}/stage`, { method: "PATCH", body: JSON.stringify({ stage: newStage }) });
      setLeads(prev => prev.map(l => leadId(l) === rid ? { ...l, stage: newStage } : l));
      show(`Lead → "${newStage}"`, "success");
    } catch (err) { show(err.message, "danger"); }
  }

  if (loading) return <div className="view-loading">Cargando leads…</div>;

  return (
    <>
      <section className="admin-topbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Leads captados</h1>
          <p>{leads.length} leads en el sistema</p>
        </div>
        <button type="button" className="admin-btn" onClick={() => exportCSV(filtered, "ocho_leads.csv", show)}>
          ↓ Exportar CSV
        </button>
      </section>

      <section className="admin-full">
        <article className="admin-card">
          <div className="admin-controls">
            <input
              className="admin-control"
              type="search"
              placeholder="Buscar por nombre, email, empresa…"
              style={{ flex: 1, minWidth: 160 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="admin-control" value={stageFilter} onChange={e => setStage(e.target.value)}>
              <option value="all">Todos los stages</option>
              <option value="new">Nuevo</option>
              <option value="contacted">Contactado</option>
              <option value="qualified">Calificado</option>
              <option value="closed">Cerrado</option>
            </select>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Lead</th><th>Empresa</th><th>Proyecto</th><th>Budget</th><th>Stage</th><th>Fecha</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {!filtered.length ? (
                  <tr><td colSpan={7} className="admin-muted" style={{ textAlign: "center", padding: 32 }}>Sin resultados.</td></tr>
                ) : filtered.map((lead, i) => {
                  const stage = lead.stage || "new";
                  const rid   = leadId(lead);
                  return (
                    <tr key={rid || i}>
                      <td>
                        <strong>{lead.name || "—"}</strong>
                        <span className="admin-muted" style={{ display: "block", fontSize: "0.82rem" }}>{lead.email}</span>
                      </td>
                      <td>{lead.company || "—"}</td>
                      <td><span className="admin-pill">{lead.project_type || "—"}</span></td>
                      <td className="admin-muted" style={{ fontSize: "0.88rem" }}>{lead.budget || "—"}</td>
                      <td><span className={`admin-pill ${stageClass(stage)}`}>{stage}</span></td>
                      <td className="admin-muted" style={{ fontSize: "0.82rem" }}>{lead.created_at ? formatDate(lead.created_at) : "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="button" className="admin-btn" onClick={() => setModal(lead)}>Ver</button>
                          {stage !== "contacted" && stage !== "qualified" && stage !== "closed" && rid && (
                            <button type="button" className="admin-btn" onClick={() => updateStage(rid, "contacted")}>Contactado</button>
                          )}
                          {stage === "contacted" && rid && (
                            <button type="button" className="admin-btn" onClick={() => updateStage(rid, "qualified")}>Calificar</button>
                          )}
                          {stage === "qualified" && rid && (
                            <button type="button" className="admin-btn" onClick={() => updateStage(rid, "closed")}>Cerrar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {modal && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="admin-card admin-modal-card modal-inner">
            <button type="button" className="admin-modal-close" onClick={() => setModal(null)}>✕</button>
            <div className="modal-header">
              <h2 style={{ margin: "0 0 4px" }}>{modal.name || "Lead"}</h2>
              <span className="admin-muted">{modal.email}</span>
            </div>
            <div className="modal-grid">
              <ModalRow label="Empresa"      value={modal.company} />
              <ModalRow label="Proyecto"     value={modal.project_type} />
              <ModalRow label="Presupuesto"  value={modal.budget} />
              <ModalRow label="Stage"        value={modal.stage || "new"} />
              <ModalRow label="Segmento"     value={modal.segment} />
              <ModalRow label="Fuente"       value={modal.source} />
              <ModalRow label="Fecha"        value={modal.created_at ? formatDate(modal.created_at) : "—"} />
            </div>
            {modal.message && (
              <div style={{ marginTop: 16 }}>
                <span className="modal-label">Mensaje</span>
                <div className="admin-card" style={{ padding: 14, marginTop: 8, fontSize: "0.94rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {modal.message}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </>
  );
}
