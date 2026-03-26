import { FormEvent, useEffect, useRef, useState } from "react";

import {
  getCurrentUser,
  getTrip,
  listTrips,
  login,
  logout,
  register,
  sendTripChat,
  setAuthToken,
  swapTripActivities,
  updateTrip
} from "./api";
import type { Activity, AuthResponse, ChatMessage, PlanKey, Trip, TripSummary, User } from "./types";

const SESSION_TOKEN_KEY = "triplogic.session";

const quickTags = ["Weekend getaway", "Family vacation", "Solo backpacking", "Honeymoon"];
const destinations = [
  { id: 1, title: "Tokyo, Japan", subtitle: "5 days · Culture & Food", icon: "🏯" },
  { id: 2, title: "Bali, Indonesia", subtitle: "7 days · Beach & Wellness", icon: "🌴" },
  { id: 3, title: "Swiss Alps", subtitle: "4 days · Adventure", icon: "⛰️" },
  { id: 4, title: "Paris, France", subtitle: "3 days · Romance & Art", icon: "✈️" }
];
const planDescriptions: Record<PlanKey, string> = {
  A: "Balanced mix",
  B: "Budget-friendly",
  C: "Foodie focus"
};
const categoryIcons: Record<string, string> = {
  food: "🍽",
  sightseeing: "📸",
  transport: "🚌",
  hotel: "🏨",
  shopping: "🛍",
  entertainment: "🎭",
  flight: "✈️",
  cafe: "☕"
};

type Route =
  | { name: "login" }
  | { name: "landing" }
  | { name: "planner"; tripId: string }
  | { name: "summary"; tripId: string };

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    value
  );
}

function shortDate(dateStr: string) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function longDate(dateStr: string) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function readRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/login") return { name: "login" };
  if (path === "/") return { name: "landing" };
  const match = path.match(/^\/trips\/([^/]+)(?:\/(summary))?$/);
  if (!match) return { name: "landing" };
  return match[2] === "summary"
    ? { name: "summary", tripId: match[1] }
    : { name: "planner", tripId: match[1] };
}

function routePath(route: Route) {
  switch (route.name) {
    case "login":
      return "/login";
    case "landing":
      return "/";
    case "planner":
      return `/trips/${route.tripId}`;
    case "summary":
      return `/trips/${route.tripId}/summary`;
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [searchQuery, setSearchQuery] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripSummaries, setTripSummaries] = useState<TripSummary[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [activePlan, setActivePlan] = useState<PlanKey>("A");
  const [selectedDay, setSelectedDay] = useState(1);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [editingTrip, setEditingTrip] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [draggedActivityId, setDraggedActivityId] = useState<string | null>(null);
  const [dropTargetActivityId, setDropTargetActivityId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    start_date: "",
    end_date: "",
    budget: 0,
    travelers: 1
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePopState = () => setRoute(readRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
      setAuthToken(null);
      setUser(null);
      setIsBootstrapping(false);
      if (readRoute().name !== "login") navigate({ name: "login" }, true);
      return;
    }

    setAuthToken(token);
    void (async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        window.localStorage.removeItem(SESSION_TOKEN_KEY);
        setAuthToken(null);
        setUser(null);
        navigate({ name: "login" }, true);
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshTrips();
  }, [user]);

  useEffect(() => {
    if (user && route.name === "login") {
      navigate({ name: "landing" }, true);
    }
  }, [route.name, user]);

  useEffect(() => {
    if (!user) {
      setTrip(null);
      return;
    }
    if (route.name !== "planner" && route.name !== "summary") {
      setTrip(null);
      return;
    }

    setError(null);
    void (async () => {
      try {
        const loadedTrip = await getTrip(route.tripId);
        setTrip(loadedTrip);
        setDraft({
          title: loadedTrip.title,
          start_date: loadedTrip.start_date,
          end_date: loadedTrip.end_date,
          budget: loadedTrip.budget,
          travelers: loadedTrip.travelers
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load trip");
      }
    })();
  }, [route, user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [trip?.chat_messages]);

  function navigate(nextRoute: Route, replace = false) {
    const nextPath = routePath(nextRoute);
    window.history[replace ? "replaceState" : "pushState"](null, "", nextPath);
    setRoute(nextRoute);
  }

  async function refreshTrips() {
    const trips = await listTrips();
    setTripSummaries(trips);

    if (route.name === "landing" && trips[0]) {
      navigate({ name: "planner", tripId: trips[0].public_id }, true);
      return trips;
    }

    if ((route.name === "planner" || route.name === "summary") && !trips.some((item) => item.public_id === route.tripId) && trips[0]) {
      navigate({ name: "planner", tripId: trips[0].public_id }, true);
    }
    return trips;
  }

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const response: AuthResponse =
        authMode === "login"
          ? await login(authForm.email, authForm.password)
          : await register(authForm.email, authForm.password);

      window.localStorage.setItem(SESSION_TOKEN_KEY, response.token);
      setAuthToken(response.token);
      setUser(response.user);
      setAuthForm({ email: "", password: "" });
      const trips = await refreshTrips();
      if (trips[0]) {
        navigate({ name: "planner", tripId: trips[0].public_id }, true);
      } else {
        navigate({ name: "landing" }, true);
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed");
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Clearing local state is enough if the token is already invalid.
    }
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setTrip(null);
    setTripSummaries([]);
    navigate({ name: "login" }, true);
  }

  async function handleSaveTrip() {
    if (!trip) return;
    try {
      const updated = await updateTrip(trip.public_id, draft);
      setTrip(updated);
      setTripSummaries((current) =>
        current.map((item) => (item.public_id === updated.public_id ? { ...item, ...updated } : item))
      );
      setEditingTrip(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save trip");
    }
  }

  async function handleSendMessage(text: string) {
    if (!trip) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const optimisticUser: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      chips: []
    };

    setTrip({
      ...trip,
      chat_messages: [...trip.chat_messages, optimisticUser]
    });
    setChatInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendTripChat(trip.public_id, trimmed, activePlan);
      if (response.trip) {
        const updatedTrip = response.trip;
        setTrip(updatedTrip);
        setTripSummaries((current) =>
          current.map((item) => (item.public_id === updatedTrip.public_id ? { ...item, ...updatedTrip } : item))
        );
      } else {
        const aiMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "ai",
          text: response.ai_response,
          chips: response.chips
        };
        setTrip((currentTrip) =>
          currentTrip
            ? { ...currentTrip, chat_messages: [...currentTrip.chat_messages, aiMessage] }
            : currentTrip
        );
      }
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  }

  function swapActivitiesLocally(activities: Activity[], sourceId: string, targetId: string) {
    const sourceIndex = activities.findIndex((item) => item.id === sourceId);
    const targetIndex = activities.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return activities;

    const nextActivities = activities.map((item) => ({ ...item }));
    const source = { ...nextActivities[sourceIndex] };
    const target = { ...nextActivities[targetIndex] };
    const sourceTime = source.time;
    source.time = target.time;
    target.time = sourceTime;
    nextActivities[sourceIndex] = target;
    nextActivities[targetIndex] = source;
    return nextActivities;
  }

  async function handleActivitySwap(sourceId: string, targetId: string) {
    if (!trip || sourceId === targetId) return;
    const dayIndex = days.findIndex((day) => day.day === selectedDay);
    if (dayIndex < 0) return;

    const optimisticActivities = swapActivitiesLocally(currentActivities, sourceId, targetId);
    const optimisticTrip: Trip = {
      ...trip,
      plans: {
        ...trip.plans,
        [activePlan]: trip.plans[activePlan].map((day, index) =>
          index === dayIndex ? { ...day, activities: optimisticActivities } : day
        )
      }
    };

    setTrip(optimisticTrip);
    setIsSwapping(true);
    setError(null);
    setDraggedActivityId(null);
    setDropTargetActivityId(null);

    try {
      const updatedTrip = await swapTripActivities(trip.public_id, activePlan, selectedDay, sourceId, targetId);
      setTrip(updatedTrip);
      setTripSummaries((current) =>
        current.map((item) => (item.public_id === updatedTrip.public_id ? { ...item, ...updatedTrip } : item))
      );
    } catch (swapError) {
      setTrip(trip);
      setError(swapError instanceof Error ? swapError.message : "Failed to reorder itinerary item");
    } finally {
      setIsSwapping(false);
    }
  }

  function handleChatSubmit(event: FormEvent) {
    event.preventDefault();
    void handleSendMessage(chatInput);
  }

  const days = trip?.plans[activePlan] ?? [];
  const currentActivities = days.find((day) => day.day === selectedDay)?.activities ?? [];
  const chatMessages = trip?.chat_messages ?? [];
  const totalCost = days.reduce(
    (sum, day) => sum + day.activities.reduce((daySum, activity) => daySum + activity.cost, 0),
    0
  );
  const budgetPercent = trip ? Math.min((totalCost / trip.budget) * 100, 100) : 0;
  const overBudget = trip ? totalCost > trip.budget : false;
  const uniqueLocations = [...new Set(days.flatMap((day) => day.activities.map((activity) => activity.location)))];

  function Navbar({ children }: { children?: React.ReactNode }) {
    return (
      <nav className="navbar">
        <div className="nav-brand" onClick={() => navigate(user ? { name: "landing" } : { name: "login" })}>
          <span className="nav-logo" aria-hidden="true">TL</span>
          TripLogic
        </div>
        <div className="nav-actions">
          {children}
          {user ? (
            <>
              <div className="avatar">{user.email.slice(0, 2).toUpperCase()}</div>
              <button className="btn btn-ghost" onClick={() => void handleLogout()}>
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </nav>
    );
  }

  if (isBootstrapping) {
    return (
      <>
        <Navbar />
        <div className="loading-screen">Loading TripLogic...</div>
      </>
    );
  }

  if (!user || route.name === "login") {
    return (
      <>
        <Navbar />
        <main className="auth-shell">
          <section className="auth-card">
            <h1>{authMode === "login" ? "Sign in" : "Create your TripLogic account"}</h1>
            {error ? <div className="error-banner">{error}</div> : null}
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                  minLength={8}
                  required
                />
              </label>
              <button type="submit" className="btn btn-primary">
                {authMode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>
            <button
              className="btn btn-ghost auth-switch"
              onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}
            >
              {authMode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
            </button>
          </section>
        </main>
      </>
    );
  }

  if (!trip && (route.name === "planner" || route.name === "summary")) {
    return (
      <>
        <Navbar />
        <div className="loading-screen">{error ?? "Loading trip..."}</div>
      </>
    );
  }

  if (route.name === "landing") {
    return (
      <>
        <Navbar>
          <span className="nav-user-email">{user.email}</span>
        </Navbar>

        {error ? <div className="error-banner">{error}</div> : null}

        <main className="landing">
          <section className="hero">
            <h1>Plan your perfect trip</h1>
            <p className="hero-sub">
              AI-powered itineraries tailored to your style, budget, and timeline.
            </p>

            <form
              className="hero-search"
              onSubmit={(event) => {
                event.preventDefault();
                const firstTrip = tripSummaries[0];
                if (firstTrip) navigate({ name: "planner", tripId: firstTrip.public_id });
              }}
            >
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search your trip ideas"
              />
              <button type="submit" className="btn btn-primary">
                Open Latest Trip →
              </button>
            </form>

            <div className="hero-chips">
              {quickTags.map((tag) => (
                <button key={tag} className="chip" onClick={() => setSearchQuery(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="section-label">Your Trips</p>
            <div className="dest-grid">
              {tripSummaries.map((item) => (
                <button
                  key={item.public_id}
                  className="dest-card"
                  onClick={() => navigate({ name: "planner", tripId: item.public_id })}
                >
                  <span className="dest-icon">🧳</span>
                  <h3>{item.title}</h3>
                  <p>
                    {longDate(item.start_date)} → {longDate(item.end_date)}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="section-label">Popular Destinations</p>
            <div className="dest-grid">
              {destinations.map((destination) => (
                <button
                  key={destination.id}
                  className="dest-card"
                  onClick={() => {
                    const firstTrip = tripSummaries[0];
                    if (firstTrip) navigate({ name: "planner", tripId: firstTrip.public_id });
                  }}
                >
                  <span className="dest-icon">{destination.icon}</span>
                  <h3>{destination.title}</h3>
                  <p>{destination.subtitle}</p>
                </button>
              ))}
            </div>
          </section>
        </main>
      </>
    );
  }

  if (route.name === "summary" && trip) {
    return (
      <>
        <Navbar>
          <button className="btn btn-ghost" onClick={() => navigate({ name: "planner", tripId: trip.public_id })}>
            Back to planner
          </button>
        </Navbar>

        <div className="summary">
          <div className="summary-hero-card">
            <div>
              <h1>{trip.title}</h1>
              <p>
                {trip.start_date} → {trip.end_date} · {trip.travelers} traveler
                {trip.travelers > 1 ? "s" : ""}
              </p>
            </div>
            <div className="summary-budget-highlight">
              <strong>{currency(trip.budget)}</strong>
              <span>Total budget</span>
            </div>
          </div>

          <div className="summary-grid">
            <div className="summary-card">
              <h2>
                Plan {activePlan} - {planDescriptions[activePlan]}
              </h2>
              {days.map((day) => (
                <div key={day.day} className="summary-day">
                  <h3>
                    Day {day.day} <span>{day.date}</span>
                  </h3>
                  <ul>
                    {day.activities.map((activity) => (
                      <li key={activity.id}>
                        <span>{activity.name}</span>
                        <strong>{currency(activity.cost)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="summary-card">
              <h2>Where you'll go</h2>
              <ul className="location-list">
                {uniqueLocations.map((location) => (
                  <li key={location}>{location}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar>
      </Navbar>

      {error ? <div className="error-banner">{error}</div> : null}

      {trip ? (
        <div className="planner">
          <aside className="chat-col">
            <div className="trip-list-card">
              <p className="trip-header-label">Your Trips</p>
              <div className="trip-list">
                {tripSummaries.map((item) => (
                  <button
                    key={item.public_id}
                    className={`trip-list-item${item.public_id === trip.public_id ? " active" : ""}`}
                    onClick={() => navigate({ name: "planner", tripId: item.public_id })}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.start_date}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="trip-header">
              <div>
                <p className="trip-header-label">Trip Details</p>
                <div className="trip-meta-row">
                  <span>
                    <span className="meta-icon">📍</span> {trip.title}
                  </span>
                  <span>
                    <span className="meta-icon">👥</span> {trip.travelers} traveler
                    {trip.travelers > 1 ? "s" : ""}
                  </span>
                  <span>
                    <span className="meta-icon">📅</span> {trip.start_date} - {trip.end_date}
                  </span>
                  <span>
                    <span className="meta-icon">💰</span> {currency(trip.budget)}
                  </span>
                </div>
              </div>
              <button
                className="btn btn-ghost"
                style={{ flexShrink: 0 }}
                onClick={() => setEditingTrip((value) => !value)}
              >
                {editingTrip ? "Cancel" : "Edit"}
              </button>
            </div>

            {editingTrip ? (
              <div className="edit-overlay">
                <label>
                  Destination
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                </label>
                <label>
                  Start date
                  <input
                    type="date"
                    value={draft.start_date}
                    onChange={(event) => setDraft({ ...draft, start_date: event.target.value })}
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    value={draft.end_date}
                    onChange={(event) => setDraft({ ...draft, end_date: event.target.value })}
                  />
                </label>
                <label>
                  Budget
                  <input
                    type="number"
                    value={draft.budget}
                    onChange={(event) => setDraft({ ...draft, budget: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Travelers
                  <input
                    type="number"
                    value={draft.travelers}
                    onChange={(event) => setDraft({ ...draft, travelers: Number(event.target.value) })}
                  />
                </label>
                <button className="btn btn-primary" onClick={() => void handleSaveTrip()}>
                  Save changes
                </button>
              </div>
            ) : null}

            <div className="chat-messages">
              {chatMessages.map((message) => (
                <div key={message.id} className={message.role === "ai" ? "msg msg-ai" : "msg msg-user"}>
                  <p>{message.text}</p>
                  {message.chips.length > 0 ? (
                    <div className="msg-chips">
                      {message.chips.map((chip) => (
                        <button key={chip} className="chip" onClick={() => void handleSendMessage(chip)}>
                          {chip}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {isLoading ? <div className="msg msg-thinking">Thinking...</div> : null}
              <div ref={chatEndRef} />
            </div>

            <form className="chat-input-bar" onSubmit={handleChatSubmit}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask about your trip..."
              />
              <button type="submit" className="btn-icon" disabled={isLoading} aria-label="Send">
                →
              </button>
            </form>
          </aside>

          <div className="itinerary-col">
            <div className="plan-bar">
              <div className="plan-tabs">
                {(["A", "B", "C"] as PlanKey[]).map((plan) => (
                  <button
                    key={plan}
                    className={`plan-tab${plan === activePlan ? " active" : ""}`}
                    onClick={() => {
                      setActivePlan(plan);
                      setSelectedDay(1);
                    }}
                  >
                    Plan {plan}
                    <span className="plan-tab-sub">{planDescriptions[plan]}</span>
                  </button>
                ))}
              </div>

              <button className="btn btn-ghost" onClick={() => navigate({ name: "summary", tripId: trip.public_id })}>
                View Summary
              </button>
            </div>

            <div className="itinerary-body">
              <p className="itinerary-heading">Itinerary</p>

              <div className="day-tabs">
                {days.map((day) => (
                  <button
                    key={day.day}
                    className={`day-tab${selectedDay === day.day ? " active" : ""}`}
                    onClick={() => setSelectedDay(day.day)}
                  >
                    Day {day.day}
                    <span className="day-tab-date">{shortDate(day.date)}</span>
                  </button>
                ))}
              </div>

              <div className="timeline">
                {currentActivities.map((activity, index) => (
                  <div
                    key={activity.id}
                    className={`timeline-item${draggedActivityId === activity.id ? " dragging" : ""}${dropTargetActivityId === activity.id ? " drop-target" : ""}`}
                    draggable={!isSwapping}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", activity.id);
                      setDraggedActivityId(activity.id);
                      setDropTargetActivityId(activity.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!draggedActivityId || draggedActivityId === activity.id) return;
                      setDropTargetActivityId(activity.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggedActivityId || draggedActivityId === activity.id || isSwapping) return;
                      void handleActivitySwap(draggedActivityId, activity.id);
                    }}
                    onDragEnd={() => {
                      setDraggedActivityId(null);
                      setDropTargetActivityId(null);
                    }}
                  >
                    <div className="timeline-track">
                      <span className="timeline-dot">{categoryIcons[activity.category] ?? "📌"}</span>
                      {index < currentActivities.length - 1 ? <div className="timeline-line" /> : null}
                    </div>
                    <div className="timeline-content">
                      <div>
                        <div className="timeline-name">{activity.name}</div>
                        <div className="timeline-location">{activity.location}</div>
                      </div>
                      <div className="timeline-right">
                        <div className="timeline-time">{activity.time}</div>
                        <div className="timeline-cost">{currency(activity.cost)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="budget-footer">
              <div className="budget-label">
                <span className="budget-label-text">Budget</span>
                <span className={`budget-label-amount${overBudget ? " over" : ""}`}>
                  {currency(totalCost)} / {currency(trip.budget)}
                </span>
              </div>
              <div className="trip-path">Drag one itinerary item onto another to swap them and exchange their times.</div>
              <div className="budget-track">
                <div
                  className={`budget-fill${overBudget ? " over" : ""}`}
                  style={{ width: `${budgetPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
