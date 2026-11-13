import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { api, downloadComplaintReport } from "../lib/api";
import { Alert } from "../components/Alert";
import { LocationHeatmap } from "../components/LocationHeatmap";
import { useLanguage } from "../i18n/useLanguage";

export const Route = createFileRoute("/authority/dashboard")({
  component: AuthorityDashboard,
});

type Complaint = {
  id?: string;
  _id?: string;
  text: string;
  location?: string;
  category?: string;
  priority?: string;
  status?: string;
};

const STATUSES = ["Pending", "In Process", "Completed", "Rejected"] as const;

const statusClass = (s?: string) => {
  const v = (s || "").toLowerCase();
  if (v.includes("complete")) return "crs-badge crs-badge-completed";
  if (v.includes("process")) return "crs-badge crs-badge-process";
  if (v.includes("reject")) return "crs-badge crs-badge-rejected";
  return "crs-badge crs-badge-pending";
};

function AuthorityDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [department, setDepartment] = useState<string | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string }>({ kind: "success", text: "" });
  const [reporting, setReporting] = useState<string | null>(null);

  const translateValue = (value?: string) => {
    const labels: Record<string, string> = {
      Pending: t("pending"), "In Process": t("inProcess"), Completed: t("completed"), Rejected: t("rejected"),
      Electrical: t("electrical"), Electricity: t("electrical"), Water: t("water"), Garbage: t("garbage"),
      Road: t("road"), Fire: t("fire"), Other: t("other"), Low: "Low", Medium: "Medium", High: "High",
    };
    return value ? labels[value] || value : value;
  };

  useEffect(() => {
    const dep = localStorage.getItem("department");
    if (!dep) {
      navigate({ to: "/authority/login" });
      return;
    }
    setDepartment(dep);
  }, [navigate]);

  const load = useCallback(async (dep: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await api<Complaint[] | { complaints: Complaint[] }>(`/authority/complaints/${dep}`);
      const list = Array.isArray(data) ? data : data?.complaints ?? [];
      setComplaints(list);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (department) load(department);
  }, [department, load]);

  const updateStatus = async (c: Complaint, status: string) => {
    const id = c.id ?? c._id;
    if (!id) return;
    setUpdating(String(id));
    setToast({ kind: "success", text: "" });
    try {
      await api("/complaint/status", {
        method: "PUT",
        body: JSON.stringify({ complaint_id: id, status }),
      });
      setComplaints((prev) =>
        prev.map((x) => ((x.id ?? x._id) === id ? { ...x, status } : x))
      );
      setToast({ kind: "success", text: t("statusUpdated") });
    } catch (err: any) {
      setToast({ kind: "error", text: err.message });
    } finally {
      setUpdating(null);
    }
  };

  const downloadReport = async (id: string) => {
    setReporting(id);
    try {
      await downloadComplaintReport(id);
    } catch (err: any) {
      setToast({ kind: "error", text: err.message });
    } finally {
      setReporting(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t("departmentDashboard")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("showingComplaints")}{" "}
            <span className="crs-badge">{translateValue(department || "")}</span>
          </p>
        </div>
        <button
          onClick={() => department && load(department)}
          className="crs-btn crs-btn-ghost text-sm"
          disabled={loading}
        >
          {loading ? t("loading") : t("refresh")}
        </button>
      </div>

      {toast.text && <div className="mb-4"><Alert kind={toast.kind} message={toast.text} /></div>}
      {error && <Alert kind="error" message={error} />}

      {!loading && complaints.length === 0 && !error && (
        <div className="crs-card text-center text-muted-foreground">
          {t("noAssignedComplaints")}
        </div>
      )}

      <div className="space-y-3">
        {complaints.map((c, i) => {
          const id = String(c.id ?? c._id ?? i);
          return (
            <article key={id} className="crs-card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-sm font-medium leading-relaxed flex-1 min-w-[200px]">{c.text}</p>
                <span className={statusClass(c.status)}>{translateValue(c.status) || t("pending")}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {c.location && <span className="crs-badge">📍 {c.location}</span>}
                {c.category && <span className="crs-badge">{t("category")}: {translateValue(c.category)}</span>}
                {c.priority && <span className="crs-badge">{t("priority")}: {translateValue(c.priority)}</span>}
              </div>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <label className="text-xs text-muted-foreground">{t("updateStatus")}</label>
                <select
                  className="crs-input max-w-[180px]"
                  value={c.status && STATUSES.includes(c.status as any) ? c.status : "Pending"}
                  disabled={updating === id}
                  onChange={(e) => updateStatus(c, e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{translateValue(s)}</option>
                  ))}
                </select>
                {updating === id && <span className="text-xs text-muted-foreground">{t("saving")}</span>}
              </div>
              <button
                type="button"
                className="crs-btn crs-btn-ghost text-sm mt-3"
                disabled={reporting === id}
                onClick={() => downloadReport(id)}
              >
                {reporting === id ? t("preparing") : t("downloadPdf")}
              </button>
            </article>
          );
        })}
      </div>

      <div className="mt-6">
        <LocationHeatmap
          title={t("departmentHeatmap")}
          department={department || undefined}
        />
      </div>
    </div>
  );
}
