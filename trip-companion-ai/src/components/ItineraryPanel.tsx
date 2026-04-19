import { useState, useRef } from "react";
import { Utensils, Camera, Map, Bed, ShoppingBag, Music, Plane, Coffee, GripVertical, Lock, Trash2, Lightbulb, Loader2, ExternalLink } from "lucide-react";

export interface Activity {
  id: string;
  name: string;
  time: string;
  cost: number;
  location: string;
  category: "food" | "sightseeing" | "transport" | "hotel" | "shopping" | "entertainment" | "flight" | "cafe";
  /** Google Maps / website, or Google Flights search for flights */
  info_url?: string | null;
}

export interface DayPlan {
  day: number;
  date: string;
  activities: Activity[];
}

interface ItineraryPanelProps {
  days: DayPlan[];
  selectedDay: number;
  onSelectDay: (day: number) => void;
  totalBudget: number;
  onReorder: (dayIndex: number, activities: Activity[]) => void;
  onRemoveActivity: (dayIndex: number, activityId: string) => void;
  onShowAlternatives: (activityId: string) => void;
  alternativesLoading?: string | null;
}

const FIXED_CATEGORIES = new Set<Activity["category"]>(["flight", "hotel"]);

const categoryIcons: Record<Activity["category"], typeof Utensils> = {
  food: Utensils,
  sightseeing: Camera,
  transport: Map,
  hotel: Bed,
  shopping: ShoppingBag,
  entertainment: Music,
  flight: Plane,
  cafe: Coffee,
};

const categoryColors: Record<Activity["category"], string> = {
  food: "bg-orange-100 text-orange-600",
  sightseeing: "bg-blue-100 text-blue-600",
  transport: "bg-green-100 text-green-600",
  hotel: "bg-purple-100 text-purple-600",
  shopping: "bg-pink-100 text-pink-600",
  entertainment: "bg-yellow-100 text-yellow-600",
  flight: "bg-sky-100 text-sky-600",
  cafe: "bg-amber-100 text-amber-700",
};

const ItineraryPanel = ({ days, selectedDay, onSelectDay, totalBudget, onReorder, onRemoveActivity, onShowAlternatives, alternativesLoading }: ItineraryPanelProps) => {
  const currentDay = days.find((d) => d.day === selectedDay);
  const currentDayIndex = days.findIndex((d) => d.day === selectedDay);
  const totalSpent = days.reduce((sum, d) => sum + d.activities.reduce((s, a) => s + a.cost, 0), 0);
  const budgetPercent = Math.min((totalSpent / totalBudget) * 100, 100);
  const overBudget = totalSpent > totalBudget;

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragItem = useRef<number | null>(null);

  const handleDragStart = (idx: number) => {
    dragItem.current = idx;
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    if (!currentDay || FIXED_CATEGORIES.has(currentDay.activities[idx].category)) return;
    e.preventDefault();
    setOverIdx(idx);
  };

  const handleDrop = (idx: number) => {
    if (dragItem.current === null || !currentDay) return;
    const target = currentDay.activities[idx];
    if (FIXED_CATEGORIES.has(target.category)) return;

    // Reorder only among draggable activities; fixed ones keep their start times
    const draggable = currentDay.activities.filter((a) => !FIXED_CATEGORIES.has(a.category));
    const src = currentDay.activities[dragItem.current];
    const srcIdx = draggable.indexOf(src);
    const dstIdx = draggable.indexOf(target);
    if (srcIdx === -1 || dstIdx === -1 || srcIdx === dstIdx) {
      dragItem.current = null;
      setDragIdx(null);
      setOverIdx(null);
      return;
    }

    const reordered = [...draggable];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(dstIdx, 0, moved);
    onReorder(currentDayIndex, reordered);

    dragItem.current = null;
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
    dragItem.current = null;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Day Tabs */}
      <div className="px-4 pt-3 pb-2 border-b border-border">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Itinerary</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <button
              key={d.day}
              onClick={() => onSelectDay(d.day)}
              className={`flex flex-col items-center px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 ${
                selectedDay === d.day
                  ? "bg-daytab-active text-daytab-active-foreground shadow-sm"
                  : "bg-daytab text-muted-foreground hover:bg-secondary border border-border"
              }`}
            >
              <span className="font-semibold text-sm">Day {d.day}</span>
              <span className="opacity-80">{d.date}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {currentDay?.activities.map((activity, idx) => {
          const Icon = categoryIcons[activity.category];
          const colorClass = categoryColors[activity.category];
          const isLast = idx === (currentDay.activities.length - 1);
          const isDragging = dragIdx === idx;
          const isOver = overIdx === idx && dragIdx !== idx;

          const isFixed = FIXED_CATEGORIES.has(activity.category);
          return (
            <div
              key={activity.id}
              className={`flex gap-3 transition-opacity ${isDragging ? "opacity-40" : ""}`}
              draggable={!isFixed}
              onDragStart={!isFixed ? () => handleDragStart(idx) : undefined}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={!isFixed ? handleDragEnd : undefined}
            >
              {/* Timeline dot + line */}
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                  <Icon size={16} />
                </div>
                {!isLast && <div className="w-px flex-1 bg-timeline-line my-1" />}
              </div>

              {/* Card */}
              <div
                className={`flex-1 bg-card rounded-xl p-3.5 border shadow-sm group transition-all ${!isLast ? "mb-3" : ""} ${
                  isOver ? "border-primary ring-1 ring-primary/30" : "border-border"
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Drag handle / lock */}
                  {isFixed ? (
                    <div className="pt-0.5 text-muted-foreground/30" title="Position locked">
                      <Lock size={12} />
                    </div>
                  ) : (
                    <div className="pt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                      <GripVertical size={14} />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm text-foreground truncate">
                          {activity.info_url ? (
                            <a
                              href={activity.info_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-foreground hover:text-primary hover:underline inline-flex items-center gap-1 max-w-full"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="truncate">{activity.name}</span>
                              <ExternalLink className="size-3.5 shrink-0 text-primary opacity-80" aria-hidden />
                            </a>
                          ) : (
                            activity.name
                          )}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{activity.location}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-medium text-foreground">{activity.time}</span>
                        <p className="text-xs text-primary font-semibold">${activity.cost}</p>
                      </div>
                    </div>

                    {/* Quick actions */}
                    <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onShowAlternatives(activity.id)}
                        disabled={alternativesLoading === activity.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-accent text-accent-foreground hover:bg-accent/80 transition-colors disabled:opacity-50"
                      >
                        {alternativesLoading === activity.id ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <Lightbulb size={10} />
                        )}
                        Alternatives
                      </button>
                      <button
                        onClick={() => onRemoveActivity(currentDayIndex, activity.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <Trash2 size={10} />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {(!currentDay || currentDay.activities.length === 0) && (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No activities planned yet
          </div>
        )}
      </div>

      {/* Budget Tracker */}
      <div className="px-4 py-3 border-t border-border bg-card">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted-foreground font-medium">Budget</span>
          <span className={`font-semibold ${overBudget ? "text-budget-over" : "text-foreground"}`}>
            ${totalSpent.toLocaleString()} / ${totalBudget.toLocaleString()}
          </span>
        </div>
        <div className="h-2 rounded-full bg-budget-track overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${overBudget ? "bg-budget-over" : "bg-budget-fill"}`}
            style={{ width: `${budgetPercent}%` }}
          />
        </div>
        {overBudget && (
          <p className="text-xs text-budget-over mt-1">Over budget by ${(totalSpent - totalBudget).toLocaleString()}</p>
        )}
      </div>
    </div>
  );
};

export default ItineraryPanel;
