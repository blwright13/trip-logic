import { useState, useRef, useEffect, type ReactNode } from "react";
import { Loader2, Send, Plane, MapPin, ExternalLink, Star, Plus, RefreshCw } from "lucide-react";
import TripSummary from "./TripSummary";
import type { ApplySuggestionRequest } from "@/services/api";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  chips?: string[];
  flightOptions?: Array<{
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
    apply_mode?: "replace" | "add" | null;
    replace_activity_id?: number | null;
    replace_category?: string | null;
    target_date?: string | null;
  }>;
  cards?: Array<{
    type: string;
    title: string;
    image_url?: string | null;
    description?: string | null;
    rating?: number | null;
    estimated_price?: string | null;
    estimated_cost?: number | null;
    url?: string | null;
    location?: string | null;
    fit_reason?: string | null;
    apply_mode?: "replace" | "add" | null;
    replace_activity_id?: number | null;
    replace_category?: string | null;
    target_date?: string | null;
  }>;
  isThinking?: boolean;
}

interface TripInfo {
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  travelers: number;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  trip: TripInfo;
  onSend: (text: string) => void;
  onTripUpdate: (trip: TripInfo) => void;
  onChipClick: (chip: string) => void;
  onApplySuggestion?: (payload: ApplySuggestionRequest) => void;
  /** When false, show a read-only trip strip (e.g. conversational planning). Default true. */
  showTripSummaryEditor?: boolean;
  sendDisabled?: boolean;
  /** Show a transient assistant row while the server is responding. */
  isAwaitingResponse?: boolean;
  awaitingLabel?: string;
  /** Extra classes for the root (e.g. flex-1 min-h-0 inside a fixed-height layout). */
  className?: string;
  /** Toggle assistant suggestion chips visibility. Default true. */
  showChips?: boolean;
  /** Inline content rendered directly beneath the latest assistant message. */
  afterLastAssistantMessage?: ReactNode;
}

const renderInlineMarkdown = (text: string) => {
  const boldPattern = /\*\*(.+?)\*\*/g;
  const parts: Array<string | JSX.Element> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }
    parts.push(<strong key={`bold-${key++}`}>{match[1]}</strong>);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length > 0 ? parts : [text];
};

const PRICE_LEVEL_COST: Record<string, number> = { "$": 15, "$$": 35, "$$$": 70, "$$$$": 150, "Free": 0 };

function cardTypeToCategory(type: string): string {
  if (type === "hotel") return "hotel";
  if (type === "food") return "food";
  if (type === "tour") return "sightseeing";
  if (type === "entertainment") return "entertainment";
  return "sightseeing";
}

const ChatPanel = ({
  messages,
  trip,
  onSend,
  onTripUpdate,
  onChipClick,
  onApplySuggestion,
  showTripSummaryEditor = true,
  sendDisabled = false,
  isAwaitingResponse = false,
  awaitingLabel = "Thinking…",
  className = "",
  showChips = true,
  afterLastAssistantMessage,
}: ChatPanelProps) => {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAwaitingResponse]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className={`flex flex-col flex-1 min-h-0 bg-chat ${className}`.trim()}>
      {showTripSummaryEditor ? (
        <TripSummary trip={trip} onUpdate={onTripUpdate} />
      ) : (
        <div className="p-4 border-b border-border bg-card shrink-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Trip details</p>
          <p className="font-semibold text-foreground truncate">{trip.destination}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {trip.startDate && trip.endDate ? `${trip.startDate} — ${trip.endDate}` : "Dates TBD"}
            {trip.travelers ? ` · ${trip.travelers} travelers` : ""}
            {trip.budget ? ` · $${trip.budget.toLocaleString()}` : ""}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {(() => {
          const lastAiIdx = messages.map((m) => m.role).lastIndexOf("ai");
          return messages.map((msg, idx) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] space-y-2`}>
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-chat-user text-chat-user-foreground rounded-br-md"
                      : "bg-chat-ai text-chat-ai-foreground rounded-bl-md"
                  }`}
                >
                  {msg.isThinking ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" aria-hidden />
                      <span className="text-muted-foreground">Thinking...</span>
                    </span>
                  ) : renderInlineMarkdown(msg.text)}
                </div>
                {idx === lastAiIdx && afterLastAssistantMessage}
                {msg.role === "ai" && msg.flightOptions && msg.flightOptions.length > 0 && (
                  <div className="space-y-2 mt-1">
                    {msg.flightOptions.map((flight, flightIdx) => {
                      const tagStyle =
                        flight.tag === "cheapest"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : flight.tag === "fastest"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
                      const durationH = typeof flight.duration_minutes === "number" ? Math.floor(flight.duration_minutes / 60) : null;
                      const durationM = typeof flight.duration_minutes === "number" ? flight.duration_minutes % 60 : null;
                      return (
                        <div key={`${msg.id}-flight-${flightIdx}`} className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                          {/* Airline + tag */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Plane size={13} className="text-muted-foreground" />
                              <span className="text-sm font-semibold text-foreground">{flight.airline}</span>
                              {flight.flight_number && (
                                <span className="text-xs text-muted-foreground">{flight.flight_number}</span>
                              )}
                            </div>
                            {flight.tag && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${tagStyle}`}>
                                {flight.tag}
                              </span>
                            )}
                          </div>

                          {/* Route */}
                          <div className="flex items-center gap-2">
                            <div className="text-left min-w-0">
                              <p className="text-base font-bold text-foreground leading-none">{flight.departure_time || "—"}</p>
                              <p className="text-[11px] font-medium text-muted-foreground mt-0.5">{flight.departure_airport || "?"}</p>
                            </div>
                            <div className="flex-1 flex items-center gap-1">
                              <div className="h-px flex-1 bg-border" />
                              <div className="flex flex-col items-center gap-0.5 shrink-0">
                                <Plane size={11} className="text-muted-foreground rotate-90" />
                                {durationH !== null && (
                                  <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                                    {durationH}h{durationM !== null && durationM > 0 ? ` ${durationM}m` : ""}
                                  </span>
                                )}
                              </div>
                              <div className="h-px flex-1 bg-border" />
                            </div>
                            <div className="text-right min-w-0">
                              <p className="text-base font-bold text-foreground leading-none">{flight.arrival_time || "—"}</p>
                              <p className="text-[11px] font-medium text-muted-foreground mt-0.5">{flight.arrival_airport || "?"}</p>
                            </div>
                          </div>

                          {/* Stops + price + actions */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {typeof flight.stops === "number"
                                ? flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`
                                : ""}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-primary">
                                {typeof flight.price_usd === "number"
                                  ? `$${Math.round(flight.price_usd).toLocaleString()}`
                                  : "Price N/A"}
                              </span>
                              {flight.booking_url && (
                                <a
                                  href={flight.booking_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-secondary transition-colors"
                                >
                                  Book
                                </a>
                              )}
                              {onApplySuggestion && (
                                <button
                                  onClick={() => onApplySuggestion({
                                    apply_mode: (flight.apply_mode as "replace" | "add") ?? "replace",
                                    replace_activity_id: flight.replace_activity_id,
                                    replace_category: flight.replace_category ?? "flight",
                                    target_date: flight.target_date,
                                    title: `${flight.airline}${flight.flight_number ? " " + flight.flight_number : ""}`,
                                    category: "flight",
                                    location: `${flight.departure_airport ?? "?"} → ${flight.arrival_airport ?? "?"}`,
                                    cost: flight.price_usd ?? 0,
                                    info_url: flight.booking_url,
                                    duration: flight.duration_minutes ?? 120,
                                  })}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                >
                                  {flight.apply_mode === "replace"
                                    ? <><RefreshCw size={11} /> Replace</>
                                    : <><Plus size={11} /> Add</>}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {msg.role === "ai" && msg.cards && msg.cards.length > 0 && (
                  <div className="space-y-3 mt-1">
                    {msg.cards.map((card, cardIdx) => (
                      <div key={`${msg.id}-card-${cardIdx}`} className="rounded-xl border border-border bg-card overflow-hidden">
                        {card.image_url && (
                          <img src={card.image_url} alt={card.title} className="w-full h-40 object-cover" loading="lazy" />
                        )}
                        <div className="p-3.5 space-y-2">
                          {/* Title + type badge */}
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground leading-tight">{card.title}</p>
                            <span className="shrink-0 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                              {card.type}
                            </span>
                          </div>

                          {/* Rating + price */}
                          <div className="flex items-center gap-2">
                            {typeof card.rating === "number" && (
                              <div className="flex items-center gap-1">
                                <Star size={11} className="fill-amber-400 text-amber-400" />
                                <span className="text-xs font-semibold text-foreground">{card.rating.toFixed(1)}</span>
                              </div>
                            )}
                            {card.estimated_price && card.estimated_price !== "Varies" && (
                              <span className="text-xs font-medium text-muted-foreground px-1.5 py-0.5 rounded bg-secondary">
                                {card.estimated_price}
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          {card.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                          )}

                          {/* Location */}
                          {card.location && (
                            <div className="flex items-start gap-1">
                              <MapPin size={11} className="text-muted-foreground shrink-0 mt-0.5" />
                              <span className="text-xs text-muted-foreground line-clamp-1">{card.location}</span>
                            </div>
                          )}

                          {/* URL + Apply */}
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            {card.url ? (
                              <a
                                href={card.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                View on Google Maps
                                <ExternalLink size={10} />
                              </a>
                            ) : <span />}
                            {onApplySuggestion && (
                              <button
                                onClick={() => onApplySuggestion({
                                  apply_mode: (card.apply_mode as "replace" | "add") ?? "add",
                                  replace_activity_id: card.replace_activity_id,
                                  replace_category: card.replace_category,
                                  target_date: card.target_date,
                                  title: card.title,
                                  category: cardTypeToCategory(card.type),
                                  location: card.location,
                                  cost: card.estimated_cost ?? PRICE_LEVEL_COST[card.estimated_price ?? ""] ?? 0,
                                  info_url: card.url,
                                  duration: 60,
                                })}
                                className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                {card.apply_mode === "replace"
                                  ? <><RefreshCw size={11} /> Replace</>
                                  : <><Plus size={11} /> Add</>}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showChips && idx === lastAiIdx && msg.chips && msg.chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.chips.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => onChipClick(chip)}
                        className="px-3 py-1 text-xs font-medium rounded-full bg-chip text-chip-foreground hover:bg-chip-hover transition-colors"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ));
        })()}
        {isAwaitingResponse && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-bl-md bg-chat-ai text-chat-ai-foreground text-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" aria-hidden />
              <span className="text-muted-foreground">{awaitingLabel}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-border bg-card">
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your trip..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || sendDisabled || isAwaitingResponse}
            className="p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;
