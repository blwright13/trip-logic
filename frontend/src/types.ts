export type PlanKey = "A" | "B" | "C";

export interface Activity {
  id: string;
  name: string;
  time: string;
  cost: number;
  location: string;
  category: string;
}

export interface DayPlan {
  day: number;
  date: string;
  activities: Activity[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  chips: string[];
}

export interface TripSummary {
  id: number;
  public_id: string;
  title: string;
  start_date: string;
  end_date: string;
  travelers: number;
  budget: number;
}

export interface Trip extends TripSummary {
  plans: Record<PlanKey, DayPlan[]>;
  chat_messages: ChatMessage[];
}

export interface DemoChatResponse {
  ai_response: string;
  chips: string[];
  trip?: Trip;
}

export interface User {
  id: number;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
