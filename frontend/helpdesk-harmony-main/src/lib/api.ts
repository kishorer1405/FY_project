// Central API helper. Set VITE_API_BASE in env to point at your backend.
export const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) || "";

export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("session_token") : null;
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function downloadComplaintReport(complaintId: string | number): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("session_token") : null;
  const response = await fetch(`${API_BASE}/complaint/${complaintId}/report`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Report download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `complaint-${complaintId}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadAdminReport(type: string): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("session_token") : null;
  const response = await fetch(`${API_BASE}/admin/report?type=${encodeURIComponent(type)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Report download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `admin-${type}-report.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
