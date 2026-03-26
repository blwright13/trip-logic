import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ChatPanel, { ChatMessage } from "@/components/ChatPanel";
import ItineraryPanel, { Activity } from "@/components/ItineraryPanel";
import TopNav from "@/components/TopNav";
import { initialTrip, initialMessages, planDays, PlanKey } from "@/data/mockTrip";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

const Planner = () => {
  const navigate = useNavigate();
  const [trip, setTrip] = useState(initialTrip);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [activePlan, setActivePlan] = useState<PlanKey>("A");
  const [daysByPlan, setDaysByPlan] = useState(() => ({
    A: planDays.A.map((d) => ({ ...d, activities: [...d.activities] })),
    B: planDays.B.map((d) => ({ ...d, activities: [...d.activities] })),
    C: planDays.C.map((d) => ({ ...d, activities: [...d.activities] })),
  }));
  const [selectedDay, setSelectedDay] = useState(1);

  const days = daysByPlan[activePlan];

  const handleSend = (text: string) => {
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", text };
    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "ai",
      text: "That's a great idea! I'll look into that and update your itinerary. Is there anything specific you'd like me to prioritize?",
      chips: ["Keep it budget-friendly", "Prioritize food", "More free activities"],
    };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
  };

  const handleChipClick = (chip: string) => handleSend(chip);

  const handlePlanChange = (plan: PlanKey) => {
    setActivePlan(plan);
    setSelectedDay(1);
  };

  const handleReorder = (dayIndex: number, activities: Activity[]) => {
    setDaysByPlan((prev) => {
      const updated = { ...prev };
      const newDays = [...updated[activePlan]];
      newDays[dayIndex] = { ...newDays[dayIndex], activities };
      updated[activePlan] = newDays;
      return updated;
    });
  };

  const handleRemoveActivity = (dayIndex: number, activityId: string) => {
    setDaysByPlan((prev) => {
      const updated = { ...prev };
      const newDays = [...updated[activePlan]];
      newDays[dayIndex] = {
        ...newDays[dayIndex],
        activities: newDays[dayIndex].activities.filter((a) => a.id !== activityId),
      };
      updated[activePlan] = newDays;
      return updated;
    });
    toast.success("Activity removed");
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      <TopNav />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Chat Panel */}
        <div className="w-full md:w-[420px] lg:w-[460px] shrink-0 border-r border-border flex flex-col">
          <ChatPanel
            messages={messages}
            trip={trip}
            onSend={handleSend}
            onTripUpdate={setTrip}
            onChipClick={handleChipClick}
          />
        </div>

        {/* Itinerary Panel */}
        <div className="hidden md:flex flex-1 min-w-0 flex-col">
          <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-card">
            <Button variant="outline" size="sm" onClick={() => navigate("/summary")} className="gap-1.5">
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
              activePlan={activePlan}
              onPlanChange={handlePlanChange}
              onReorder={handleReorder}
              onRemoveActivity={handleRemoveActivity}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Planner;
