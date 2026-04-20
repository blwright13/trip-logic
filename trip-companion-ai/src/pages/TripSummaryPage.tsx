import { useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, ArrowLeft, Utensils, Camera, Map, Bed, ShoppingBag, Music, Plane, Coffee, Loader2, ExternalLink } from "lucide-react";
import { jsPDF } from "jspdf";
import TopNav from "@/components/TopNav";
import { TripMap } from "@/components/TripMap";
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

  useEffect(() => {
    if (tripData?.planning_phase === "gathering" || tripData?.planning_phase === "confirming") {
      navigate(`/planning/${tripId}`, { replace: true });
    }
  }, [tripData, tripId, navigate]);

  const handleExport = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN = 48;
    const CONTENT_W = PAGE_W - MARGIN * 2;
    let y = MARGIN;

    const checkPage = (needed: number) => {
      if (y + needed > PAGE_H - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
    };

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.setFillColor(15, 118, 110);
    doc.rect(0, 0, PAGE_W, 80, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text(`Trip to ${trip.destination}`, MARGIN, 36);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(204, 240, 234);
    doc.text(
      `${trip.startDate}  -  ${trip.endDate}   *   ${trip.travelers} traveler${trip.travelers !== 1 ? "s" : ""}   *   Budget $${trip.budget.toLocaleString()}`,
      MARGIN,
      58,
    );

    y = 104;

    // ── Daily schedule ───────────────────────────────────────────────────────
    const categoryShort: Record<string, string> = {
      flight: "FLT", hotel: "HTL", food: "EAT", cafe: "CAF",
      sightseeing: "SEE", transport: "TRN", shopping: "SHP", entertainment: "ENT",
    };

    days.forEach((d) => {
      checkPage(56);

      // Day header with left accent bar
      doc.setFillColor(240, 253, 250);
      doc.roundedRect(MARGIN, y, CONTENT_W, 28, 4, 4, "F");
      doc.setFillColor(15, 118, 110);
      doc.rect(MARGIN, y, 4, 28, "F");

      doc.setTextColor(15, 118, 110);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Day ${d.day}`, MARGIN + 14, y + 18);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(d.date, MARGIN + 60, y + 18);
      y += 36;

      d.activities.forEach((a, idx) => {
        const hasLocation = !!a.location;
        const rowH = hasLocation ? 36 : 24;
        checkPage(rowH + 2);

        // Subtle alternating row tint
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
        }

        const midY = y + 15;
        const costStr = `$${a.cost.toLocaleString()}`;

        // Category badge
        const short = categoryShort[a.category] ?? "   ";
        doc.setFillColor(204, 240, 234);
        doc.roundedRect(MARGIN + 6, y + 5, 26, 13, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(15, 118, 110);
        doc.text(short, MARGIN + 8, y + 14);

        // Time
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(a.time, MARGIN + 38, midY);

        // Name
        const costW = doc.getTextWidth(costStr) + 12;
        const nameMaxW = CONTENT_W - 105 - costW;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(30, 41, 59);
        const nameLines = doc.splitTextToSize(a.name, nameMaxW);
        doc.text(nameLines[0], MARGIN + 100, midY);

        // Cost
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(15, 118, 110);
        doc.text(costStr, MARGIN + CONTENT_W - 4, midY, { align: "right" });

        if (hasLocation) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(148, 163, 184);
          const locMaxW = CONTENT_W - 105 - costW;
          const locLines = doc.splitTextToSize(a.location, locMaxW);
          doc.text(locLines[0], MARGIN + 100, midY + 13);
        }

        // Thin separator line
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);

        y += rowH;
      });

      y += 16;
    });

    // ── Cost breakdown ────────────────────────────────────────────────────────
    checkPage(56 + costByCategory.length * 26 + 44);

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 118, 110);
    doc.text("Cost Breakdown", MARGIN, y);
    y += 22;

    const BAR_X = MARGIN + 155;
    const BAR_W = 180;
    const BAR_H = 6;

    costByCategory.forEach(([cat, cost]) => {
      checkPage(26);
      const label = categoryLabels[cat] ?? cat;
      const pct = totalCost > 0 ? cost / totalCost : 0;

      // Dot
      doc.setFillColor(15, 118, 110);
      doc.circle(MARGIN + 6, y - 2, 3, "F");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(30, 41, 59);
      doc.text(label, MARGIN + 16, y);

      // Progress bar track
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(BAR_X, y - 8, BAR_W, BAR_H, 3, 3, "F");
      // Progress bar fill
      if (pct > 0) {
        doc.setFillColor(15, 118, 110);
        doc.roundedRect(BAR_X, y - 8, BAR_W * pct, BAR_H, 3, 3, "F");
      }

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`${Math.round(pct * 100)}%`, BAR_X + BAR_W + 8, y);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(15, 118, 110);
      doc.text(`$${cost.toLocaleString()}`, MARGIN + CONTENT_W, y, { align: "right" });

      y += 24;
    });

    y += 6;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text("Total", MARGIN + 8, y);
    doc.setTextColor(15, 118, 110);
    doc.text(`$${totalCost.toLocaleString()}`, MARGIN + CONTENT_W, y, { align: "right" });
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    const budgetNote = totalCost <= trip.budget ? "Under budget" : "Over budget";
    doc.text(`Budget: $${trip.budget.toLocaleString()}  *  ${budgetNote}`, MARGIN + 8, y);

    // ── Footer on every page ──────────────────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`TripLogic  *  Page ${i} of ${pageCount}`, PAGE_W / 2, PAGE_H - 20, { align: "center" });
    }

    doc.save(`${trip.destination.replace(/[^a-z0-9]/gi, "-")}-itinerary.pdf`);
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
        <div className="max-w-6xl mx-auto px-4 py-8">
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

          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] gap-6">
            {/* Itinerary */}
            <div className="space-y-6">
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

              {/* Map */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-foreground mb-3">Locations</h3>
                <TripMap
                  activities={allActivities
                    .filter((a) => !!a.location)
                    .map((a) => ({ name: a.name, time: a.time, location: a.location }))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripSummaryPage;
