"""Implementations for the TripLogic frontend component."""

impl app.navigateTo(page: str) -> None {
    currentPage = page;
}

impl app.handleSearch(e: any) -> None {
    e.preventDefault();
    if searchQuery.trim() {
        currentPage = "planner";
    }
}

impl app.sendMessage(text: str) -> None {
    userMsg = {"id": Math.random().toString(), "role": "user", "text": text};
    chatMessages = chatMessages + [userMsg];
    aiMsg = {
        "id": Math.random().toString(),
        "role": "ai",
        "text": "That's a great idea! I'll look into that and update your itinerary. Is there anything specific you'd like me to prioritize?",
        "chips": ["Keep it budget-friendly", "Prioritize food", "More free activities"]
    };
    chatMessages = chatMessages + [aiMsg];
    chatInput = "";
}

impl app.handleChatSubmit(e: any) -> None {
    e.preventDefault();
    if chatInput.trim() {
        sendMessage(chatInput);
    }
}

impl app.getCurrentDays -> list {
    if activePlan == "A" { return planA; }
    if activePlan == "B" { return planB; }
    return planC;
}

impl app.getTotalCost -> float {
    total = 0.0;
    days = getCurrentDays();
    for day in days {
        for activity in day.activities {
            total = total + activity.cost;
        }
    }
    return total;
}

impl app.getCurrentDayActivities -> list {
    days = getCurrentDays();
    for day in days {
        if day.day == selectedDay {
            return day.activities;
        }
    }
    return [];
}

impl app.startEditTrip -> None {
    draftDestination = tripDestination;
    draftStartDate = tripStartDate;
    draftEndDate = tripEndDate;
    draftBudget = tripBudget;
    draftTravelers = tripTravelers;
    editingTrip = True;
}

impl app.saveTrip -> None {
    tripDestination = draftDestination;
    tripStartDate = draftStartDate;
    tripEndDate = draftEndDate;
    tripBudget = draftBudget;
    tripTravelers = draftTravelers;
    editingTrip = False;
}

impl app.getCostByCategory -> list {
    days = getCurrentDays();
    result = [];
    for day in days {
        for a in day.activities {
            cat = a.category;
            found = False;
            for r in result {
                if r.category == cat {
                    found = True;
                }
            }
            if found {
                newResult = [];
                for r in result {
                    if r.category == cat {
                        newResult = newResult + [{"category": cat, "cost": r.cost + a.cost}];
                    } else {
                        newResult = newResult + [r];
                    }
                }
                result = newResult;
            } else {
                result = result + [{"category": cat, "cost": a.cost}];
            }
        }
    }
    return result;
}

impl app.getUniqueLocations -> list {
    days = getCurrentDays();
    locs = [];
    for day in days {
        for a in day.activities {
            found = False;
            for loc in locs {
                if loc == a.location {
                    found = True;
                }
            }
            if not found {
                locs = locs + [a.location];
            }
        }
    }
    return locs;
}

impl app.selectPlan(plan: str) -> None {
    activePlan = plan;
    selectedDay = 1;
}

impl app.selectDay(day: int) -> None {
    selectedDay = day;
}
