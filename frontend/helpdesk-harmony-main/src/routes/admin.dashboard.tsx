import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, downloadAdminReport, downloadComplaintReport } from "../lib/api";
import { Alert } from "../components/Alert";
import { LocationHeatmap } from "../components/LocationHeatmap";

export const Route = createFileRoute("/admin/dashboard")({ component: AdminDashboard });

type Stats = {
  total_citizens: number;
  total_authorities: number;
  total_complaints: number;
  stale_open_complaints: number;
  status_breakdown: Array<{ status: string; count: number }>;
  department_breakdown: Array<{ department: string; count: number }>;
};

type Complaint = { id: number; text: string; department: string; status: string; priority: string; location?: string };
type Activity = { id: number; event: string; actor_role?: string; entity_id?: number; created_at: string };

function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState<number | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("admin_id") || !localStorage.getItem("session_token")) {
      navigate({ to: "/admin/login" });
      return;
    }
    Promise.all([
      api<Stats>("/admin/stats"),
      api<{ complaints: Complaint[] }>("/admin/complaints"),
      api<{ activities: Activity[] }>("/admin/activities?limit=20"),
    ]).then(([nextStats, nextComplaints, nextActivities]) => {
      setStats(nextStats);
      setComplaints(nextComplaints.complaints);
      setActivities(nextActivities.activities);
    }).catch((err: any) => setError(err.message));
  }, [navigate]);

  const visibleComplaints = complaints.filter((complaint) => {
    const query = filter.toLowerCase().trim();
    return !query || [complaint.text, complaint.department, complaint.status, complaint.priority].some((value) => value?.toLowerCase().includes(query));
  });

  const report = async (id: number) => {
    setReporting(id);
    try {
      await downloadComplaintReport(id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReporting(null);
    }
  };

  const downloadSystemReport = async (type: string) => {
    try {
      await downloadAdminReport(type);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold">Master Agent dashboard</h1>
          <p className="text-sm text-muted-foreground">System-wide complaint, activity, and geographic monitoring.</p>
        </div>
        <button className="crs-btn crs-btn-ghost text-sm" onClick={() => window.location.reload()}>Refresh</button>
      </div>
      {error && <Alert kind="error" message={error} />}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
          {[
            ["Citizens", stats.total_citizens],
            ["Authorities", stats.total_authorities],
            ["Complaints", stats.total_complaints],
            ["Open 7+ days", stats.stale_open_complaints],
            ["Completed", stats.status_breakdown.find((item) => item.status === "Completed")?.count || 0],
          ].map(([label, value]) => <div className="crs-card" key={String(label)}><div className="text-sm text-muted-foreground">{label}</div><div className="text-3xl font-bold mt-2">{value}</div></div>)}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <section className="crs-card">
          <h2 className="font-semibold">Department performance</h2>
          <div className="mt-3 space-y-2">{(stats?.department_breakdown || []).map((item) => <div className="flex justify-between text-sm" key={item.department}><span>{item.department}</span><strong>{item.count}</strong></div>)}</div>
        </section>
        <section className="crs-card">
          <h2 className="font-semibold">Status statistics</h2>
          <div className="mt-3 space-y-2">{(stats?.status_breakdown || []).map((item) => <div className="flex justify-between text-sm" key={item.status}><span>{item.status}</span><strong>{item.count}</strong></div>)}</div>
        </section>
      </div>
      <section className="crs-card mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap"><h2 className="font-semibold">Complaint monitoring</h2><input className="crs-input max-w-sm" placeholder="Search complaints" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
        <div className="mt-4 space-y-3">{visibleComplaints.map((complaint) => <article className="border-b border-border pb-3" key={complaint.id}><div className="flex justify-between gap-3"><p className="text-sm font-medium">#{complaint.id} {complaint.text}</p><span className="crs-badge">{complaint.status}</span></div><div className="text-xs text-muted-foreground mt-2">{complaint.department} · {complaint.priority} · {complaint.location || "Location unavailable"}</div><button className="crs-btn crs-btn-ghost text-xs mt-2" disabled={reporting === complaint.id} onClick={() => report(complaint.id)}>{reporting === complaint.id ? "Preparing..." : "Download report"}</button></article>)}{visibleComplaints.length === 0 && <p className="text-sm text-muted-foreground mt-4">No matching complaints.</p>}</div>
      </section>
      <section className="crs-card mb-6"><h2 className="font-semibold">Recent activity</h2><div className="mt-3 space-y-2">{activities.map((activity) => <div className="text-sm border-l-2 border-primary pl-3" key={activity.id}><strong>{activity.event}</strong> · {activity.actor_role || "system"} · {activity.created_at}</div>)}</div></section>
      <section className="crs-card mb-6"><h2 className="font-semibold">System reports</h2><div className="mt-3 flex flex-wrap gap-2">{["overall", "activity", "citizen_activity", "authority_activity", "department", "status"].map((type) => <button className="crs-btn crs-btn-ghost text-sm" key={type} onClick={() => downloadSystemReport(type)}>Download {type.replaceAll("_", " ")} report</button>)}</div></section>
      <LocationHeatmap title="System geographic insights" />
    </div>
  );
}
