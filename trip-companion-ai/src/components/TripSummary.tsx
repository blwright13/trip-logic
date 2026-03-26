import { useState } from "react";
import { MapPin, Calendar, DollarSign, Users, Pencil, Check } from "lucide-react";

interface TripInfo {
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  travelers: number;
}

interface TripSummaryProps {
  trip: TripInfo;
  onUpdate: (trip: TripInfo) => void;
}

const TripSummary = ({ trip, onUpdate }: TripSummaryProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trip);

  const save = () => {
    onUpdate(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="p-4 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Trip Details</h2>
          <button onClick={save} className="text-primary hover:text-primary/80 transition-colors">
            <Check size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="col-span-2 bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            value={draft.destination}
            onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
            placeholder="Destination"
          />
          <input
            type="date"
            className="bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            value={draft.startDate}
            onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
          />
          <input
            type="date"
            className="bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            value={draft.endDate}
            onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
          />
          <input
            type="number"
            className="bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            value={draft.budget}
            onChange={(e) => setDraft({ ...draft, budget: Number(e.target.value) })}
            placeholder="Budget"
          />
          <input
            type="number"
            className="bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            value={draft.travelers}
            onChange={(e) => setDraft({ ...draft, travelers: Number(e.target.value) })}
            placeholder="Travelers"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-border bg-card">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Trip Details</h2>
        <button onClick={() => { setDraft(trip); setEditing(true); }} className="text-muted-foreground hover:text-primary transition-colors">
          <Pencil size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <MapPin size={14} className="text-primary shrink-0" />
          <span className="font-medium truncate">{trip.destination}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <Users size={14} className="text-primary shrink-0" />
          <span>{trip.travelers} traveler{trip.travelers !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <Calendar size={14} className="text-primary shrink-0" />
          <span>{trip.startDate} — {trip.endDate}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <DollarSign size={14} className="text-primary shrink-0" />
          <span>${trip.budget.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export default TripSummary;
