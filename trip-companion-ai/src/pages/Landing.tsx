import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, MapPin, Loader2 } from "lucide-react";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { useCreateTrip, useTrips } from "@/hooks/useTrip";

const formatDateRange = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
};

const getDuration = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return `${days} day${days !== 1 ? 's' : ''}`;
};

const Landing = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const createTrip = useCreateTrip();
  const { data: trips = [], isLoading: tripsLoading } = useTrips();
  const recentTrips = trips.slice(0, 4);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      createTrip.mutate(query.trim());
    }
  };

  const handleTagClick = (tag: string) => {
    createTrip.mutate(tag);
  };

  if (createTrip.isPending) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <TopNav />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium text-foreground">Creating your trip...</p>
          <p className="text-sm text-muted-foreground mt-1">This may take a few seconds</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopNav />

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className={`max-w-2xl w-full text-center ${recentTrips.length > 0 ? 'mt-8' : ''}`}>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-tight mb-3">
            Plan your perfect trip
          </h1>
          <p className="text-muted-foreground text-lg mb-8">
            AI-powered itineraries tailored to your style, budget, and timeline.
          </p>

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            className="flex items-center gap-2 bg-card border border-border rounded-2xl px-4 py-3 shadow-lg shadow-primary/5 max-w-xl mx-auto"
          >
            <Search size={20} className="text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Where do you want to go?"
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-base"
              disabled={createTrip.isPending}
            />
            <Button type="submit" size="sm" className="shrink-0 gap-1.5" disabled={createTrip.isPending}>
              {createTrip.isPending ? "Creating..." : "Plan Trip"}
              {!createTrip.isPending && <ArrowRight size={14} />}
            </Button>
          </form>

          {/* Quick tags */}
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {["Weekend getaway", "Family vacation", "Solo backpacking", "Honeymoon"].map((tag) => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                disabled={createTrip.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-chip text-chip-foreground hover:bg-chip-hover transition-colors disabled:opacity-50"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Your Trips Section */}
        {!tripsLoading && recentTrips.length > 0 && (
          <section className="max-w-3xl w-full mt-12 mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Your Trips
              </h2>
              {trips.length > 4 && (
                <button
                  onClick={() => navigate('/trips')}
                  className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                >
                  View All
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {recentTrips.map((trip) => (
                <button
                  key={trip.id}
                  onClick={() => navigate(`/planner/${trip.id}`)}
                  className="group flex flex-col items-start gap-2 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-md transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
                    <MapPin size={18} />
                  </div>
                  <div className="w-full">
                    <p className="font-semibold text-sm text-foreground truncate">{trip.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDateRange(trip.start, trip.end)} · {getDuration(trip.start, trip.end)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {trip.activities.length} activities · ${trip.budget.toLocaleString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
};

export default Landing;
