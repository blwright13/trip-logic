import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatPanel, { ChatMessage } from "@/components/ChatPanel";
import TopNav from "@/components/TopNav";
import {
  useTrip,
  useChatHistory,
  useSendPlanningMessage,
  usePostPlanningConfirm,
  useClaimTrip,
} from "@/hooks/useTrip";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Circle } from "lucide-react";

const SLOT_LABELS: Record<string, string> = {
  destinations: "Destination",
  start: "Start date",
  end: "End date",
  num_people: "Travelers",
  budget: "Budget",
  origin: "Departing from",
  preferences: "Getting there",
  transportation_to: "Getting there",
  transportation_around: "Getting around",
  pace: "Pace",
  accommodation_quality: "Accommodation",
  dining_style: "Dining",
  activity_vibe: "Activities",
  schedule_preference: "Schedule",
  tourist_preference: "Vibe",
  must_haves: "Must-haves",
  avoid: "Avoid",
};

const STYLE_VALUE_LABELS: Record<string, string> = {
  // pace
  laid_back: "Laid-back & relaxed",
  balanced: "Balanced",
  jam_packed: "Jam-packed",
  // accommodation
  budget: "Budget",
  comfortable: "Comfortable",
  upscale: "Upscale",
  luxury: "Luxury",
  // dining
  street_food: "Street food & local",
  mid_range: "Mid-range",
  fine_dining: "Fine dining",
  // activity
  outdoorsy: "Outdoorsy & active",
  cultural: "Cultural & museums",
  nightlife: "Nightlife & social",
  mix: "Mix of everything",
  // schedule
  early_bird: "Early bird",
  night_owl: "Night owl",
  flexible: "Flexible",
  // vibe
  off_beaten_path: "Off the beaten path",
  popular_highlights: "Popular highlights",
};

const STYLE_SLOTS = [
  "transportation_to",
  "transportation_around",
  "pace",
  "accommodation_quality",
  "dining_style",
  "activity_vibe",
  "schedule_preference",
  "tourist_preference",
  "must_haves",
  "avoid",
] as const;

function formatStyleValue(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const normalized = value.toLowerCase().replace(/[\s&-]+/g, "_");
  return STYLE_VALUE_LABELS[normalized] || STYLE_VALUE_LABELS[value.toLowerCase()] || value;
}

function isSlotFilled(slot: string, ctx: Record<string, unknown>): boolean {
  switch (slot) {
    case "destinations": {
      const d = ctx.destinations as string[] | undefined;
      return Array.isArray(d) && d.length > 0;
    }
    case "start": return !!ctx.start;
    case "end": return !!ctx.end;
    case "num_people": return ctx.num_people !== undefined && ctx.num_people !== null;
    case "budget": return ctx.budget !== undefined && ctx.budget !== null;
    case "origin": {
      const o = (ctx.origin as string | undefined)?.trim();
      const i = (ctx.origin_iata as string | undefined)?.trim().toUpperCase();
      return !!(o || (i && i.length >= 3));
    }
    case "transportation_to": return !!ctx.transportation_to;
    case "transportation_around": return !!ctx.transportation_around;
    default: return !!ctx[slot];
  }
}

function computeMissingSlots(ctx: Record<string, unknown> | undefined): string[] {
  if (!ctx) return ["destinations", "start", "end", "num_people", "budget", "origin"];
  const missing: string[] = [];
  const dests = ctx.destinations as string[] | undefined;
  if (!dests?.length) missing.push("destinations");
  if (!ctx.start) missing.push("start");
  if (!ctx.end) missing.push("end");
  if (ctx.num_people === undefined || ctx.num_people === null) missing.push("num_people");
  if (ctx.budget === undefined || ctx.budget === null) missing.push("budget");
  const origin = (ctx.origin as string | undefined)?.trim();
  const iata = (ctx.origin_iata as string | undefined)?.trim().toUpperCase();
  if (!origin && (!iata || iata.length < 3)) missing.push("origin");
  return missing;
}

function isPlanningPhase(p: string | undefined): boolean {
  return p === "gathering" || p === "confirming";
}

function formatWrittenDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const PlanningPage = () => {
  const navigate = useNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const tripIdNum = tripId ? parseInt(tripId, 10) : undefined;

  const { data: tripData, isLoading: tripLoading, error: tripError } = useTrip(tripIdNum);
  const { data: chatData } = useChatHistory(tripIdNum);
  const sendPlanning = useSendPlanningMessage(tripIdNum);
  const postConfirm = usePostPlanningConfirm(tripIdNum);
  const claimTrip = useClaimTrip(tripIdNum);
  const { user, openAuthModal } = useAuth();

  const [trip, setTrip] = useState({
    destination: "Loading...",
    startDate: "",
    endDate: "",
    budget: 0,
    travelers: 0,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [missingSlots, setMissingSlots] = useState<string[]>([]);
  const [pendingBuildAfterAuth, setPendingBuildAfterAuth] = useState(false);

  useEffect(() => {
    if (tripData?.planning_phase === "complete") {
      navigate(`/planner/${tripData.id}`, { replace: true });
    }
  }, [tripData, navigate]);

  useEffect(() => {
    if (tripData) {
      setTrip({
        destination: tripData.title,
        startDate: tripData.start,
        endDate: tripData.end,
        budget: tripData.budget,
        travelers: tripData.num_people,
      });
      setMissingSlots(computeMissingSlots(tripData.planning_context));
    }
  }, [tripData]);

  const ctx = (tripData?.planning_context || {}) as Record<string, unknown>;
  const phase = tripData?.planning_phase;


  useEffect(() => {
    if (chatData) {
      setMessages(
        chatData.map((msg) => ({
          id: msg.id.toString(),
          role: msg.role === "assistant" ? "ai" : "user",
          text: msg.content,
          chips: msg.chips || undefined,
        }))
      );
    }
  }, [chatData]);

  useEffect(() => {
    if (!pendingBuildAfterAuth || !user || !tripIdNum) return;
    const run = async () => {
      try {
        await claimTrip.mutateAsync();
        await postConfirm.mutateAsync();
        setPendingBuildAfterAuth(false);
      } catch (error) {
        setPendingBuildAfterAuth(false);
        toast.error(error instanceof Error ? error.message : "Could not claim trip");
      }
    };
    run();
  }, [claimTrip, pendingBuildAfterAuth, postConfirm, tripIdNum, user]);


  const allSlots = useMemo(
    () => ["destinations", "start", "end", "num_people", "budget", "origin"],
    []
  );

  const progressSlots = useMemo(() => {
    const pctx = (tripData?.planning_context || {}) as Record<string, unknown>;
    const coreComplete = allSlots.every((s) => isSlotFilled(s, pctx));
    if (coreComplete) {
      return [...allSlots, ...STYLE_SLOTS];
    }
    return [...allSlots];
  }, [tripData?.planning_context, allSlots]);

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", text };
      setMessages((prev) => [...prev, userMsg]);
      try {
        const data = await sendPlanning.mutateAsync(text);
        const aiMsg: ChatMessage = {
          id: data.message.id.toString(),
          role: "ai",
          text: data.message.content,
          chips: data.message.chips || undefined,
        };
        setMessages((prev) => [...prev, aiMsg]);
        setMissingSlots(data.missing_slots.length ? data.missing_slots : computeMissingSlots(data.planning_context));
        if (import.meta.env.DEV && data.itinerary_build_meta) {
          console.info("[itinerary build]", data.itinerary_build_meta);
        }
        if (data.planning_phase === "complete") {
          return;
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      }
    },
    [sendPlanning]
  );

  const handleChipClick = (chip: string) => handleSend(chip);

  const handleBuildClick = async () => {
    if (!tripIdNum) return;
    if (!user) {
      setPendingBuildAfterAuth(true);
      openAuthModal({ mode: "signup", destination: tripData?.title ?? "your trip" });
      return;
    }
    try {
      await claimTrip.mutateAsync();
      await postConfirm.mutateAsync();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build itinerary");
    }
  };


  if (tripLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (tripError || !tripIdNum || !tripData) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <TopNav />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-muted-foreground">Trip not found</p>
        </div>
      </div>
    );
  }

  if (tripData.planning_phase === "generating") {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isPlanningPhase(tripData.planning_phase)) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background">
      <TopNav />
      <div className="shrink-0 border-b border-border bg-card px-6 py-2 flex items-center justify-between w-full">
        <div>
          <p className="text-xs font-medium text-primary uppercase tracking-wider">Planning</p>
          <p className="text-sm text-muted-foreground">
            {phase === "confirming"
              ? "Review your trip — confirm when ready to build the itinerary."
              : "Answer a few questions — we will refine details before generating your itinerary."}
          </p>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 w-full overflow-hidden px-6">
        <div className="flex flex-1 min-h-0 min-w-0 flex-col border-r border-border">
          <ChatPanel
            messages={messages}
            trip={trip}
            onSend={handleSend}
            onTripUpdate={setTrip}
            onChipClick={handleChipClick}
            showChips={false}
            showTripSummaryEditor={false}
            sendDisabled={sendPlanning.isPending || postConfirm.isPending}
            isAwaitingResponse={sendPlanning.isPending || postConfirm.isPending}
            afterLastAssistantMessage={
              phase === "confirming" && ctx.confirmation_summary_sent ? (
                <button
                  type="button"
                  disabled={postConfirm.isPending || claimTrip.isPending || computeMissingSlots(ctx as Record<string, unknown>).length > 0}
                  onClick={handleBuildClick}
                  className="mt-2 w-full rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  {postConfirm.isPending || claimTrip.isPending ? "Building…" : "Build my trip"}
                </button>
              ) : undefined
            }
          />
        </div>

        <aside className="hidden md:flex w-[380px] shrink-0 flex-col min-h-0 overflow-y-auto border-l border-border bg-card/50 p-4 gap-4">
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Captured so far</h2>
            <ul className="text-sm space-y-2 text-foreground">
              {isSlotFilled("destinations", ctx) && (
                <li>
                  <span className="text-muted-foreground">Places: </span>
                  {(ctx.destinations as string[]).join(", ")}
                </li>
              )}
              {isSlotFilled("origin", ctx) && (
                <li>
                  <span className="text-muted-foreground">Departing from: </span>
                  {[ctx.origin, ctx.origin_iata].filter(Boolean).join(" · ")}
                </li>
              )}
              {isSlotFilled("start", ctx) && (
                <li>
                  <span className="text-muted-foreground">From: </span>
                  {formatWrittenDate(ctx.start)}
                </li>
              )}
              {isSlotFilled("end", ctx) && (
                <li>
                  <span className="text-muted-foreground">To: </span>
                  {formatWrittenDate(ctx.end)}
                </li>
              )}
              {isSlotFilled("num_people", ctx) && (
                <li>
                  <span className="text-muted-foreground">Travelers: </span>
                  {String(ctx.num_people)}
                </li>
              )}
              {isSlotFilled("budget", ctx) && (
                <li>
                  <span className="text-muted-foreground">Budget: </span>${Number(ctx.budget).toLocaleString()}
                </li>
              )}
              {STYLE_SLOTS.filter((s) => isSlotFilled(s, ctx)).map((s) => (
                <li key={s}>
                  <span className="text-muted-foreground">{SLOT_LABELS[s]}: </span>
                  {formatStyleValue(ctx[s])}
                </li>
              ))}
              {progressSlots.every((s) => !isSlotFilled(s, ctx)) && (
                <li className="text-muted-foreground text-xs">Nothing captured yet — say where you want to go.</li>
              )}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Progress</h2>
            {(() => {
              const pending = progressSlots.filter((s) => !isSlotFilled(s, ctx));
              return pending.length === 0 ? (
                <p className="text-xs text-muted-foreground">All details captured!</p>
              ) : (
                <ul className="space-y-2">
                  {pending.map((slot) => (
                    <li key={slot} className="flex items-center gap-2 text-sm">
                      <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">{SLOT_LABELS[slot] || slot}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>

        </aside>
      </div>
    </div>
  );
};

export default PlanningPage;
