import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin, Calendar, Users, ArrowRight, Plane, Palmtree, Mountain, Building } from "lucide-react";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";

const templates = [
  {
    id: 1,
    title: "Tokyo, Japan",
    subtitle: "5 days · Culture & Food",
    icon: Building,
    color: "bg-accent text-accent-foreground",
  },
  {
    id: 2,
    title: "Bali, Indonesia",
    subtitle: "7 days · Beach & Wellness",
    icon: Palmtree,
    color: "bg-accent text-accent-foreground",
  },
  {
    id: 3,
    title: "Swiss Alps",
    subtitle: "4 days · Adventure",
    icon: Mountain,
    color: "bg-accent text-accent-foreground",
  },
  {
    id: 4,
    title: "Paris, France",
    subtitle: "3 days · Romance & Art",
    icon: Plane,
    color: "bg-accent text-accent-foreground",
  },
];

const Landing = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate("/planner");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopNav />

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="max-w-2xl w-full text-center mt-8">
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
            />
            <Button type="submit" size="sm" className="shrink-0 gap-1.5">
              Plan Trip
              <ArrowRight size={14} />
            </Button>
          </form>

          {/* Quick tags */}
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {["Weekend getaway", "Family vacation", "Solo backpacking", "Honeymoon"].map((tag) => (
              <button
                key={tag}
                onClick={() => { setQuery(tag); navigate("/planner"); }}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-chip text-chip-foreground hover:bg-chip-hover transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Featured templates */}
        <section className="max-w-3xl w-full mt-16 mb-12">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 text-center">
            Popular Destinations
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate("/planner")}
                className="group flex flex-col items-center gap-3 p-5 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-md transition-all text-center"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${t.color}`}>
                  <t.icon size={22} />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{t.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Landing;
