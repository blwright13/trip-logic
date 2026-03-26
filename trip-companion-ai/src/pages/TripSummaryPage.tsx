import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download, ArrowLeft, MapPin, Utensils, Camera, Map, Bed, ShoppingBag, Music, Plane, Coffee } from "lucide-react";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { initialTrip, planDays } from "@/data/mockTrip";
import type { Activity } from "@/components/ItineraryPanel";

const categoryIcons: Record<Activity["category"], typeof Utensils> = {
  food: Utensils, sightseeing: Camera, transport: Map, hotel: Bed,
  shopping: ShoppingBag, entertainment: Music, flight: Plane, cafe: Coffee,
};

const categoryLabels: Record<Activity["category"], string> = {
  food: "Food & Dining", sightseeing: "Sightseeing", transport: "Transport",
  hotel: "Accommodation", shopping: "Shopping", entertainment: "Entertainment",
  flight: "Flights", cafe: "Cafes",
};

const TripSummaryPage = () => {
  const navigate = useNavigate();
  const days = planDays.A;
  const trip = initialTrip;

  const allActivities = useMemo(() => days.flatMap((d) => d.activities), [days]);
  const totalCost = useMemo(() => allActivities.reduce((s, a) => s + a.cost, 0), [allActivities]);

  const costByCategory = useMemo(() => {
    const map: Partial<Record<Activity["category"], number>> = {};
    allActivities.forEach((a) => {
      map[a.category] = (map[a.category] || 0) + a.cost;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => (b as number) - (a as number)) as [Activity["category"], number][];
  }, [allActivities]);

  const uniqueLocations = useMemo(() => {
    const locs = [...new Set(allActivities.map((a) => a.location))];
    return locs;
  }, [allActivities]);

  const handleExport = () => {
    const lines = [`Trip to ${trip.destination}`, `${trip.startDate} — ${trip.endDate}`, `Budget: $${trip.budget}`, `Travelers: ${trip.travelers}`, ""];
    days.forEach((d) => {
      lines.push(`--- Day ${d.day} (${d.date}) ---`);
      d.activities.forEach((a) => {
        lines.push(`  ${a.time}  ${a.name} — ${a.location} ($${a.cost})`);
      });
      lines.push("");
    });
    lines.push(`Total: $${totalCost}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${trip.destination.replace(/[^a-z0-9]/gi, "-")}-itinerary.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopNav />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/planner")}>
                <ArrowLeft size={18} />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{trip.destination}</h1>
                <p className="text-sm text-muted-foreground">
                  {trip.startDate} — {trip.endDate} · {trip.travelers} travelers
                </p>
              </div>
            </div>
            <Button onClick={handleExport} className="gap-1.5">
              <Download size={14} />
              Export
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Itinerary */}
            <div className="md:col-span-2 space-y-6">
              {days.map((d) => (
                <div key={d.day} className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="font-semibold text-foreground mb-3">
                    Day {d.day} <span className="text-muted-foreground font-normal">· {d.date}</span>
                  </h3>
                  <div className="space-y-2.5">
                    {d.activities.map((a) => {
                      const Icon = categoryIcons[a.category];
                      return (
                        <div key={a.id} className="flex items-center gap-3 text-sm">
                          <span className="text-xs text-muted-foreground w-16 shrink-0">{a.time}</span>
                          <Icon size={14} className="text-primary shrink-0" />
                          <span className="text-foreground font-medium flex-1 truncate">{a.name}</span>
                          <span className="text-primary font-semibold">${a.cost}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Sidebar: cost breakdown + map */}
            <div className="space-y-6">
              {/* Cost breakdown */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-foreground mb-4">Cost Breakdown</h3>
                <div className="space-y-3">
                  {costByCategory.map(([cat, cost]) => {
                    const Icon = categoryIcons[cat];
                    const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <div className="flex items-center gap-2">
                            <Icon size={14} className="text-primary" />
                            <span className="text-foreground">{categoryLabels[cat]}</span>
                          </div>
                          <span className="font-semibold text-foreground">${cost}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-budget-track overflow-hidden">
                          <div className="h-full rounded-full bg-budget-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-bold text-lg text-primary">${totalCost}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Budget: ${trip.budget.toLocaleString()} · {totalCost <= trip.budget ? "Under budget ✓" : "Over budget ⚠"}
                </p>
              </div>

              {/* Map placeholder with pins */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-foreground mb-3">Locations</h3>
                <div className="relative bg-secondary rounded-xl h-48 flex items-center justify-center mb-3 overflow-hidden">
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_30%_40%,hsl(var(--primary)),transparent_50%),radial-gradient(circle_at_70%_60%,hsl(var(--primary)),transparent_50%)]" />
                  <Map size={32} className="text-muted-foreground/40" />
                  <span className="absolute bottom-2 right-2 text-[10px] text-muted-foreground">Map coming soon</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {uniqueLocations.map((loc) => (
                    <div key={loc} className="flex items-center gap-2 text-xs text-foreground">
                      <MapPin size={12} className="text-primary shrink-0" />
                      <span className="truncate">{loc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripSummaryPage;
