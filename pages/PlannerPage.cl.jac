"""Main planning interface page."""

import from "lucide-react" { FileText }

import from ..components.Header { Header }
import from ..components.TripSummary { TripSummary }
import from ..components.ChatMessage { ChatMessage }
import from ..components.ChatInput { ChatInput }
import from ..components.PlanToggle { PlanToggle }
import from ..components.DayTab { DayTab }
import from ..components.ActivityItem { ActivityItem }
import from ..components.BudgetTracker { BudgetTracker }

def:pub PlannerPage(
    # Trip state
    tripDestination: str,
    tripStartDate: str,
    tripEndDate: str,
    tripBudget: int,
    tripTravelers: int,
    editingTrip: bool,
    draftDestination: str,
    draftStartDate: str,
    draftEndDate: str,
    draftBudget: int,
    draftTravelers: int,
    # Chat state
    chatMessages: list,
    chatInput: str,
    # Plan state
    activePlan: str,
    planDescriptions: dict,
    days: list,
    selectedDay: int,
    currentActivities: list,
    # Budget state
    totalCost: float,
    budgetPercent: float,
    overBudget: bool,
    # Handlers
    onLogoClick: any,
    onSummaryClick: any,
    onEditTrip: any,
    onSaveTrip: any,
    onDestinationChange: any,
    onStartDateChange: any,
    onEndDateChange: any,
    onBudgetChange: any,
    onTravelersChange: any,
    onChatInputChange: any,
    onChatSubmit: any,
    onChipClick: any,
    onPlanSelect: any,
    onDaySelect: any
) -> any {
    return
        <div className="flex flex-col h-screen w-full overflow-hidden">
            <Header
                onLogoClick={onLogoClick}
                showNewTrip={False}
                onNewTrip={lambda -> None {}}
            />

            <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="md:w-[420px] shrink-0 border-r border-border flex flex-col">
                    <TripSummary
                        editing={editingTrip}
                        tripDestination={tripDestination}
                        tripStartDate={tripStartDate}
                        tripEndDate={tripEndDate}
                        tripBudget={tripBudget}
                        tripTravelers={tripTravelers}
                        draftDestination={draftDestination}
                        draftStartDate={draftStartDate}
                        draftEndDate={draftEndDate}
                        draftBudget={draftBudget}
                        draftTravelers={draftTravelers}
                        onEdit={onEditTrip}
                        onSave={onSaveTrip}
                        onDestinationChange={onDestinationChange}
                        onStartDateChange={onStartDateChange}
                        onEndDateChange={onEndDateChange}
                        onBudgetChange={onBudgetChange}
                        onTravelersChange={onTravelersChange}
                    />

                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-chat">
                        {[
                            <ChatMessage
                                key={msg.id}
                                msg={msg}
                                onChipClick={onChipClick}
                            />
                            for msg in chatMessages
                        ]}
                    </div>

                    <ChatInput
                        value={chatInput}
                        onChange={onChatInputChange}
                        onSubmit={onChatSubmit}
                    />
                </div>

                <div className="flex-1 min-w-0 flex flex-col bg-background hidden md:flex">
                    <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-card">
                        <button onClick={lambda -> None { onSummaryClick(); }} className="btn btn-outline btn-sm flex items-center gap-1.5">
                            {<FileText size={14} />}
                            <span>View Summary</span>
                        </button>
                    </div>

                    <div className="px-4 pt-4 pb-2 border-b border-border">
                        <PlanToggle
                            activePlan={activePlan}
                            planDescriptions={planDescriptions}
                            onPlanSelect={onPlanSelect}
                        />
                    </div>

                    <div className="px-4 pt-3 pb-2 border-b border-border">
                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Itinerary</h2>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {[
                                <DayTab
                                    key={day.day}
                                    day={day}
                                    isSelected={selectedDay == day.day}
                                    onSelect={onDaySelect}
                                />
                                for day in days
                            ]}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4">
                        {[
                            <ActivityItem
                                key={activity.id}
                                activity={activity}
                            />
                            for activity in currentActivities
                        ]}
                        {(
                            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                                No activities planned yet
                            </div>
                        ) if currentActivities.length == 0 else None}
                    </div>

                    <BudgetTracker
                        totalCost={totalCost}
                        budget={tripBudget}
                        overBudget={overBudget}
                        budgetPercent={budgetPercent}
                    />
                </div>
            </div>
        </div>;
}
