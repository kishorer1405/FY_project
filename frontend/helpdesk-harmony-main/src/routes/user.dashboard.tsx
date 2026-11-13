import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { api, downloadComplaintReport, fileToBase64 } from "../lib/api";
import { Alert } from "../components/Alert";
import { LocationHeatmap } from "../components/LocationHeatmap";
import { useLanguage } from "../i18n/useLanguage";

export const Route = createFileRoute("/user/dashboard")({
  component: UserDashboard,
});

type Complaint = {
  id?: string;
  _id?: string;
  text: string;
  category?: string;
  department?: string;
  priority?: string;
  status?: string;
  response?: string;
  location?: string;
  created_at?: string;
};

const statusClass = (s?: string) => {
  const v = (s || "").toLowerCase();
  if (v.includes("complete")) return "crs-badge crs-badge-completed";
  if (v.includes("process")) return "crs-badge crs-badge-process";
  if (v.includes("reject")) return "crs-badge crs-badge-rejected";
  return "crs-badge crs-badge-pending";
};

function UserDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [location, setLocation] = useState("");
  const [language, setLanguage] = useState("auto");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number; altitude: number | null; accuracy: number | null } | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ kind: "success" | "error"; text: string }>({ kind: "success", text: "" });
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) {
      navigate({ to: "/user/login" });
      return;
    }
    setUserId(id);
  }, [navigate]);

  const fetchList = useCallback(async (id: string) => {
    setLoadingList(true);
    setListError("");
    try {
      const data = await api<Complaint[] | { complaints: Complaint[] }>(`/user/complaints/${id}`);
      const list = Array.isArray(data) ? data : data?.complaints ?? [];
      setComplaints(list);
    } catch (err: any) {
      setListError(err.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (userId) fetchList(userId);
  }, [userId, fetchList]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    setSubmitMsg({ kind: "success", text: "" });
    try {
      if (imageFile && (!imageFile.type.startsWith("image/") || imageFile.size > 5 * 1024 * 1024)) {
        throw new Error(t("imageError"));
      }
      const image = imageFile ? await fileToBase64(imageFile) : null;
      await api("/complaint", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          text,
          location,
          image,
          language: language === "auto" ? undefined : language,
          ...(coordinates || {}),
          coordinate_reference_system: coordinates ? "WGS84" : undefined,
          capture_timestamp: coordinates ? new Date().toISOString() : undefined,
        }),
      });
      setSubmitMsg({ kind: "success", text: t("complaintSuccess") });
      setText("");
      setLocation("");
      setImageFile(null);
      setCoordinates(null);
      fetchList(userId);
    } catch (err: any) {
      setSubmitMsg({ kind: "error", text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setSubmitMsg({ kind: "error", text: t("locationUnsupported") });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => setCoordinates({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        altitude: position.coords.altitude,
        accuracy: position.coords.accuracy,
      }),
      () => setSubmitMsg({ kind: "error", text: t("locationDenied") }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const downloadReport = async (id: string) => {
    setReporting(id);
    try {
      await downloadComplaintReport(id);
    } catch (err: any) {
      setListError(err.message);
    } finally {
      setReporting(null);
    }
  };

  const translateValue = (value?: string) => {
    const labels: Record<string, string> = {
      Pending: t("pending"), "In Process": t("inProcess"), Completed: t("completed"), Rejected: t("rejected"),
      Electrical: t("electrical"), Electricity: t("electrical"), Water: t("water"), Garbage: t("garbage"),
      Road: t("road"), Fire: t("fire"), Other: t("other"), Low: "Low", Medium: "Medium", High: "High",
    };
    return value ? labels[value] || value : value;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 grid lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2">
        <div className="crs-card">
          <h2 className="text-xl font-bold">{t("submitComplaint")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("routeComplaint")}</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="crs-label">{t("description")}</label>
              <textarea
                required
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("issuePlaceholder")}
                className="crs-input resize-y"
              />
            </div>
            <div>
              <label className="crs-label">{t("locationAddress")}</label>
              <input className="crs-input" required value={location}
                onChange={(e) => setLocation(e.target.value)} placeholder={t("locationPlaceholder")} />
            </div>
            <div>
              <label className="crs-label">{t("complaintLanguage")}</label>
              <select className="crs-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="auto">{t("autoDetect")}</option>
                <option value="en">{t("english")}</option>
                <option value="kn">{t("kannada")}</option>
                <option value="hi">{t("hindi")}</option>
              </select>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" className="crs-btn crs-btn-ghost text-sm" onClick={captureLocation}>
                {t("useCurrentLocation")}
              </button>
              {coordinates && <span className="text-xs text-muted-foreground">{t("gpsCaptured")}: {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</span>}
            </div>
            <div>
              <label className="crs-label">{t("imageOptional")}</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                className="crs-input file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1 file:text-sm file:text-accent-foreground"
              />
            </div>
            <Alert kind={submitMsg.kind} message={submitMsg.text} />
            <button disabled={submitting} className="crs-btn w-full">
              {submitting ? t("submitting") : t("submitComplaintButton")}
            </button>
          </form>
        </div>
      </section>

      <section className="lg:col-span-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">{t("yourComplaints")}</h2>
          <button
            onClick={() => userId && fetchList(userId)}
            className="crs-btn crs-btn-ghost text-sm"
            disabled={loadingList}
          >
            {loadingList ? t("loading") : t("refresh")}
          </button>
        </div>

        {listError && <Alert kind="error" message={listError} />}
        {!loadingList && complaints.length === 0 && !listError && (
          <div className="crs-card text-center text-muted-foreground">
            {t("noComplaints")}
          </div>
        )}
        <div className="space-y-3">
          {complaints.map((c, i) => (
            <article key={c.id ?? c._id ?? i} className="crs-card">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium leading-relaxed">{c.text}</p>
                <span className={statusClass(c.status)}>{translateValue(c.status) || t("pending")}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {c.category && <span className="crs-badge">{t("category")}: {translateValue(c.category)}</span>}
                {c.department && <span className="crs-badge">{t("dept")}: {translateValue(c.department)}</span>}
                {c.priority && <span className="crs-badge">{t("priority")}: {translateValue(c.priority)}</span>}
              </div>
              {c.response && (
                <p className="mt-3 text-sm text-muted-foreground border-l-2 border-primary pl-3">
                  <span className="font-medium text-foreground">{t("response")}:</span> {c.response}
                </p>
              )}
              {(c.id || c._id) && (
                <button
                  type="button"
                  className="crs-btn crs-btn-ghost text-sm mt-3"
                  disabled={reporting === String(c.id ?? c._id)}
                  onClick={() => downloadReport(String(c.id ?? c._id))}
                >
                  {reporting === String(c.id ?? c._id) ? t("preparing") : t("downloadPdf")}
                </button>
              )}
            </article>
          ))}
        </div>

        <div className="mt-6">
          <LocationHeatmap title={t("campusHeatmap")} />
        </div>
      </section>
    </div>
  );
}
