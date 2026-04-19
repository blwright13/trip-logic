import { supabase } from "@/lib/supabase";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export interface Activity {
  id: number;
  title: string;
  category: "flight" | "hotel" | "food" | "sightseeing" | "entertainment" | "cafe" | "shopping" | "transport";
  start: string;
  duration: number;
  cost: number;
  location: string | null;
  info_url?: string | null;
}

export type PlanningPhase = "gathering" | "confirming" | "generating" | "complete";

export interface Trip {
  id: number;
  title: string;
  start: string;
  end: string;
  num_people: number;
  budget: number;
  created_at: string;
  activities: Activity[];
  planning_phase?: PlanningPhase;
  planning_context?: Record<string, unknown>;
  initial_request?: string | null;
}

export interface Profile {
  user_id: string;
  email: string | null;
  display_name: string | null;
  home_city: string | null;
  preferred_currency: string | null;
  travel_style_tags: string[];
}

export interface ProfileUpdate {
  display_name?: string;
  home_city?: string;
  preferred_currency?: string;
  travel_style_tags?: string[];
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  chips: string[] | null;
  flight_options?: FlightOption[] | null;
  cards?: SuggestionCard[] | null;
  created_at: string;
}

export interface FlightOption {
  airline: string;
  flight_number?: string | null;
  departure_time: string;
  arrival_time: string;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  duration_minutes?: number | null;
  stops?: number | null;
  price_usd?: number | null;
  booking_url?: string | null;
  tag?: string | null;
  // Apply context (embedded by backend)
  apply_mode?: "replace" | "add" | null;
  replace_activity_id?: number | null;
  replace_category?: string | null;
  target_date?: string | null;
}

export interface SuggestionCard {
  type: "hotel" | "tour" | "food" | "entertainment" | string;
  title: string;
  image_url?: string | null;
  description?: string | null;
  rating?: number | null;
  estimated_price?: string | null;
  estimated_cost?: number | null;
  url?: string | null;
  location?: string | null;
  fit_reason?: string | null;
  // Apply context (embedded by backend)
  apply_mode?: "replace" | "add" | null;
  replace_activity_id?: number | null;
  replace_category?: string | null;
  target_date?: string | null;
}

export interface ApplySuggestionRequest {
  apply_mode: "replace" | "add";
  replace_activity_id?: number | null;
  replace_category?: string | null;
  target_date?: string | null;
  title: string;
  category: string;
  location?: string | null;
  cost?: number | null;
  info_url?: string | null;
  duration?: number | null;
}

export interface ApplySuggestionResult {
  activity_id: number;
  mode: "replaced" | "added";
}

export interface DayActivity {
  id: number;
  name: string;
  time: string;
  cost: number;
  location: string | null;
  category: Activity["category"];
  info_url?: string | null;
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const bearer = session?.access_token;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
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

/** Present when the backend ran full itinerary generation on this turn (see server logs for details). */
export interface ItineraryBuildMeta {
  agent: string;
  openai_model: string;
  used_tools: boolean;
  llm_completion_rounds: number;
  tool_calls_total: number;
  tools_by_name: Record<string, number>;
  finish: string;
  fallback_reason: string | null;
  parsed_activity_count: number;
}

export interface PlanningChatResult {
  message: ChatMessage;
  trip_updated: boolean;
  planning_phase: PlanningPhase;
  planning_context: Record<string, unknown>;
  missing_slots: string[];
  ready_to_generate: boolean;
  itinerary_build_meta?: ItineraryBuildMeta | null;
}

export async function sendPlanningMessage(tripId: number, message: string): Promise<PlanningChatResult> {
  return fetchApi<PlanningChatResult>(`/trips/${tripId}/planning/message`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export interface TastePlaceSuggestion {
  id: string;
  name: string | null;
  address: string | null;
  rating: number | null;
  price_level?: string | number | null;
  photo_url?: string | null;
  description?: string | null;
  google_maps_uri?: string | null;
  website_uri?: string | null;
  synthetic?: boolean;
  types: string[];
  query: string;
}

export interface TasteSuggestionsResult {
  suggestions: TastePlaceSuggestion[];
  configured: boolean;
  reason?: string;
}

export async function getPlanningTasteSuggestions(tripId: number): Promise<TasteSuggestionsResult> {
  return fetchApi<TasteSuggestionsResult>(`/trips/${tripId}/planning/taste-suggestions`);
}

export async function postPlanningTasteSignals(
  tripId: number,
  body: { liked: TastePlaceSuggestion[]; disliked: TastePlaceSuggestion[]; skip?: boolean }
): Promise<PlanningChatResult> {
  return fetchApi<PlanningChatResult>(`/trips/${tripId}/planning/taste-signals`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function postPlanningConfirm(tripId: number): Promise<PlanningChatResult> {
  return fetchApi<PlanningChatResult>(`/trips/${tripId}/planning/confirm`, {
    method: "POST",
  });
}

export async function patchPlanningContext(
  tripId: number,
  planningContext: Record<string, unknown>
): Promise<Trip> {
  return fetchApi<Trip>(`/trips/${tripId}/planning-context`, {
    method: "PATCH",
    body: JSON.stringify({ planning_context: planningContext }),
  });
}

export async function claimTrip(tripId: number): Promise<Trip> {
  return fetchApi<Trip>(`/trips/${tripId}/claim`, {
    method: "PATCH",
  });
}

export async function getProfile(): Promise<Profile> {
  return fetchApi<Profile>("/profile");
}

export async function updateProfile(data: ProfileUpdate): Promise<Profile> {
  return fetchApi<Profile>("/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
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

export async function applySuggestion(
  tripId: number,
  body: ApplySuggestionRequest
): Promise<ApplySuggestionResult> {
  return fetchApi<ApplySuggestionResult>(`/trips/${tripId}/suggestions/apply`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
