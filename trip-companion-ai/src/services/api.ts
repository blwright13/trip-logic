const API_BASE = "/api";

export interface Activity {
  id: number;
  title: string;
  category: "flight" | "hotel" | "food" | "sightseeing" | "entertainment" | "cafe" | "shopping" | "transport";
  start: string;
  duration: number;
  cost: number;
  location: string | null;
}

export interface Trip {
  id: number;
  title: string;
  start: string;
  end: string;
  num_people: number;
  budget: number;
  created_at: string;
  activities: Activity[];
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  chips: string[] | null;
  created_at: string;
}

export interface DayActivity {
  id: number;
  name: string;
  time: string;
  cost: number;
  location: string | null;
  category: Activity["category"];
}

export interface DayItinerary {
  day: number;
  date: string;
  activities: DayActivity[];
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "An error occurred" }));
    throw new ApiError(response.status, error.detail || "An error occurred");
  }

  return response.json();
}

// Trip endpoints

export async function createTrip(request: string): Promise<Trip> {
  return fetchApi<Trip>("/trips", {
    method: "POST",
    body: JSON.stringify({ request }),
  });
}

export async function getTrip(tripId: number): Promise<Trip> {
  return fetchApi<Trip>(`/trips/${tripId}`);
}

export async function getTrips(): Promise<Trip[]> {
  return fetchApi<Trip[]>("/trips");
}

export async function updateTrip(tripId: number, data: Partial<Trip>): Promise<Trip> {
  return fetchApi<Trip>(`/trips/${tripId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTrip(tripId: number): Promise<void> {
  await fetchApi(`/trips/${tripId}`, {
    method: "DELETE",
  });
}

// Chat endpoints

export async function sendMessage(tripId: number, message: string): Promise<{ message: ChatMessage; trip_updated: boolean }> {
  return fetchApi(`/trips/${tripId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function getChatHistory(tripId: number): Promise<ChatMessage[]> {
  return fetchApi<ChatMessage[]>(`/trips/${tripId}/chat`);
}

// Itinerary endpoint

export async function getItinerary(tripId: number): Promise<DayItinerary[]> {
  return fetchApi<DayItinerary[]>(`/trips/${tripId}/itinerary`);
}

// Activity CRUD endpoints

export interface ActivityUpdate {
  title?: string;
  category?: Activity["category"];
  start?: string;
  duration?: number;
  cost?: number;
  location?: string;
}

export interface ActivityCreate {
  title: string;
  category: Activity["category"];
  start: string;
  duration?: number;
  cost?: number;
  location?: string;
}

export interface AlternativeActivity {
  title: string;
  category: Activity["category"];
  cost: number;
  location: string;
  reason: string;
}

export interface AlternativesResponse {
  alternatives: AlternativeActivity[];
}

export async function updateActivity(activityId: number, data: ActivityUpdate): Promise<Activity> {
  return fetchApi<Activity>(`/activities/${activityId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteActivity(activityId: number): Promise<void> {
  await fetchApi(`/activities/${activityId}`, {
    method: "DELETE",
  });
}

export async function createActivity(tripId: number, data: ActivityCreate): Promise<Activity> {
  return fetchApi<Activity>(`/trips/${tripId}/activities`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function reorderActivities(tripId: number, activityIds: number[]): Promise<void> {
  await fetchApi(`/trips/${tripId}/activities/reorder`, {
    method: "PUT",
    body: JSON.stringify({ activity_ids: activityIds }),
  });
}

export async function getAlternatives(tripId: number, activityId: number): Promise<AlternativesResponse> {
  return fetchApi<AlternativesResponse>(`/trips/${tripId}/activities/${activityId}/alternatives`, {
    method: "POST",
  });
}
