import { useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, ArrowLeft, MapPin, Utensils, Camera, Map, Bed, ShoppingBag, Music, Plane, Coffee, Loader2, ExternalLink } from "lucide-react";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { useTrip, useItinerary } from "@/hooks/useTrip";
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
  const { tripId } = useParams<{ tripId: string }>();
  const tripIdNum = tripId ? parseInt(tripId, 10) : undefined;

  const { data: tripData, isLoading: tripLoading, error: tripError } = useTrip(tripIdNum);
  const { data: itineraryData, isLoading: itineraryLoading } = useItinerary(tripIdNum);

  const days = useMemo(() => {
    if (!itineraryData) return [];
    return itineraryData.map((day) => ({
      day: day.day,
      date: day.date,
      activities: day.activities.map((a) => ({
        id: a.id.toString(),
        name: a.name,
        time: a.time,
        cost: a.cost,
        location: a.location || "",
        category: a.category,
        info_url: a.info_url ?? undefined,
      })),
    }));
  }, [itineraryData]);

  const trip = useMemo(() => {
    if (!tripData) return { destination: "", startDate: "", endDate: "", budget: 0, travelers: 0 };
    return {
      destination: tripData.title,
      startDate: tripData.start,
      endDate: tripData.end,
      budget: tripData.budget,
      travelers: tripData.num_people,
    };
  }, [tripData]);

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
    const locs = [...new Set(allActivities.map((a) => a.location).filter(Boolean))];
    return locs;
  }, [allActivities]);

  useEffect(() => {
    if (tripData?.planning_phase === "gathering" || tripData?.planning_phase === "confirming") {
      navigate(`/planning/${tripId}`, { replace: true });
    }
  }, [tripData, tripId, navigate]);

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

  // Loading state
  if (tripLoading || itineraryLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading trip summary...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (tripError || !tripIdNum) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <p>Trip not found</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopNav />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(`/planner/${tripId}`)}>
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
              {days.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-5 text-center text-muted-foreground">
                  No activities planned yet
                </div>
              ) : (
                days.map((d) => (
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
                            <span className="text-foreground font-medium flex-1 truncate min-w-0">
                              {a.info_url ? (
                                <a
                                  href={a.info_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                                >
                                  <span className="truncate">{a.name}</span>
                                  <ExternalLink className="size-3.5 shrink-0 text-primary opacity-80" />
                                </a>
                              ) : (
                                a.name
                              )}
                            </span>
                            <span className="text-primary font-semibold">${a.cost}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
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
