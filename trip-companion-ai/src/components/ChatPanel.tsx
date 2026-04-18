import { useState, useRef, useEffect } from "react";
import { Loader2, Send } from "lucide-react";
import TripSummary from "./TripSummary";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  chips?: string[];
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
  /** When false, show a read-only trip strip (e.g. conversational planning). Default true. */
  showTripSummaryEditor?: boolean;
  sendDisabled?: boolean;
  /** Show a transient assistant row while the server is responding. */
  isAwaitingResponse?: boolean;
  awaitingLabel?: string;
  /** Extra classes for the root (e.g. flex-1 min-h-0 inside a fixed-height layout). */
  className?: string;
}

const ChatPanel = ({
  messages,
  trip,
  onSend,
  onTripUpdate,
  onChipClick,
  showTripSummaryEditor = true,
  sendDisabled = false,
  isAwaitingResponse = false,
  awaitingLabel = "Thinking…",
  className = "",
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
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] space-y-2`}>
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-chat-user text-chat-user-foreground rounded-br-md"
                    : "bg-chat-ai text-chat-ai-foreground rounded-bl-md"
                }`}
              >
                {msg.text}
              </div>
              {msg.chips && msg.chips.length > 0 && (
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
        ))}
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
