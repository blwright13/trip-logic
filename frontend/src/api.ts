import type { AuthResponse, DemoChatResponse, PlanKey, Trip, TripSummary, User } from "./types";

let authToken: string | null = null;

function buildHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  return headers;
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: buildHeaders(init)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(payload.detail ?? "Request failed");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function register(email: string, password: string) {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function login(email: string, password: string) {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function getCurrentUser() {
  return request<User>("/api/auth/me");
}

export function logout() {
  return request<void>("/api/auth/logout", { method: "POST" });
}

export function listTrips() {
  return request<TripSummary[]>("/api/trips");
}

export function getTrip(tripId: string) {
  return request<Trip>(`/api/trips/${tripId}`);
}

export function updateTrip(tripId: string, payload: Partial<Trip>) {
  return request<Trip>(`/api/trips/${tripId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function sendTripChat(tripId: string, message: string, plan: PlanKey) {
  return request<DemoChatResponse>(`/api/trips/${tripId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message, plan })
  });
}

export function swapTripActivities(
  tripId: string,
  plan: PlanKey,
  dayNumber: number,
  sourceActivityId: string,
  targetActivityId: string
) {
  return request<Trip>(`/api/trips/${tripId}/plans/${plan}/days/${dayNumber}/swap`, {
    method: "POST",
    body: JSON.stringify({
      source_activity_id: sourceActivityId,
      target_activity_id: targetActivityId
    })
  });
}
