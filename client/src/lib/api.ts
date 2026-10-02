export interface PublicUser {
  id: string;
  fullName: string;
  department: string;
  regNumber: string;
  googleEmail: string | null;
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
    ca_score: number | null;
    exam_score: number | null;
    total_score: number | null;
  }>;
}

export interface CoursePayload {
  code: string;
  title?: string;
  units: number;
  grade: string;
  ca_score?: number;
  exam_score?: number;
}

export class ApiError extends Error {
  status: number;
  details?: Record<string, string[]>;
  code?: string;
  constructor(status: number, message: string, details?: Record<string, string[]>, code?: string) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
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
    throw new ApiError(
      res.status,
      (data as { error?: string }).error ?? 'Something went wrong.',
      (data as { details?: Record<string, string[]> }).details,
      (data as { code?: string }).code
    );
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: PublicUser }>('/api/auth/me'),
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
  googlePending: () => request<{ pending: { email: string; name: string } }>('/api/auth/google/pending'),
  googleComplete: (body: { fullName: string; department: string; regNumber: string; claimExisting?: boolean }) =>
    request<{ user: PublicUser; claimed?: boolean }>('/api/auth/google/complete', { method: 'POST', body: JSON.stringify(body) })
};
