# Report Code Snippets

These excerpts are taken from the current project source and are formatted for direct insertion into Chapter 8 of the B.Tech report. The paths are relative to the project root.

---

## 8.1 Home Page

**Path:** `frontend/helpdesk-harmony-main/src/routes/index.tsx`  
**Component:** `Home`

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "../i18n/useLanguage";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { t } = useLanguage();

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-20">
      <section className="text-center">
        <span className="crs-badge mb-4">{t("aiPowered")}</span>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
          {t("complaintResolutionSystem")}
        </h1>
        <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
          {t("homeDescription")}
        </p>
      </section>

      <section className="mt-12 grid sm:grid-cols-2 gap-5">
        <div className="crs-card">
          <h2 className="text-lg font-semibold">{t("forCitizens")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("citizenDescription")}
          </p>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Link to="/user/login" className="crs-btn">{t("login")}</Link>
            <Link to="/user/register" className="crs-btn crs-btn-ghost">{t("register")}</Link>
          </div>
        </div>

        <div className="crs-card">
          <h2 className="text-lg font-semibold">{t("forAuthorities")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("authorityDescription")}
          </p>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Link to="/authority/login" className="crs-btn">{t("login")}</Link>
            <Link to="/authority/register" className="crs-btn crs-btn-ghost">{t("register")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
```

**Explanation:** The route creates the landing page and uses TanStack Router links to direct citizens and authorities to their respective authentication pages. The language hook provides English/Kannada interface text.

---

## 8.2 User Login Activity

**Path:** `frontend/helpdesk-harmony-main/src/routes/user.login.tsx`  
**Component:** `UserLogin`

```tsx
function UserLogin() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string }>({
    kind: "success",
    text: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validatePhone(form.phone, language);
    setPhoneError(validationError);
    if (validationError) return;

    setLoading(true);
    setMsg({ kind: "success", text: "" });
    try {
      const data = await api("/user/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const id = data?.user_id ?? data?.id ?? data?.user?.id;
      if (!id) throw new Error(t("missingUserId"));
      localStorage.setItem("user_id", String(id));
      if (data.token) localStorage.setItem("session_token", data.token);
      navigate({ to: "/user/dashboard" });
    } catch (err: any) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <input
        className="crs-input"
        required
        value={form.phone}
        onChange={(e) => {
          setForm({ ...form, phone: e.target.value });
          setPhoneError("");
        }}
      />
      {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
      <input
        className="crs-input"
        type="password"
        required
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <Alert kind={msg.kind} message={msg.text} />
      <button type="submit" disabled={loading} className="crs-btn w-full">
        {loading ? t("loggingIn") : t("login")}
      </button>
    </form>
  );
}
```

**Explanation:** The form validates the phone number, sends the existing JSON payload to `/user/login`, stores the returned user ID and bearer token, and navigates to the user dashboard.

---

## 8.3 Authority Login Activity

**Path:** `frontend/helpdesk-harmony-main/src/routes/authority.login.tsx`  
**Component:** `AuthorityLogin`

```tsx
const DEPARTMENTS = ["fire", "water", "electricity", "road", "garbage"] as const;

function AuthorityLogin() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    phone: "",
    password: "",
    department: "fire",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validatePhone(form.phone, language);
    setPhoneError(validationError);
    if (validationError) return;

    setLoading(true);
    try {
      const data = await api<{ token?: string }>("/authority/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      localStorage.setItem("department", form.department);
      if (data.token) localStorage.setItem("session_token", data.token);
      navigate({ to: "/authority/dashboard" });
    } catch (err: any) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <input
        className="crs-input"
        required
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <input
        className="crs-input"
        type="password"
        required
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <select
        className="crs-input"
        value={form.department}
        onChange={(e) => setForm({ ...form, department: e.target.value })}
      >
        {DEPARTMENTS.map((department) => (
          <option key={department} value={department}>
            {department}
          </option>
        ))}
      </select>
      <button disabled={loading} className="crs-btn w-full">
        {loading ? t("loggingIn") : t("login")}
      </button>
    </form>
  );
}
```

**Explanation:** The authority form sends phone, password, and department to `/authority/login`. The backend returns a token containing the authority role and department claim.

---

## 8.4 User Dashboard

**Path:** `frontend/helpdesk-harmony-main/src/routes/user.dashboard.tsx`  
**Component:** `UserDashboard`

```tsx
const fetchList = useCallback(async (id: string) => {
  setLoadingList(true);
  setListError("");
  try {
    const data = await api<Complaint[] | { complaints: Complaint[] }>(
      `/user/complaints/${id}`,
    );
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
```

Complaint submission and display:

```tsx
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

{complaints.map((complaint, index) => (
  <article key={complaint.id ?? complaint._id ?? index} className="crs-card">
    <p>{complaint.text}</p>
    <span>{translateValue(complaint.status) || t("pending")}</span>
    <span>{t("category")}: {translateValue(complaint.category)}</span>
    <span>{t("dept")}: {translateValue(complaint.department)}</span>
    <span>{t("priority")}: {translateValue(complaint.priority)}</span>
    <p>{t("response")}: {complaint.response}</p>
  </article>
))}

<LocationHeatmap title={t("campusHeatmap")} />
```

**Explanation:** The dashboard retrieves only the authenticated citizen’s complaints, displays classification and status information, submits new complaints, and includes the location analytics component.

---

## 8.5 Authority Dashboard

**Path:** `frontend/helpdesk-harmony-main/src/routes/authority.dashboard.tsx`  
**Component:** `AuthorityDashboard`

```tsx
const load = useCallback(async (dep: string) => {
  setLoading(true);
  setError("");
  try {
    const data = await api<Complaint[] | { complaints: Complaint[] }>(
      `/authority/complaints/${dep}`,
    );
    const list = Array.isArray(data) ? data : data?.complaints ?? [];
    setComplaints(list);
  } catch (err: any) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}, []);

const updateStatus = async (complaint: Complaint, status: string) => {
  const id = complaint.id ?? complaint._id;
  if (!id) return;

  setUpdating(String(id));
  try {
    await api("/complaint/status", {
      method: "PUT",
      body: JSON.stringify({ complaint_id: id, status }),
    });
    setComplaints((previous) =>
      previous.map((item) =>
        (item.id ?? item._id) === id ? { ...item, status } : item,
      ),
    );
    setToast({ kind: "success", text: t("statusUpdated") });
  } catch (err: any) {
    setToast({ kind: "error", text: err.message });
  } finally {
    setUpdating(null);
  }
};
```

**Explanation:** The authority dashboard loads the department stored after login. Status updates are sent to `/complaint/status`; the backend independently verifies the authority’s department before accepting the change.

---

## 8.6 Master Agent Dashboard

**Path:** `frontend/helpdesk-harmony-main/src/routes/admin.dashboard.tsx`  
**Component:** `AdminDashboard`

```tsx
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
```

System report download:

```tsx
const downloadSystemReport = async (type: string) => {
  try {
    await downloadAdminReport(type);
  } catch (err: any) {
    setError(err.message);
  }
};

["overall", "activity", "citizen_activity", "authority_activity", "department", "status"].map((type) => (
  <button
    className="crs-btn crs-btn-ghost text-sm"
    key={type}
    onClick={() => downloadSystemReport(type)}
  >
    Download {type.replaceAll("_", " ")} report
  </button>
))
```

**Explanation:** The Master Agent dashboard is protected by an admin token. It retrieves system statistics, complaint records, audit activities, and provides complaint-level and system-wide PDF downloads. It is intentionally not connected to the English/Kannada selector.

---

## 8.7 Heatmap

### Heatmap Data Retrieval

**Path:** `frontend/helpdesk-harmony-main/src/components/LocationHeatmap.tsx`  
**Component:** `LocationHeatmap`

```tsx
useEffect(() => {
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (department) params.set("department", department);
      if (userId) params.set("user_id", userId);

      const query = params.toString() ? `?${params.toString()}` : "";
      const heatmapData = await api<{ points: HeatPoint[] }>(
        `/insights/heatmap${query}`,
      );
      const summaryData = await api<Summary>(`/insights/summary${query}`);

      setPoints(heatmapData.points || []);
      setSummary(summaryData);
    } catch (err: any) {
      setError(err.message || "Failed to load heatmap insights");
    } finally {
      setLoading(false);
    }
  };

  load();
}, [department, userId]);
```

### Map Visualization

**Path:** `frontend/helpdesk-harmony-main/src/components/BengaluruGeoMap.tsx`  
**Component:** `BengaluruGeoMap`

```tsx
<MapContainer
  center={[12.9716, 77.5946]}
  zoom={11.5}
  scrollWheelZoom
  className="h-full w-full"
>
  <TileLayer
    attribution='&copy; OpenStreetMap contributors'
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  />
  <FitBounds points={points} />
  {points.map((point) => {
    const radius = 14 + point.weight * 2.3;
    const fillColor = pointColor(point.weight, maxWeight);

    return (
      <CircleMarker
        key={`${point.area}-${point.lat}-${point.lng}`}
        center={[point.lat, point.lng]}
        radius={radius}
        pathOptions={{
          color: fillColor,
          fillColor,
          fillOpacity: 0.28,
          weight: 2,
        }}
      >
        <Tooltip>
          {point.area}: {point.weight} complaints
        </Tooltip>
        <Popup>
          <div>
            <strong>{point.area}</strong>
            <div>Complaints: {point.weight}</div>
            <div>
              Lat: {point.lat.toFixed(4)},
              Lng: {point.lng.toFixed(4)}
            </div>
          </div>
        </Popup>
      </CircleMarker>
    );
  })}
</MapContainer>
```

**Explanation:** The heatmap component calls the backend insights endpoints. The map component uses complaint area, latitude, longitude, and count/weight to draw colored geographic markers. Popups provide locality and coordinate details.

---

## Source Path Summary

| Report topic | Source path |
|---|---|
| Home page | `frontend/helpdesk-harmony-main/src/routes/index.tsx` |
| User login | `frontend/helpdesk-harmony-main/src/routes/user.login.tsx` |
| Authority login | `frontend/helpdesk-harmony-main/src/routes/authority.login.tsx` |
| User dashboard | `frontend/helpdesk-harmony-main/src/routes/user.dashboard.tsx` |
| Authority dashboard | `frontend/helpdesk-harmony-main/src/routes/authority.dashboard.tsx` |
| Master Agent dashboard | `frontend/helpdesk-harmony-main/src/routes/admin.dashboard.tsx` |
| Heatmap data retrieval | `frontend/helpdesk-harmony-main/src/components/LocationHeatmap.tsx` |
| Heatmap map rendering | `frontend/helpdesk-harmony-main/src/components/BengaluruGeoMap.tsx` |
| API helper | `frontend/helpdesk-harmony-main/src/lib/api.ts` |
| Backend complaint processing | `app.py` |
