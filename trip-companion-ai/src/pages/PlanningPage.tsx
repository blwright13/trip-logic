import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ChatPanel, { ChatMessage } from "@/components/ChatPanel";
import TopNav from "@/components/TopNav";
import {
  useTrip,
  useChatHistory,
  useSendPlanningMessage,
  usePostPlanningConfirm,
  usePostPlanningTasteSignals,
  usePatchPlanningContext,
} from "@/hooks/useTrip";
import { getPlanningTasteSuggestions, type TastePlaceSuggestion } from "@/services/api";
import { Loader2, Check, Circle, ThumbsDown, ThumbsUp } from "lucide-react";

const SLOT_LABELS: Record<string, string> = {
  destinations: "Destination",
  start: "Start date",
  end: "End date",
  num_people: "Travelers",
  budget: "Budget",
  origin: "Departing from",
  preferences: "Preferences",
};

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

const PlanningPage = () => {
  const navigate = useNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const tripIdNum = tripId ? parseInt(tripId, 10) : undefined;

  const { data: tripData, isLoading: tripLoading, error: tripError } = useTrip(tripIdNum);
  const { data: chatData } = useChatHistory(tripIdNum);
  const sendPlanning = useSendPlanningMessage(tripIdNum);
  const postConfirm = usePostPlanningConfirm(tripIdNum);
  const postTaste = usePostPlanningTasteSignals(tripIdNum);
  const patchContext = usePatchPlanningContext(tripIdNum);

  const [trip, setTrip] = useState({
    destination: "Loading...",
    startDate: "",
    endDate: "",
    budget: 0,
    travelers: 0,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [missingSlots, setMissingSlots] = useState<string[]>([]);
  const [tasteVotes, setTasteVotes] = useState<Record<string, "liked" | "disliked">>({});

  const [reviewDest, setReviewDest] = useState("");
  const [reviewStart, setReviewStart] = useState("");
  const [reviewEnd, setReviewEnd] = useState("");
  const [reviewOrigin, setReviewOrigin] = useState("");
  const [reviewTravelers, setReviewTravelers] = useState("");
  const [reviewBudget, setReviewBudget] = useState("");

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
    if (tripData?.planning_phase === "confirming") {
      const p = tripData.planning_context || {};
      setReviewDest(Array.isArray(p.destinations) ? (p.destinations as string[]).join(", ") : "");
      setReviewStart(String(p.start ?? ""));
      setReviewEnd(String(p.end ?? ""));
      setReviewOrigin(String(p.origin ?? ""));
      setReviewTravelers(p.num_people != null ? String(p.num_people) : "");
      setReviewBudget(p.budget != null ? String(p.budget) : "");
    }
  }, [tripData?.planning_phase, tripData?.planning_context]);

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

  const tasteIntroSent = Boolean(ctx.taste_intro_sent);
  const tasteStepActive =
    phase === "gathering" &&
    ctx.taste_calibration_status === "pending" &&
    tasteIntroSent;

  const { data: tasteData, isFetching: tasteLoading, isLoading: tasteQueryLoading } = useQuery({
    queryKey: [
      "tasteSuggestions",
      tripIdNum,
      ctx.taste_calibration_status,
      tasteIntroSent,
      String((ctx.destinations as string[] | undefined)?.join(",") ?? ""),
    ],
    queryFn: () => getPlanningTasteSuggestions(tripIdNum!),
    enabled: !!tripIdNum && tasteStepActive,
    staleTime: 0,
  });

  const allSlots = useMemo(
    () => ["destinations", "start", "end", "num_people", "budget", "origin"],
    []
  );

  const progressSlots = useMemo(() => {
    const pctx = tripData?.planning_context as Record<string, unknown> | undefined;
    if (pctx?.extra_context_prompt_sent) {
      return [...allSlots, "preferences"];
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

  const toggleTasteVote = (place: TastePlaceSuggestion, vote: "liked" | "disliked") => {
    const id = place.id;
    setTasteVotes((prev) => {
      const next = { ...prev };
      if (next[id] === vote) delete next[id];
      else next[id] = vote;
      return next;
    });
  };

  const submitTaste = async (skip: boolean) => {
    if (!tripIdNum) return;
    const suggestions = tasteData?.suggestions ?? [];
    const liked: TastePlaceSuggestion[] = [];
    const disliked: TastePlaceSuggestion[] = [];
    if (!skip) {
      for (const p of suggestions) {
        const v = tasteVotes[p.id];
        if (v === "liked") liked.push(p);
        if (v === "disliked") disliked.push(p);
      }
    }
    try {
      await postTaste.mutateAsync({ liked, disliked, skip });
    } catch {
      /* toast in hook */
    }
  };

  const saveReviewEdits = async () => {
    const p = (tripData?.planning_context || {}) as Record<string, unknown>;
    const destinations = reviewDest
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await patchContext.mutateAsync({
      destinations: destinations.length ? destinations : p.destinations,
      start: reviewStart || p.start,
      end: reviewEnd || p.end,
      origin: reviewOrigin || p.origin,
      num_people: reviewTravelers ? parseInt(reviewTravelers, 10) : p.num_people,
      budget: reviewBudget ? parseFloat(reviewBudget) : p.budget,
    });
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
            showTripSummaryEditor={false}
            sendDisabled={sendPlanning.isPending || postConfirm.isPending}
            isAwaitingResponse={sendPlanning.isPending || postConfirm.isPending}
          />
        </div>

        <aside className="hidden md:flex w-[380px] shrink-0 flex-col min-h-0 overflow-y-auto border-l border-border bg-card/50 p-4 gap-4">
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Captured so far</h2>
            <ul className="text-sm space-y-2 text-foreground">
              {ctx.destinations && Array.isArray(ctx.destinations) && (ctx.destinations as string[]).length > 0 && (
                <li>
                  <span className="text-muted-foreground">Places: </span>
                  {(ctx.destinations as string[]).join(", ")}
                </li>
              )}
              {(ctx.origin || ctx.origin_iata) && (
                <li>
                  <span className="text-muted-foreground">Departing from: </span>
                  {[ctx.origin, ctx.origin_iata].filter(Boolean).join(" · ")}
                </li>
              )}
              {ctx.start && (
                <li>
                  <span className="text-muted-foreground">From: </span>
                  {String(ctx.start)}
                </li>
              )}
              {ctx.end && (
                <li>
                  <span className="text-muted-foreground">To: </span>
                  {String(ctx.end)}
                </li>
              )}
              {ctx.num_people != null && (
                <li>
                  <span className="text-muted-foreground">Travelers: </span>
                  {String(ctx.num_people)}
                </li>
              )}
              {ctx.budget != null && (
                <li>
                  <span className="text-muted-foreground">Budget: </span>${Number(ctx.budget).toLocaleString()}
                </li>
              )}
              {!ctx.destinations &&
                !ctx.start &&
                !ctx.end &&
                ctx.num_people == null &&
                ctx.budget == null && (
                  <li className="text-muted-foreground text-xs">Nothing captured yet — say where you want to go.</li>
                )}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Progress</h2>
            <ul className="space-y-2">
              {progressSlots.map((slot) => {
                const done =
                  slot === "preferences"
                    ? Object.prototype.hasOwnProperty.call(ctx, "extra_context")
                    : !missingSlots.includes(slot);
                return (
                  <li key={slot} className="flex items-center gap-2 text-sm">
                    {done ? (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={done ? "text-foreground" : "text-muted-foreground"}>
                      {SLOT_LABELS[slot] || slot}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {tasteStepActive && (
            <div className="border-t border-border pt-4 space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Taste check</h2>
              {tasteData?.configured === false && (
                <p className="text-xs text-muted-foreground">
                  Live venue names need GOOGLE_PLACES_API_KEY. Below are style prompts you can rate the same way.
                </p>
              )}
              {(tasteLoading || tasteQueryLoading) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading suggestions…
                </div>
              )}
              {!tasteLoading && !tasteQueryLoading && tasteData?.configured && (tasteData?.suggestions?.length ?? 0) === 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">No suggestions returned — try Skip or check your Places API.</p>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(tasteData?.suggestions ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="rounded-md border border-border bg-background p-2 flex flex-col gap-1 text-xs"
                  >
                    <span className="font-medium text-foreground">{p.name ?? "Place"}</span>
                    {p.address && <span className="text-muted-foreground">{p.address}</span>}
                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => toggleTasteVote(p, "liked")}
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 border ${
                          tasteVotes[p.id] === "liked"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border"
                        }`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" /> Like
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleTasteVote(p, "disliked")}
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 border ${
                          tasteVotes[p.id] === "disliked"
                            ? "border-destructive bg-destructive/10 text-destructive"
                            : "border-border"
                        }`}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" /> Dislike
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={postTaste.isPending}
                  onClick={() => submitTaste(false)}
                  className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {postTaste.isPending ? "Saving…" : "Continue with my ratings"}
                </button>
                <button
                  type="button"
                  disabled={postTaste.isPending}
                  onClick={() => submitTaste(true)}
                  className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground"
                >
                  Skip taste quiz
                </button>
              </div>
            </div>
          )}

          {phase === "confirming" && (
            <div className="border-t border-border pt-4 space-y-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Review & edit</h2>
              <p className="text-xs text-muted-foreground">Adjust fields, save, then build your itinerary.</p>
              <label className="block text-xs space-y-1">
                <span className="text-muted-foreground">Destinations (comma-separated)</span>
                <input
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  value={reviewDest}
                  onChange={(e) => setReviewDest(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs space-y-1">
                  <span className="text-muted-foreground">Start</span>
                  <input
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    value={reviewStart}
                    onChange={(e) => setReviewStart(e.target.value)}
                  />
                </label>
                <label className="block text-xs space-y-1">
                  <span className="text-muted-foreground">End</span>
                  <input
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    value={reviewEnd}
                    onChange={(e) => setReviewEnd(e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-xs space-y-1">
                <span className="text-muted-foreground">Departing from</span>
                <input
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  value={reviewOrigin}
                  onChange={(e) => setReviewOrigin(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs space-y-1">
                  <span className="text-muted-foreground">Travelers</span>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    value={reviewTravelers}
                    onChange={(e) => setReviewTravelers(e.target.value)}
                  />
                </label>
                <label className="block text-xs space-y-1">
                  <span className="text-muted-foreground">Budget (USD)</span>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    value={reviewBudget}
                    onChange={(e) => setReviewBudget(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={patchContext.isPending}
                onClick={() => saveReviewEdits()}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              >
                {patchContext.isPending ? "Saving…" : "Save edits"}
              </button>
              <button
                type="button"
                disabled={postConfirm.isPending || computeMissingSlots(ctx as Record<string, unknown>).length > 0}
                onClick={() => tripIdNum && postConfirm.mutate()}
                className="w-full rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {postConfirm.isPending ? "Building…" : "Build itinerary"}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default PlanningPage;
