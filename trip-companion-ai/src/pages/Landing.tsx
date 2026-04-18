import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  ArrowRight,
  MapPin,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";
import TopNav from "@/components/TopNav";
import { useCreateTrip, useDeleteTrip, useTrips } from "@/hooks/useTrip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const YOUTUBE_VIDEO_ID = "dQw4w9WgXcQ"; // ← replace with your video ID

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const formatDateRange = (start: string, end: string) => {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${new Date(start).toLocaleDateString("en-US", opts)} – ${new Date(end).toLocaleDateString("en-US", opts)}`;
};
const getDuration = (start: string, end: string) => {
  const days = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
  return `${days} day${days !== 1 ? "s" : ""}`;
};

// ─── COLOR SYSTEM ────────────────────────────────────────────────────────────
type Colors = {
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceHover: string;
  border: string;
  borderAccent: string;
  orange: string;
  text: string;
  textMuted: string;
  textFaint: string;
};

function getColors(dark: boolean): Colors {
  if (dark) {
    return {
      bg: "#0C0A08",
      bgAlt: "#100E0C",
      surface: "rgba(255,255,255,0.04)",
      surfaceHover: "rgba(255,255,255,0.07)",
      border: "rgba(255,255,255,0.08)",
      borderAccent: "rgba(232,99,42,0.4)",
      orange: "#E8632A",
      text: "#F0EBE5",
      textMuted: "rgba(240,235,229,0.5)",
      textFaint: "rgba(240,235,229,0.28)",
    };
  }
  return {
    bg: "#FFFFFF",
    bgAlt: "#F8F5F2",
    surface: "rgba(0,0,0,0.03)",
    surfaceHover: "rgba(0,0,0,0.055)",
    border: "rgba(0,0,0,0.08)",
    borderAccent: "rgba(232,99,42,0.35)",
    orange: "#E8632A",
    text: "#1A1512",
    textMuted: "rgba(26,21,18,0.55)",
    textFaint: "rgba(26,21,18,0.32)",
  };
}

// ─── STATIC DATA ─────────────────────────────────────────────────────────────
const EXAMPLE_TRIPS = [
  {
    label: "Family Europe",
    sub: "2 weeks · Paris, Rome, Barcelona",
    bgLight: "#FFF4EE",
    bgDark: "rgba(232,99,42,0.08)",
    borderLight: "rgba(232,99,42,0.2)",
    borderDark: "rgba(232,99,42,0.15)",
    accentLight: "#C8501A",
    accentDark: "#F5A855",
    emoji: "🗼",
  },
  {
    label: "Honeymoon in Japan",
    sub: "10 days · Tokyo, Kyoto, Osaka",
    bgLight: "#EFF8FF",
    bgDark: "rgba(126,200,216,0.06)",
    borderLight: "rgba(126,200,216,0.35)",
    borderDark: "rgba(126,200,216,0.12)",
    accentLight: "#2C7DA0",
    accentDark: "#7EC8D8",
    emoji: "🌸",
  },
  {
    label: "Solo Road Trip USA",
    sub: "7 days · Route 66 highlights",
    bgLight: "#F5F0FF",
    bgDark: "rgba(176,124,245,0.06)",
    borderLight: "rgba(176,124,245,0.3)",
    borderDark: "rgba(176,124,245,0.12)",
    accentLight: "#6B3FC8",
    accentDark: "#B07CF5",
    emoji: "🚗",
  },
];

const FEATURES = [
  {
    icon: "✦",
    title: "Tailor-made",
    body: "Your budget, travel style, and preferences shape every recommendation — no two itineraries are the same.",
  },
  {
    icon: "◈",
    title: "Budget-smart",
    body: "Live flight data and real pricing built into your plan, so every day fits your budget without the math.",
  },
  {
    icon: "◎",
    title: "Hidden gems",
    body: "Go beyond the tourist trail with curated local spots your friends haven't discovered yet.",
  },
  {
    icon: "◇",
    title: "No surprises",
    body: "Every activity, meal, and transfer accounted for in one clean itinerary you can share and export.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I planned our entire 10-day Japan trip in about 20 minutes. The day-by-day breakdown was incredibly detailed — flights, ryokans, food spots. It would've taken me weeks to research all of this.",
    name: "Sarah M.",
    tag: "Traveled to Japan",
  },
  {
    quote:
      "As someone who gets overwhelmed by trip planning, this was a game changer. I just told it my budget and that I love hiking and street food, and it handed me a perfect itinerary for Peru.",
    name: "James K.",
    tag: "Traveled to Peru",
  },
  {
    quote:
      "We used it for our family trip to Europe with three kids. It factored in pace, kid-friendly activities, and layovers. Genuinely impressive — felt like having a personal travel agent.",
    name: "Priya & Tom R.",
    tag: "Family trip to Europe",
  },
];

const FAQS = [
  {
    q: "What is TripLogic?",
    a: "TripLogic is an AI-powered travel planning tool that builds personalized day-by-day itineraries based on your destination, travel style, budget, and timeline. Think of it as a knowledgeable travel agent available 24/7.",
  },
  {
    q: "How does TripLogic work?",
    a: "You tell TripLogic where you want to go — or just a vibe, like 'beach trip for two' — and our AI handles the rest. It generates a full itinerary including suggested flights, accommodations, activities, and meals, then lets you refine anything through a chat interface.",
  },
  {
    q: "Is TripLogic free to use?",
    a: "Yes — you can get started for free with no credit card required. Create your first itinerary and see exactly how it works before committing to anything.",
  },
  {
    q: "What kinds of trips can TripLogic plan?",
    a: "Everything from weekend city breaks and solo backpacking adventures to honeymoons, family vacations, road trips, and multi-country itineraries. If you can describe it, TripLogic can plan it.",
  },
  {
    q: "How accurate is the flight and pricing data?",
    a: "TripLogic pulls live flight data to surface real routes and price ranges. While we recommend confirming final prices at booking, the estimates are pulled from current market data and are typically very close to what you'll pay.",
  },
  {
    q: "Can I edit my itinerary after it's generated?",
    a: "Absolutely. Your itinerary is fully editable. Swap activities, adjust dates, change accommodations, or just chat with the AI to refine anything — it updates in real time.",
  },
  {
    q: "Does TripLogic book flights and hotels for me?",
    a: "TripLogic focuses on planning. We surface the best options and give you everything you need to book with confidence, but the final booking happens through your preferred travel sites or directly with providers.",
  },
  {
    q: "How does the budget tracker work?",
    a: "Set your total trip budget at the start. As your itinerary fills in, TripLogic tracks estimated costs across flights, stays, activities, and meals and shows you a live budget meter so you never go over.",
  },
  {
    q: "Can I share my itinerary with travel companions?",
    a: "Yes — every itinerary has a shareable link so your travel companions can view and comment on the plan. Collaborative editing is on the roadmap.",
  },
  {
    q: "How is TripLogic different from other trip planners?",
    a: "Most trip planning tools give you a list of things to do and leave the rest to you. TripLogic actually thinks — it understands your preferences, connects the dots across flights, accommodation, and activities, and refines the plan through natural conversation.",
  },
];

// ─── SHARED PRIMITIVES ───────────────────────────────────────────────────────
function SectionLabel({ children, C }: { children: React.ReactNode; C: Colors }) {
  return (
    <p
      style={{
        color: C.orange,
        fontSize: "0.7rem",
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        marginBottom: "0.875rem",
      }}
    >
      {children}
    </p>
  );
}

function DisplayHeading({
  children,
  center = false,
  maxWidth,
  C,
}: {
  children: React.ReactNode;
  center?: boolean;
  maxWidth?: string;
  C: Colors;
}) {
  return (
    <h2
      style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 600,
        fontSize: "clamp(2.1rem, 4vw, 3.2rem)",
        color: C.text,
        lineHeight: 1.1,
        letterSpacing: "-0.02em",
        maxWidth: maxWidth ?? "none",
        textAlign: center ? "center" : "left",
        margin: center ? "0 auto" : undefined,
      }}
    >
      {children}
    </h2>
  );
}

function Divider({ C }: { C: Colors }) {
  return <div style={{ height: "1px", background: C.border }} />;
}

// ─── SEARCH BAR ──────────────────────────────────────────────────────────────
function SearchBar({
  query,
  setQuery,
  onSubmit,
  isPending,
  C,
  hero = false,
}: {
  query: string;
  setQuery: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  C: Colors;
  hero?: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.625rem",
        background: C.bg,
        border: `1.5px solid ${C.border}`,
        borderRadius: hero ? "1rem" : "0.875rem",
        padding: hero ? "0.75rem 0.75rem 0.75rem 1.25rem" : "0.55rem 0.55rem 0.55rem 1rem",
        boxShadow: hero
          ? `0 4px 24px ${C.border}, 0 1px 2px rgba(0,0,0,0.04)`
          : "none",
        width: "100%",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onFocus={() => {}}
    >
      <Search
        size={hero ? 20 : 17}
        style={{ color: C.textFaint, flexShrink: 0 }}
      />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Where do you want to go?"
        disabled={isPending}
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: C.text,
          fontSize: hero ? "1.1rem" : "0.95rem",
          fontWeight: 400,
        }}
        className="placeholder:text-[rgba(26,21,18,0.3)] dark:placeholder:text-[rgba(240,235,229,0.3)]"
      />
      <button
        type="submit"
        disabled={isPending}
        style={{
          background: `linear-gradient(135deg, #E8632A 0%, #C8501A 100%)`,
          color: "#fff",
          border: "none",
          borderRadius: hero ? "0.7rem" : "0.55rem",
          padding: hero ? "0.7rem 1.6rem" : "0.55rem 1.1rem",
          fontSize: hero ? "0.95rem" : "0.84rem",
          fontWeight: 600,
          cursor: isPending ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          flexShrink: 0,
          letterSpacing: "0.01em",
          opacity: isPending ? 0.65 : 1,
          transition: "opacity 0.2s, transform 0.15s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          if (!isPending) (e.currentTarget as HTMLElement).style.transform = "scale(1.02)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "none";
        }}
      >
        {isPending ? "Planning…" : "Plan Trip"}
        {!isPending && <ArrowRight size={14} />}
      </button>
    </form>
  );
}

// ─── 1. HERO ─────────────────────────────────────────────────────────────────
function Hero({
  query,
  setQuery,
  onSearch,
  onTag,
  isPending,
  dark,
  C,
}: {
  query: string;
  setQuery: (v: string) => void;
  onSearch: (e: React.FormEvent) => void;
  onTag: (t: string) => void;
  isPending: boolean;
  dark: boolean;
  C: Colors;
}) {
  const TAGS = ["Weekend getaway", "Family vacation", "Solo adventure", "Honeymoon", "Road trip"];

  return (
    <section
      style={{
        position: "relative",
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "7rem 1.5rem 4rem",
        overflow: "hidden",
        background: C.bg,
        transition: "background 0.35s",
      }}
    >
      {/* Subtle ambient glow — orange tint only, no full gradient */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-10%",
          right: "-5%",
          width: "55vw",
          height: "55vw",
          maxWidth: "600px",
          maxHeight: "600px",
          borderRadius: "50%",
          background: dark
            ? "radial-gradient(circle, rgba(232,99,42,0.12) 0%, transparent 65%)"
            : "radial-gradient(circle, rgba(232,99,42,0.07) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: "5%",
          left: "-5%",
          width: "40vw",
          height: "40vw",
          maxWidth: "400px",
          maxHeight: "400px",
          borderRadius: "50%",
          background: dark
            ? "radial-gradient(circle, rgba(232,99,42,0.07) 0%, transparent 65%)"
            : "radial-gradient(circle, rgba(232,99,42,0.04) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "680px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 600,
            fontSize: "clamp(3.2rem, 9vw, 6rem)",
            lineHeight: 1.03,
            letterSpacing: "-0.025em",
            color: C.text,
            margin: "0 0 1.25rem",
            transition: "color 0.35s",
          }}
        >
          Your trip.{" "}
          <em
            style={{
              fontStyle: "italic",
              color: C.orange,
            }}
          >
            Planned in minutes.
          </em>
        </h1>

        <p
          style={{
            color: C.textMuted,
            fontSize: "1.1rem",
            lineHeight: 1.65,
            maxWidth: "400px",
            margin: "0 auto 2.5rem",
            transition: "color 0.35s",
          }}
        >
          Tell TripLogic your style and budget, and it'll design the perfect
          itinerary — flights, stays, and all.
        </p>

        {/* Search bar — hero sized */}
        <div style={{ maxWidth: "560px", margin: "0 auto 1.25rem" }}>
          <SearchBar
            query={query}
            setQuery={setQuery}
            onSubmit={onSearch}
            isPending={isPending}
            C={C}
            hero
          />
        </div>

        {/* Quick-start tags */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          {TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => onTag(tag)}
              disabled={isPending}
              style={{
                padding: "0.35rem 0.9rem",
                borderRadius: "999px",
                border: `1px solid ${C.border}`,
                background: C.surface,
                color: C.textMuted,
                fontSize: "0.8rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "border-color 0.18s, color 0.18s, background 0.18s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = C.borderAccent;
                el.style.color = C.orange;
                el.style.background = dark
                  ? "rgba(232,99,42,0.07)"
                  : "rgba(232,99,42,0.05)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = C.border;
                el.style.color = C.textMuted;
                el.style.background = C.surface;
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        style={{
          position: "absolute",
          bottom: "2rem",
          left: "50%",
          transform: "translateX(-50%)",
          color: C.textFaint,
          animation: "scrollBounce 2.5s ease-in-out infinite",
        }}
      >
        <ChevronDown size={18} />
      </div>

      <style>{`
        @keyframes scrollBounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(7px); }
        }
      `}</style>
    </section>
  );
}

// ─── 2. WHERE TO GO NEXT ─────────────────────────────────────────────────────
function WhereToGoNext({ onTag, dark, C }: { onTag: (t: string) => void; dark: boolean; C: Colors }) {
  return (
    <section style={{ background: C.bgAlt, padding: "5rem 1.5rem", transition: "background 0.35s" }}>
      <Divider C={C} />
      <div style={{ maxWidth: "960px", margin: "0 auto", paddingTop: "5rem" }}>
        <div style={{ marginBottom: "2.5rem" }}>
          <SectionLabel C={C}>Inspiration</SectionLabel>
          <DisplayHeading C={C} maxWidth="28rem">
            Where to go next?
          </DisplayHeading>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {EXAMPLE_TRIPS.map((trip) => {
            const bg = dark ? trip.bgDark : trip.bgLight;
            const border = dark ? trip.borderDark : trip.borderLight;
            const accent = dark ? trip.accentDark : trip.accentLight;
            return (
              <button
                key={trip.label}
                onClick={() => onTag(trip.label)}
                style={{
                  background: bg,
                  border: `1px solid ${border}`,
                  borderRadius: "1.25rem",
                  padding: "2rem",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "translateY(-4px)";
                  el.style.boxShadow = dark
                    ? "0 16px 40px rgba(0,0,0,0.35)"
                    : "0 12px 32px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "none";
                  el.style.boxShadow = "none";
                }}
              >
                <div style={{ fontSize: "2.75rem", lineHeight: 1, marginBottom: "1.5rem" }}>
                  {trip.emoji}
                </div>
                <p
                  style={{
                    color: C.text,
                    fontWeight: 700,
                    fontSize: "1rem",
                    marginBottom: "0.3rem",
                    transition: "color 0.35s",
                  }}
                >
                  {trip.label}
                </p>
                <p style={{ color: C.textMuted, fontSize: "0.83rem", transition: "color 0.35s" }}>
                  {trip.sub}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    marginTop: "1.25rem",
                    color: accent,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  Start planning <ArrowRight size={12} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── 3. ALL-IN-ONE ───────────────────────────────────────────────────────────
function AllInOne({ onStart, dark, C }: { onStart: () => void; dark: boolean; C: Colors }) {
  return (
    <section style={{ background: C.bg, padding: "5rem 1.5rem", transition: "background 0.35s" }}>
      <Divider C={C} />
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          paddingTop: "5rem",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "4rem",
          alignItems: "center",
        }}
        className="feature-2col"
      >
        <div>
          <SectionLabel C={C}>The TripLogic difference</SectionLabel>
          <DisplayHeading C={C} maxWidth="26rem">
            All-in-one AI trip planner built for real travelers.
          </DisplayHeading>
          <p
            style={{
              color: C.textMuted,
              fontSize: "0.97rem",
              lineHeight: 1.75,
              margin: "1.5rem 0 2rem",
              transition: "color 0.35s",
            }}
          >
            Most planning tools hand you a list of places and leave the rest to
            you. TripLogic connects everything — live flights, accommodations,
            activities, restaurants, and your budget — into one coherent plan
            you can refine through natural conversation.
          </p>
          <button
            onClick={onStart}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "linear-gradient(135deg, #E8632A 0%, #C8501A 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "0.75rem",
              padding: "0.75rem 1.5rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Create a new trip <ArrowRight size={14} />
          </button>
        </div>

        {/* Itinerary preview panel */}
        <div
          style={{
            background: C.bgAlt,
            border: `1px solid ${C.border}`,
            borderRadius: "1.25rem",
            padding: "1.75rem",
            transition: "background 0.35s, border-color 0.35s",
          }}
        >
          {[
            "Day 1 — Arrival & neighborhood walk",
            "Day 2 — Museums & local cuisine",
            "Day 3 — Day trip to the coast",
            "Day 4 — Markets & farewell dinner",
          ].map((day, i) => (
            <div
              key={day}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "0.85rem 0",
                borderBottom: i < 3 ? `1px solid ${C.border}` : "none",
              }}
            >
              <div
                style={{
                  width: "2rem",
                  height: "2rem",
                  borderRadius: "0.5rem",
                  background: i === 0 ? "rgba(232,99,42,0.12)" : C.surface,
                  border: `1px solid ${i === 0 ? "rgba(232,99,42,0.35)" : C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  color: i === 0 ? C.orange : C.textFaint,
                  flexShrink: 0,
                  transition: "background 0.35s, border-color 0.35s",
                }}
              >
                {i + 1}
              </div>
              <p
                style={{
                  color: i === 0 ? C.text : C.textMuted,
                  fontSize: "0.85rem",
                  fontWeight: i === 0 ? 500 : 400,
                  transition: "color 0.35s",
                }}
              >
                {day}
              </p>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "1rem",
              padding: "0.6rem 0.85rem",
              background: "rgba(232,99,42,0.07)",
              border: "1px solid rgba(232,99,42,0.25)",
              borderRadius: "0.6rem",
            }}
          >
            <div
              style={{
                width: "0.5rem",
                height: "0.5rem",
                borderRadius: "50%",
                background: C.orange,
                animation: "dotPulse 2s ease-in-out infinite",
              }}
            />
            <p style={{ color: C.orange, fontSize: "0.78rem", fontWeight: 500 }}>
              AI is refining your itinerary…
            </p>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes dotPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @media (max-width: 680px) { .feature-2col { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}

// ─── 4. FEATURE GRID ─────────────────────────────────────────────────────────
function FeatureGrid({ C }: { C: Colors }) {
  return (
    <section style={{ background: C.bgAlt, padding: "5rem 1.5rem", transition: "background 0.35s" }}>
      <Divider C={C} />
      <div style={{ maxWidth: "960px", margin: "0 auto", paddingTop: "5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <SectionLabel C={C}>Why TripLogic</SectionLabel>
          <DisplayHeading C={C} center maxWidth="38rem">
            Planning a trip should feel exciting,{" "}
            <em style={{ fontStyle: "italic", color: C.textMuted }}>not exhausting.</em>
          </DisplayHeading>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1px",
            background: C.border,
            borderRadius: "1.25rem",
            overflow: "hidden",
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: C.bgAlt,
                padding: "2rem 1.75rem",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = C.surfaceHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = C.bgAlt;
              }}
            >
              <div style={{ fontSize: "1.3rem", color: C.orange, marginBottom: "1rem" }}>
                {f.icon}
              </div>
              <p style={{ color: C.text, fontWeight: 700, fontSize: "0.95rem", marginBottom: "0.6rem" }}>
                {f.title}
              </p>
              <p style={{ color: C.textMuted, fontSize: "0.85rem", lineHeight: 1.65 }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 5. VIDEO DEMO ───────────────────────────────────────────────────────────
function VideoDemo({ dark, C }: { dark: boolean; C: Colors }) {
  return (
    <section style={{ background: C.bg, padding: "5rem 1.5rem", transition: "background 0.35s" }}>
      <Divider C={C} />
      <div style={{ maxWidth: "880px", margin: "0 auto", paddingTop: "5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2.75rem" }}>
          <SectionLabel C={C}>See it in action</SectionLabel>
          <DisplayHeading C={C} center>
            A full trip planned in{" "}
            <em style={{ fontStyle: "italic", color: C.orange }}>under two minutes.</em>
          </DisplayHeading>
        </div>

        <div
          style={{
            position: "relative",
            borderRadius: "1.25rem",
            overflow: "hidden",
            border: `1px solid ${C.border}`,
            boxShadow: dark
              ? "0 32px 64px rgba(0,0,0,0.45)"
              : "0 16px 48px rgba(0,0,0,0.1)",
            aspectRatio: "16/9",
            background: dark ? "#111" : "#f0f0f0",
            transition: "box-shadow 0.35s, border-color 0.35s",
          }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?rel=0&modestbranding=1`}
            title="TripLogic Demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
          />
        </div>
      </div>
    </section>
  );
}

// ─── 6. TESTIMONIALS ─────────────────────────────────────────────────────────
function Testimonials({ C }: { C: Colors }) {
  return (
    <section style={{ background: C.bgAlt, padding: "5rem 1.5rem", transition: "background 0.35s" }}>
      <Divider C={C} />
      <div style={{ maxWidth: "960px", margin: "0 auto", paddingTop: "5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <SectionLabel C={C}>Travelers love it</SectionLabel>
          <DisplayHeading C={C} center>
            What travelers say about TripLogic.
          </DisplayHeading>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: "1.25rem",
                padding: "1.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                transition: "background 0.35s, border-color 0.35s",
              }}
            >
              <div style={{ display: "flex", gap: "0.2rem" }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={13} style={{ color: C.orange, fill: C.orange }} />
                ))}
              </div>
              <p style={{ color: C.textMuted, fontSize: "0.9rem", lineHeight: 1.7, flex: 1, fontStyle: "italic" }}>
                "{t.quote}"
              </p>
              <div>
                <p style={{ color: C.text, fontWeight: 600, fontSize: "0.85rem" }}>{t.name}</p>
                <p style={{ color: C.textFaint, fontSize: "0.78rem" }}>{t.tag}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 7. FAQ ──────────────────────────────────────────────────────────────────
function FAQ({ C }: { C: Colors }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section style={{ background: C.bg, padding: "5rem 1.5rem", transition: "background 0.35s" }}>
      <Divider C={C} />
      <div style={{ maxWidth: "680px", margin: "0 auto", paddingTop: "5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <SectionLabel C={C}>FAQ</SectionLabel>
          <DisplayHeading C={C} center>
            Common questions, answered.
          </DisplayHeading>
        </div>

        <div>
          {FAQS.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div key={faq.q} style={{ borderBottom: `1px solid ${C.border}` }}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1.35rem 0",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    gap: "1rem",
                  }}
                >
                  <span
                    style={{
                      color: isOpen ? C.text : C.textMuted,
                      fontWeight: isOpen ? 600 : 500,
                      fontSize: "0.95rem",
                      transition: "color 0.2s",
                    }}
                  >
                    {faq.q}
                  </span>
                  <span
                    style={{
                      color: isOpen ? C.orange : C.textFaint,
                      flexShrink: 0,
                      transition: "color 0.2s",
                    }}
                  >
                    {isOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                  </span>
                </button>
                {isOpen && (
                  <p
                    style={{
                      color: C.textMuted,
                      fontSize: "0.9rem",
                      lineHeight: 1.75,
                      paddingBottom: "1.35rem",
                    }}
                  >
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── 8. FINAL CTA ────────────────────────────────────────────────────────────
function FinalCTA({
  query,
  setQuery,
  onSearch,
  isPending,
  C,
}: {
  query: string;
  setQuery: (v: string) => void;
  onSearch: (e: React.FormEvent) => void;
  isPending: boolean;
  C: Colors;
}) {
  return (
    <section style={{ background: C.bgAlt, padding: "5rem 1.5rem", transition: "background 0.35s" }}>
      <Divider C={C} />
      <div
        style={{
          maxWidth: "560px",
          margin: "0 auto",
          textAlign: "center",
          paddingTop: "5rem",
        }}
      >
        <SectionLabel C={C}>Get started</SectionLabel>
        <DisplayHeading C={C} center>
          Ready to give it a try?
        </DisplayHeading>
        <p
          style={{
            color: C.textMuted,
            fontSize: "0.97rem",
            margin: "1.25rem auto 2.25rem",
            maxWidth: "360px",
            lineHeight: 1.65,
          }}
        >
          Join thousands of travelers who plan smarter. No credit card required.
        </p>
        <SearchBar
          query={query}
          setQuery={setQuery}
          onSubmit={onSearch}
          isPending={isPending}
          C={C}
          hero
        />
      </div>
    </section>
  );
}

// ─── 9. RECENT TRIPS ─────────────────────────────────────────────────────────
function RecentTrips({
  trips,
  allTrips,
  onNavigate,
  onDelete,
  C,
}: {
  trips: any[];
  allTrips: any[];
  onNavigate: (trip: any) => void;
  onDelete: (e: React.MouseEvent, id: number) => void;
  C: Colors;
}) {
  const navigate = useNavigate();
  if (trips.length === 0) return null;

  return (
    <section style={{ background: C.bg, padding: "3.5rem 1.5rem", transition: "background 0.35s" }}>
      <Divider C={C} />
      <div style={{ maxWidth: "960px", margin: "0 auto", paddingTop: "3.5rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.25rem",
          }}
        >
          <SectionLabel C={C}>Your trips</SectionLabel>
          {allTrips.length > 4 && (
            <button
              onClick={() => navigate("/trips")}
              style={{
                color: C.orange,
                fontSize: "0.8rem",
                fontWeight: 500,
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              View all <ArrowRight size={12} />
            </button>
          )}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "0.875rem",
          }}
        >
          {trips.map((trip) => (
            <div
              key={trip.id}
              onClick={() => onNavigate(trip)}
              className="group"
              style={{
                position: "relative",
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: "1rem",
                padding: "1.25rem",
                cursor: "pointer",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = C.borderAccent;
                el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = C.border;
                el.style.boxShadow = "none";
              }}
            >
              <button
                type="button"
                onClick={(e) => onDelete(e, trip.id)}
                style={{
                  position: "absolute",
                  top: "0.75rem",
                  right: "0.75rem",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: C.textFaint,
                  padding: "0.25rem",
                  borderRadius: "0.35rem",
                  opacity: 0,
                  transition: "color 0.15s, opacity 0.15s",
                }}
                className="group-hover:opacity-100"
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = C.orange;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = C.textFaint;
                }}
              >
                <Trash2 size={13} />
              </button>
              <div
                style={{
                  width: "2rem",
                  height: "2rem",
                  borderRadius: "0.5rem",
                  background: "rgba(232,99,42,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "0.85rem",
                }}
              >
                <MapPin size={14} style={{ color: C.orange }} />
              </div>
              <p
                style={{
                  color: C.text,
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  marginBottom: "0.2rem",
                  paddingRight: "1.25rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {trip.title}
              </p>
              <p style={{ color: C.textMuted, fontSize: "0.75rem" }}>
                {formatDateRange(trip.start, trip.end)} · {getDuration(trip.start, trip.end)}
              </p>
              <p style={{ color: C.textFaint, fontSize: "0.72rem", marginTop: "0.1rem" }}>
                {trip.activities.length} activities · ${trip.budget.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FOOTER ──────────────────────────────────────────────────────────────────
function Footer({ C }: { C: Colors }) {
  return (
    <footer
      style={{
        background: C.bg,
        borderTop: `1px solid ${C.border}`,
        padding: "2.5rem 1.5rem",
        transition: "background 0.35s, border-color 0.35s",
      }}
    >
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.875rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              width: "1.6rem",
              height: "1.6rem",
              borderRadius: "0.35rem",
              background: "linear-gradient(135deg, #E8632A, #C8501A)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MapPin size={11} style={{ color: "#fff" }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: C.text, letterSpacing: "-0.01em" }}>
            TripLogic
          </span>
        </div>
        <p style={{ color: C.textFaint, fontSize: "0.78rem" }}>
          © {new Date().getFullYear()} TripLogic — AI-powered travel planning
        </p>
      </div>
    </footer>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────
const Landing = () => {
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState("");
  const [tripToDelete, setTripToDelete] = useState<number | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openAuthModal, user } = useAuth();
  const createTrip = useCreateTrip();
  const deleteTripMutation = useDeleteTrip();
  const { data: trips = [], isLoading: tripsLoading } = useTrips();
  const recentTrips = trips.slice(0, 4);
  const C = getColors(dark);

  const handleDelete = (e: React.MouseEvent, tripId: number) => {
    e.stopPropagation();
    setTripToDelete(tripId);
  };
  const confirmDelete = () => {
    if (tripToDelete !== null) {
      deleteTripMutation.mutate(tripToDelete);
      setTripToDelete(null);
    }
  };
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) createTrip.mutate(query.trim());
  };
  const handleTag = (tag: string) => createTrip.mutate(tag);
  const handleNavigate = (trip: any) =>
    navigate(
      trip.planning_phase === "gathering" || trip.planning_phase === "confirming"
        ? `/planning/${trip.id}`
        : `/planner/${trip.id}`
    );

  useEffect(() => {
    if (searchParams.get("auth") !== "required") return;
    openAuthModal({ mode: "signin" });
    const next = searchParams.get("next");
    if (user && next) {
      navigate(decodeURIComponent(next), { replace: true });
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("auth");
    setSearchParams(nextParams, { replace: true });
  }, [navigate, openAuthModal, searchParams, setSearchParams, user]);

  if (createTrip.isPending) {
    return (
      <div
        style={{
          minHeight: "100svh",
          background: C.bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          transition: "background 0.35s",
        }}
      >
        <Loader2 className="animate-spin" size={34} style={{ color: C.orange }} />
        <p style={{ color: C.text, fontWeight: 500, fontSize: "1.05rem" }}>
          Building your itinerary…
        </p>
        <p style={{ color: C.textMuted, fontSize: "0.85rem" }}>This may take a few seconds</p>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100svh", transition: "background 0.35s" }}>
      <TopNav
        variant="dark"
        darkMode={dark}
        onToggleDark={() => setDark((d) => !d)}
      />

      <Hero
        query={query}
        setQuery={setQuery}
        onSearch={handleSearch}
        onTag={handleTag}
        isPending={createTrip.isPending}
        dark={dark}
        C={C}
      />

      <WhereToGoNext onTag={handleTag} dark={dark} C={C} />
      <AllInOne onStart={() => createTrip.mutate("My next trip")} dark={dark} C={C} />
      <FeatureGrid C={C} />
      <VideoDemo dark={dark} C={C} />
      <Testimonials C={C} />
      <FAQ C={C} />

      {!tripsLoading && recentTrips.length > 0 && (
        <RecentTrips
          trips={recentTrips}
          allTrips={trips}
          onNavigate={handleNavigate}
          onDelete={handleDelete}
          C={C}
        />
      )}

      <FinalCTA
        query={query}
        setQuery={setQuery}
        onSearch={handleSearch}
        isPending={createTrip.isPending}
        C={C}
      />

      <Footer C={C} />

      <AlertDialog open={tripToDelete !== null} onOpenChange={() => setTripToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trip? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Landing;
