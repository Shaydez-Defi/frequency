export interface PublicUser {
  id: string;
  fullName: string;
  department: string;
  regNumber: string;
  googleEmail: string | null;
  hasPassword: boolean;
}

export interface SemesterRecord {
  id: string;
  level: string;
  term: string;
  totalUnits: number;
  totalPoints: number;
  gp: number;
  createdAt: string;
  courses: Array<{
    id: string;
    code: string;
    title: string | null;
    units: number;
    grade: string;
    quality_points: number;
  }>;
}

export interface CoursePayload {
  code: string;
  title?: string;
  units: number;
  grade: string;
}

export class ApiError extends Error {
  status: number;
  details?: Record<string, string[]>;
  constructor(status: number, message: string, details?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Something went wrong.', (data as { details?: Record<string, string[]> }).details);
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: PublicUser }>('/api/auth/me'),
  register: (body: { fullName: string; department: string; regNumber: string; password: string; confirmPassword: string }) =>
    request<{ user: PublicUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { regNumber: string; password: string }) =>
    request<{ user: PublicUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  semesters: () =>
    request<{ semesters: SemesterRecord[]; cgpa: number | null; totalUnits: number; totalPoints: number }>('/api/semesters'),
  createSemester: (body: { level: string; term: string; courses: CoursePayload[] }) =>
    request<{ id: string; gp: number; totalUnits: number }>('/api/semesters', { method: 'POST', body: JSON.stringify(body) }),
  semester: (id: string) => request<{ semester: SemesterRecord }>(`/api/semesters/${id}`),
  updateSemester: (id: string, body: { level: string; term: string; courses: CoursePayload[] }) =>
    request<{ id: string; gp: number; totalUnits: number }>(`/api/semesters/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSemester: (id: string) => request<{ ok: true }>(`/api/semesters/${id}`, { method: 'DELETE' }),
  updateProfile: (body: { fullName?: string; department?: string }) =>
    request<{ user: PublicUser }>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (body: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
    request<{ ok: true }>('/api/auth/password', { method: 'POST', body: JSON.stringify(body) }),
  setupPassword: (body: { newPassword: string; confirmPassword: string }) =>
    request<{ ok: true }>('/api/auth/password/setup', { method: 'POST', body: JSON.stringify(body) }),
  googleComplete: (body: { fullName: string; department: string; regNumber: string }) =>
    request<{ user: PublicUser }>('/api/auth/google/complete', { method: 'POST', body: JSON.stringify(body) }),
  googleDisconnect: () => request<{ ok: true; user: PublicUser }>('/api/auth/google/disconnect', { method: 'POST' })
};
