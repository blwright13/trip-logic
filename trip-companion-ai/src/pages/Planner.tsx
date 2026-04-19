import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatPanel, { ChatMessage } from "@/components/ChatPanel";
import ItineraryPanel, { Activity, DayPlan } from "@/components/ItineraryPanel";
import TopNav from "@/components/TopNav";
import AlternativesModal from "@/components/AlternativesModal";
import {
  useTrip,
  useChatHistory,
  useSendMessage,
  useItinerary,
  useDeleteActivity,
  useReorderActivities,
  useGetAlternatives,
  useUpdateActivity,
  useApplySuggestion,
} from "@/hooks/useTrip";
import type { ApplySuggestionRequest } from "@/services/api";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import type { AlternativeActivity } from "@/services/api";

const Planner = () => {
  const navigate = useNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const tripIdNum = tripId ? parseInt(tripId, 10) : undefined;

  // Fetch trip, chat, and itinerary data from API
  const { data: tripData, isLoading: tripLoading, error: tripError } = useTrip(tripIdNum);
  const { data: chatData } = useChatHistory(tripIdNum);
  const { data: itineraryData, isLoading: itineraryLoading } = useItinerary(tripIdNum);
  const sendMessageMutation = useSendMessage(tripIdNum!);
  const deleteActivityMutation = useDeleteActivity(tripIdNum!);
  const reorderActivitiesMutation = useReorderActivities(tripIdNum!);
  const getAlternativesMutation = useGetAlternatives(tripIdNum!);
  const updateActivityMutation = useUpdateActivity(tripIdNum!);
  const applySuggestionMutation = useApplySuggestion(tripIdNum!);

  // Local state derived from API data
  const [trip, setTrip] = useState({
    destination: "Loading...",
    startDate: "",
    endDate: "",
    budget: 0,
    travelers: 0,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedDay, setSelectedDay] = useState(1);

  // Alternatives modal state
  const [alternativesModalOpen, setAlternativesModalOpen] = useState(false);
  const [alternativesLoading, setAlternativesLoading] = useState<string | null>(null);
  const [currentAlternatives, setCurrentAlternatives] = useState<AlternativeActivity[]>([]);
  const [selectedActivityForAlternatives, setSelectedActivityForAlternatives] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Transform API itinerary data to component format
  const days: DayPlan[] = useMemo(() => {
    if (!itineraryData) return [];
    return itineraryData.map((day) => ({
      day: day.day,
      date: day.date,
      activities: day.activities.map((a) => ({
        id: String(a.id),
        name: a.name,
        time: a.time,
        cost: a.cost,
        location: a.location || "",
        category: a.category,
        info_url: a.info_url ?? undefined,
      })),
    }));
  }, [itineraryData]);

  // Update trip info when data loads
  useEffect(() => {
    if (tripData) {
      setTrip({
        destination: tripData.title,
        startDate: tripData.start,
        endDate: tripData.end,
        budget: tripData.budget,
        travelers: tripData.num_people,
      });
    }
  }, [tripData]);

  // Update messages when chat history loads
  useEffect(() => {
    if (chatData) {
      const formattedMessages: ChatMessage[] = chatData.map((msg) => ({
        id: msg.id.toString(),
        role: msg.role === "assistant" ? "ai" : "user",
        text: msg.content,
        chips: msg.chips || undefined,
        flightOptions: msg.flight_options || undefined,
        cards: msg.cards || undefined,
      }));
      setMessages(formattedMessages);
    }
  }, [chatData]);

  // Reset selected day when days change
  useEffect(() => {
    if (days.length > 0 && !days.find((d) => d.day === selectedDay)) {
      setSelectedDay(days[0]?.day || 1);
    }
  }, [days, selectedDay]);

  useEffect(() => {
    if (tripData?.planning_phase === "gathering" || tripData?.planning_phase === "confirming") {
      navigate(`/planning/${tripId}`, { replace: true });
    }
  }, [tripData, tripId, navigate]);

  const handleSend = async (text: string) => {
    // Optimistically add user message
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await sendMessageMutation.mutateAsync(text);
      // Add AI response
      const aiMsg: ChatMessage = {
        id: response.message.id.toString(),
        role: "ai",
        text: response.message.content,
        chips: response.message.chips || undefined,
        flightOptions: response.message.flight_options || undefined,
        cards: response.message.cards || undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      // Error is handled by the mutation's onError
    }
  };

  const handleChipClick = (chip: string) => handleSend(chip);

  const handleApplySuggestion = (payload: ApplySuggestionRequest) => {
    applySuggestionMutation.mutate(payload);
  };

  const handleReorder = (_dayIndex: number, activities: Activity[]) => {
    // Extract activity IDs in new order and send to backend
    const activityIds = activities.map((a) => parseInt(a.id, 10));
    reorderActivitiesMutation.mutate(activityIds);
  };

  const handleRemoveActivity = (_dayIndex: number, activityId: string) => {
    deleteActivityMutation.mutate(parseInt(activityId, 10));
  };

  const handleShowAlternatives = async (activityId: string) => {
    // Find the activity name for display
    const activity = days.flatMap((d) => d.activities).find((a) => a.id === activityId);
    if (!activity) return;

    setSelectedActivityForAlternatives({ id: activityId, name: activity.name });
    setAlternativesLoading(activityId);
    setAlternativesModalOpen(true);
    setCurrentAlternatives([]);

    try {
      const result = await getAlternativesMutation.mutateAsync(parseInt(activityId, 10));
      setCurrentAlternatives(result.alternatives);
    } catch {
      // Error handled by mutation
    } finally {
      setAlternativesLoading(null);
    }
  };

  const handleSelectAlternative = (alternative: AlternativeActivity) => {
    if (!selectedActivityForAlternatives) return;

    // Update the activity with the selected alternative
    updateActivityMutation.mutate({
      activityId: parseInt(selectedActivityForAlternatives.id, 10),
      data: {
        title: alternative.title,
        category: alternative.category,
        cost: alternative.cost,
        location: alternative.location,
      },
    });

    setAlternativesModalOpen(false);
    setSelectedActivityForAlternatives(null);
    setCurrentAlternatives([]);
  };

  // Loading state
  if (tripLoading || itineraryLoading) {
    return (
      <div className="flex flex-col h-screen w-full overflow-hidden">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading your trip...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (tripError || !tripIdNum) {
    return (
      <div className="flex flex-col h-screen w-full overflow-hidden">
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
    <div className="flex flex-col h-screen w-full overflow-hidden">
      <TopNav />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Chat Panel */}
        <div className="w-full md:w-[420px] lg:w-[460px] shrink-0 border-r border-border flex min-h-0 flex-col">
          <ChatPanel
            messages={messages}
            trip={trip}
            onSend={handleSend}
            onTripUpdate={setTrip}
            onChipClick={handleChipClick}
            onApplySuggestion={handleApplySuggestion}
            showChips={false}
            sendDisabled={sendMessageMutation.isPending}
            isAwaitingResponse={sendMessageMutation.isPending}
          />
        </div>

        {/* Itinerary Panel */}
        <div className="hidden md:flex flex-1 min-w-0 flex-col">
          <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-card">
            <Button variant="outline" size="sm" onClick={() => navigate(`/summary/${tripId}`)} className="gap-1.5">
              <FileText size={14} />
              View Summary
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <ItineraryPanel
              days={days}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              totalBudget={trip.budget}
              onReorder={handleReorder}
              onRemoveActivity={handleRemoveActivity}
              onShowAlternatives={handleShowAlternatives}
              alternativesLoading={alternativesLoading}
            />
          </div>
        </div>
      </div>

      {/* Alternatives Modal */}
      <AlternativesModal
        open={alternativesModalOpen}
        onClose={() => {
          setAlternativesModalOpen(false);
          setSelectedActivityForAlternatives(null);
          setCurrentAlternatives([]);
        }}
        alternatives={currentAlternatives}
        onSelect={handleSelectAlternative}
        loading={!!alternativesLoading}
        currentActivityName={selectedActivityForAlternatives?.name}
      />
    </div>
  );
};

export default Planner;
