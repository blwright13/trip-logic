import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
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
}

const ChatPanel = ({ messages, trip, onSend, onTripUpdate, onChipClick }: ChatPanelProps) => {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-chat">
      <TripSummary trip={trip} onUpdate={onTripUpdate} />

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
            disabled={!input.trim()}
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
