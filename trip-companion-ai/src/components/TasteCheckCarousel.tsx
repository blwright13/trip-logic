import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";

import type { TastePlaceSuggestion } from "@/services/api";

type TasteVote = "liked" | "disliked";

interface TasteCheckCarouselProps {
  suggestions: TastePlaceSuggestion[];
  votes: Record<string, TasteVote>;
  isLoading: boolean;
  configured: boolean;
  isSubmitting: boolean;
  onVote: (place: TastePlaceSuggestion, vote: TasteVote) => void;
  onContinue: () => void;
  onSkip: () => void;
}

function priceLevelLabel(priceLevel: TastePlaceSuggestion["price_level"]): string | null {
  if (priceLevel == null) return null;
  const normalized = String(priceLevel).trim().toUpperCase();
  const labels: Record<string, string> = {
    "0": "Free",
    "1": "$",
    "2": "$$",
    "3": "$$$",
    "4": "$$$$",
    PRICE_LEVEL_FREE: "Free",
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
  };
  return labels[normalized] ?? null;
}

function formatPlaceType(types: string[]): string {
  const normalized = types.map((type) => type.replace(/_/g, " ").toLowerCase());
  if (normalized.some((type) => type.includes("restaurant") || type.includes("food") || type.includes("cafe"))) {
    return "Dining spot";
  }
  if (normalized.some((type) => type.includes("museum") || type.includes("art gallery") || type.includes("landmark"))) {
    return "Culture stop";
  }
  if (normalized.some((type) => type.includes("park") || type.includes("natural") || type.includes("tourist attraction"))) {
    return "Sightseeing stop";
  }
  if (normalized.some((type) => type.includes("bar") || type.includes("night club"))) {
    return "Nightlife spot";
  }
  return "Local stop";
}

function buildDescription(place: TastePlaceSuggestion): string {
  if (place.description) return place.description;
  const rating = place.rating ? ` with a ${Number(place.rating).toFixed(1)} Google rating` : "";
  return `${formatPlaceType(place.types)}${rating} where you can sample the kind of stop this itinerary should prioritize.`;
}

const TasteCheckCarousel = ({
  suggestions,
  votes,
  isLoading,
  configured,
  isSubmitting,
  onVote,
  onContinue,
  onSkip,
}: TasteCheckCarouselProps) => {
  const [index, setIndex] = useState(0);
  const current = suggestions[index];

  useEffect(() => {
    if (index >= suggestions.length) {
      setIndex(Math.max(0, suggestions.length - 1));
    }
  }, [index, suggestions.length]);

  const description = useMemo(() => (current ? buildDescription(current) : ""), [current]);

  const goPrevious = () => setIndex((prev) => Math.max(0, prev - 1));
  const goNext = () => setIndex((prev) => Math.min(suggestions.length - 1, prev + 1));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setIndex((prev) => Math.max(0, prev - 1));
      }
      if (event.key === "ArrowRight") {
        setIndex((prev) => Math.min(suggestions.length - 1, prev + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [suggestions.length]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading sample spots...
      </div>
    );
  }

  if (!current) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
        <p className="text-amber-700 dark:text-amber-400">
          No taste-check spots came back. You can skip this step or check the Places API configuration.
        </p>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onSkip}
          className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-50"
        >
          Skip taste quiz
        </button>
      </div>
    );
  }

  const vote = votes[current.id];
  const atStart = index === 0;
  const atEnd = index === suggestions.length - 1;
  const cost = priceLevelLabel(current.price_level);

  return (
    <div
      role="group"
      aria-label="Taste check cards"
      className="w-[70%] min-w-[320px] max-w-full overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm outline-none max-sm:w-full max-sm:min-w-0"
      tabIndex={0}
    >
      {current.photo_url && (
        <img
          src={current.photo_url}
          alt={current.name ?? "Taste-check place"}
          className="block h-auto w-full bg-secondary"
          loading="lazy"
        />
      )}
      <div className="space-y-4 p-4">
        {!configured && (
          <p className="rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
            Live venue names need GOOGLE_PLACES_API_KEY. These style prompts can still calibrate taste.
          </p>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Taste check {index + 1} of {suggestions.length}
            </p>
            <h3 className="mt-1 text-lg font-semibold leading-tight text-foreground">{current.name ?? "Place"}</h3>
            {current.address && <p className="mt-1 text-sm text-muted-foreground">{current.address}</p>}
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="Previous place"
              disabled={atStart}
              onClick={goPrevious}
              className="rounded-full border border-border p-2 text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next place"
              disabled={atEnd}
              onClick={goNext}
              className="rounded-full border border-border p-2 text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
          <span className="rounded-full border border-border bg-secondary/60 px-3 py-1">
            Cost: {cost ?? "not listed"}
          </span>
          {current.rating && (
            <span className="rounded-full border border-border bg-secondary/60 px-3 py-1">
              Rating: {Number(current.rating).toFixed(1)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-label={`Like ${current.name ?? "place"}`}
            onClick={() => onVote(current, "liked")}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              vote === "liked"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-foreground hover:bg-secondary"
            }`}
          >
            <ThumbsUp className="h-4 w-4" /> Like
          </button>
          <button
            type="button"
            aria-label={`Dislike ${current.name ?? "place"}`}
            onClick={() => onVote(current, "disliked")}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              vote === "disliked"
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-border text-foreground hover:bg-secondary"
            }`}
          >
            <ThumbsDown className="h-4 w-4" /> Dislike
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onContinue}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save Preferences"}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onSkip}
            className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-50"
          >
            Skip taste quiz
          </button>
        </div>
      </div>
    </div>
  );
};

export default TasteCheckCarousel;
