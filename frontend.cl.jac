"""TripLogic - Client-Side UI."""

import "./styles.css";

# Import pages
import from .pages.LandingPage { LandingPage }
import from .pages.PlannerPage { PlannerPage }
import from .pages.SummaryPage { SummaryPage }

def:pub app -> any {
    # Navigation state
    has currentPage: str = "landing",
        searchQuery: str = "";

    # Trip details state
    has tripDestination: str = "Tokyo, Japan",
        tripStartDate: str = "2026-04-10",
        tripEndDate: str = "2026-04-14",
        tripBudget: int = 3000,
        tripTravelers: int = 2;

    # Trip editing state
    has editingTrip: bool = False,
        draftDestination: str = "",
        draftStartDate: str = "",
        draftEndDate: str = "",
        draftBudget: int = 0,
        draftTravelers: int = 0;

    # Chat state
    has chatMessages: list = [
            {
                "id": "1",
                "role": "ai",
                "text": "Welcome! I've set up a 5-day Tokyo itinerary for you. I've included a mix of cultural experiences, amazing food spots, and iconic sightseeing. Feel free to ask me to adjust anything!",
                "chips": ["Add more food spots", "Find cheaper hotels", "Add a day trip"]
            },
            {
                "id": "2",
                "role": "user",
                "text": "This looks great! Can you add a visit to TeamLab Borderless?"
            },
            {
                "id": "3",
                "role": "ai",
                "text": "Done! I've added TeamLab Borderless on Day 2 in the afternoon. The tickets are 3,200 yen (~$22) per person. I've adjusted the schedule so you still have time for Shibuya in the evening.",
                "chips": ["Show me the updated Day 2", "What's the total cost now?"]
            }
        ],
        chatInput: str = "";

    # Plan state
    has activePlan: str = "A",
        planA: list = [
            {"day": 1, "date": "Apr 10", "activities": [
                {"id": "1a", "name": "Arrive at Narita Airport", "time": "10:00 AM", "cost": 0, "location": "Narita International Airport", "category": "flight"},
                {"id": "1b", "name": "Check in at Shinjuku Hotel", "time": "1:00 PM", "cost": 180, "location": "Shinjuku, Tokyo", "category": "hotel"},
                {"id": "1c", "name": "Ramen at Ichiran Shibuya", "time": "2:30 PM", "cost": 24, "location": "Shibuya, Tokyo", "category": "food"},
                {"id": "1d", "name": "Meiji Shrine", "time": "4:00 PM", "cost": 0, "location": "Harajuku, Tokyo", "category": "sightseeing"},
                {"id": "1e", "name": "Dinner at Omoide Yokocho", "time": "7:00 PM", "cost": 40, "location": "Shinjuku, Tokyo", "category": "food"}
            ]},
            {"day": 2, "date": "Apr 11", "activities": [
                {"id": "2a", "name": "Tsukiji Outer Market", "time": "8:00 AM", "cost": 30, "location": "Tsukiji, Tokyo", "category": "food"},
                {"id": "2b", "name": "Senso-ji Temple", "time": "10:30 AM", "cost": 0, "location": "Asakusa, Tokyo", "category": "sightseeing"},
                {"id": "2c", "name": "TeamLab Borderless", "time": "2:00 PM", "cost": 44, "location": "Azabudai Hills, Tokyo", "category": "entertainment"},
                {"id": "2d", "name": "Shibuya Crossing & Hachiko", "time": "5:30 PM", "cost": 0, "location": "Shibuya, Tokyo", "category": "sightseeing"},
                {"id": "2e", "name": "Yakitori at Toriki", "time": "7:30 PM", "cost": 35, "location": "Shibuya, Tokyo", "category": "food"}
            ]},
            {"day": 3, "date": "Apr 12", "activities": [
                {"id": "3a", "name": "Morning coffee at Blue Bottle", "time": "8:30 AM", "cost": 10, "location": "Roppongi, Tokyo", "category": "cafe"},
                {"id": "3b", "name": "Akihabara Electronics District", "time": "10:00 AM", "cost": 60, "location": "Akihabara, Tokyo", "category": "shopping"},
                {"id": "3c", "name": "Lunch at CoCo Ichibanya", "time": "12:30 PM", "cost": 18, "location": "Akihabara, Tokyo", "category": "food"},
                {"id": "3d", "name": "Imperial Palace Gardens", "time": "2:30 PM", "cost": 0, "location": "Chiyoda, Tokyo", "category": "sightseeing"},
                {"id": "3e", "name": "Tokyo Tower at sunset", "time": "5:00 PM", "cost": 24, "location": "Minato, Tokyo", "category": "sightseeing"}
            ]},
            {"day": 4, "date": "Apr 13", "activities": [
                {"id": "4a", "name": "Day trip to Kamakura", "time": "9:00 AM", "cost": 20, "location": "Kamakura Station", "category": "transport"},
                {"id": "4b", "name": "Great Buddha of Kamakura", "time": "10:30 AM", "cost": 6, "location": "Kotoku-in, Kamakura", "category": "sightseeing"},
                {"id": "4c", "name": "Seaside lunch at Bills", "time": "12:30 PM", "cost": 35, "location": "Shichirigahama, Kamakura", "category": "food"},
                {"id": "4d", "name": "Bamboo Temple (Hokoku-ji)", "time": "2:30 PM", "cost": 8, "location": "Kamakura", "category": "sightseeing"},
                {"id": "4e", "name": "Return to Tokyo", "time": "5:00 PM", "cost": 20, "location": "Kamakura Station", "category": "transport"}
            ]},
            {"day": 5, "date": "Apr 14", "activities": [
                {"id": "5a", "name": "Breakfast at hotel", "time": "8:00 AM", "cost": 0, "location": "Shinjuku, Tokyo", "category": "food"},
                {"id": "5b", "name": "Last-minute shopping at Don Quijote", "time": "9:30 AM", "cost": 50, "location": "Shinjuku, Tokyo", "category": "shopping"},
                {"id": "5c", "name": "Checkout & depart to airport", "time": "12:00 PM", "cost": 35, "location": "Narita International Airport", "category": "transport"}
            ]}
        ],
        planB: list = [
            {"day": 1, "date": "Apr 10", "activities": [
                {"id": "b1a", "name": "Arrive at Narita Airport", "time": "10:00 AM", "cost": 0, "location": "Narita International Airport", "category": "flight"},
                {"id": "b1b", "name": "Check in at Capsule Hotel", "time": "1:00 PM", "cost": 45, "location": "Shinjuku, Tokyo", "category": "hotel"},
                {"id": "b1c", "name": "Convenience store lunch", "time": "2:00 PM", "cost": 8, "location": "Shinjuku, Tokyo", "category": "food"},
                {"id": "b1d", "name": "Shinjuku Gyoen Park (free)", "time": "3:00 PM", "cost": 0, "location": "Shinjuku, Tokyo", "category": "sightseeing"},
                {"id": "b1e", "name": "Street food dinner at Kabukicho", "time": "7:00 PM", "cost": 15, "location": "Shinjuku, Tokyo", "category": "food"}
            ]},
            {"day": 2, "date": "Apr 11", "activities": [
                {"id": "b2a", "name": "Free walking tour Asakusa", "time": "9:00 AM", "cost": 0, "location": "Asakusa, Tokyo", "category": "sightseeing"},
                {"id": "b2b", "name": "Senso-ji Temple", "time": "10:30 AM", "cost": 0, "location": "Asakusa, Tokyo", "category": "sightseeing"},
                {"id": "b2c", "name": "Udon lunch at Marugame", "time": "12:30 PM", "cost": 8, "location": "Asakusa, Tokyo", "category": "food"},
                {"id": "b2d", "name": "Ueno Park & Museums", "time": "2:00 PM", "cost": 0, "location": "Ueno, Tokyo", "category": "sightseeing"},
                {"id": "b2e", "name": "Budget izakaya dinner", "time": "7:00 PM", "cost": 18, "location": "Ueno, Tokyo", "category": "food"}
            ]},
            {"day": 3, "date": "Apr 12", "activities": [
                {"id": "b3a", "name": "Meiji Shrine (free)", "time": "8:00 AM", "cost": 0, "location": "Harajuku, Tokyo", "category": "sightseeing"},
                {"id": "b3b", "name": "Harajuku window shopping", "time": "10:30 AM", "cost": 0, "location": "Harajuku, Tokyo", "category": "shopping"},
                {"id": "b3c", "name": "Crepe from Takeshita Street", "time": "12:00 PM", "cost": 5, "location": "Harajuku, Tokyo", "category": "food"},
                {"id": "b3d", "name": "Yoyogi Park picnic", "time": "1:30 PM", "cost": 0, "location": "Shibuya, Tokyo", "category": "sightseeing"},
                {"id": "b3e", "name": "Shibuya Crossing at night", "time": "7:00 PM", "cost": 0, "location": "Shibuya, Tokyo", "category": "sightseeing"}
            ]},
            {"day": 4, "date": "Apr 13", "activities": [
                {"id": "b4a", "name": "Tsukiji Outer Market breakfast", "time": "7:00 AM", "cost": 12, "location": "Tsukiji, Tokyo", "category": "food"},
                {"id": "b4b", "name": "Imperial Palace East Gardens", "time": "10:00 AM", "cost": 0, "location": "Chiyoda, Tokyo", "category": "sightseeing"},
                {"id": "b4c", "name": "Bento box lunch in park", "time": "12:30 PM", "cost": 6, "location": "Chiyoda, Tokyo", "category": "food"},
                {"id": "b4d", "name": "Akihabara walk-around", "time": "2:30 PM", "cost": 0, "location": "Akihabara, Tokyo", "category": "sightseeing"},
                {"id": "b4e", "name": "Gyudon chain dinner", "time": "6:30 PM", "cost": 7, "location": "Akihabara, Tokyo", "category": "food"}
            ]},
            {"day": 5, "date": "Apr 14", "activities": [
                {"id": "b5a", "name": "Hotel breakfast", "time": "8:00 AM", "cost": 0, "location": "Shinjuku, Tokyo", "category": "food"},
                {"id": "b5b", "name": "100-yen shop souvenirs", "time": "9:30 AM", "cost": 10, "location": "Shinjuku, Tokyo", "category": "shopping"},
                {"id": "b5c", "name": "Depart to airport", "time": "12:00 PM", "cost": 20, "location": "Narita International Airport", "category": "transport"}
            ]}
        ],
        planC: list = [
            {"day": 1, "date": "Apr 10", "activities": [
                {"id": "c1a", "name": "Arrive at Narita Airport", "time": "10:00 AM", "cost": 0, "location": "Narita International Airport", "category": "flight"},
                {"id": "c1b", "name": "Check in at Shinjuku Hotel", "time": "1:00 PM", "cost": 180, "location": "Shinjuku, Tokyo", "category": "hotel"},
                {"id": "c1c", "name": "Tsukemen at Fuunji", "time": "2:00 PM", "cost": 16, "location": "Shinjuku, Tokyo", "category": "food"},
                {"id": "c1d", "name": "Depachika food hall tour", "time": "4:00 PM", "cost": 30, "location": "Isetan, Shinjuku", "category": "food"},
                {"id": "c1e", "name": "Omakase sushi dinner", "time": "7:00 PM", "cost": 120, "location": "Shinjuku, Tokyo", "category": "food"}
            ]},
            {"day": 2, "date": "Apr 11", "activities": [
                {"id": "c2a", "name": "Tsukiji tuna breakfast", "time": "6:30 AM", "cost": 35, "location": "Tsukiji, Tokyo", "category": "food"},
                {"id": "c2b", "name": "Japanese cooking class", "time": "10:00 AM", "cost": 65, "location": "Asakusa, Tokyo", "category": "entertainment"},
                {"id": "c2c", "name": "Monjayaki lunch in Tsukishima", "time": "1:00 PM", "cost": 25, "location": "Tsukishima, Tokyo", "category": "food"},
                {"id": "c2d", "name": "Matcha tasting at Ippodo", "time": "3:30 PM", "cost": 15, "location": "Marunouchi, Tokyo", "category": "cafe"},
                {"id": "c2e", "name": "Yakitori alley dinner", "time": "7:00 PM", "cost": 40, "location": "Yurakucho, Tokyo", "category": "food"}
            ]},
            {"day": 3, "date": "Apr 12", "activities": [
                {"id": "c3a", "name": "Onigiri breakfast at Bongo", "time": "8:00 AM", "cost": 8, "location": "Otsuka, Tokyo", "category": "food"},
                {"id": "c3b", "name": "Ramen street crawl (3 bowls)", "time": "11:00 AM", "cost": 30, "location": "Shinatatsu, Tokyo", "category": "food"},
                {"id": "c3c", "name": "Sake tasting at Kurand", "time": "2:00 PM", "cost": 30, "location": "Ikebukuro, Tokyo", "category": "entertainment"},
                {"id": "c3d", "name": "Wagyu beef dinner", "time": "6:30 PM", "cost": 85, "location": "Roppongi, Tokyo", "category": "food"}
            ]},
            {"day": 4, "date": "Apr 13", "activities": [
                {"id": "c4a", "name": "Japanese breakfast at Asa", "time": "8:00 AM", "cost": 18, "location": "Ginza, Tokyo", "category": "food"},
                {"id": "c4b", "name": "Toyosu Market behind-the-scenes", "time": "10:00 AM", "cost": 0, "location": "Toyosu, Tokyo", "category": "sightseeing"},
                {"id": "c4c", "name": "Tempura lunch at Tsunahachi", "time": "12:30 PM", "cost": 28, "location": "Shinjuku, Tokyo", "category": "food"},
                {"id": "c4d", "name": "Shimokitazawa cafe hopping", "time": "3:00 PM", "cost": 20, "location": "Shimokitazawa, Tokyo", "category": "cafe"},
                {"id": "c4e", "name": "Izakaya crawl in Golden Gai", "time": "7:00 PM", "cost": 50, "location": "Shinjuku, Tokyo", "category": "food"}
            ]},
            {"day": 5, "date": "Apr 14", "activities": [
                {"id": "c5a", "name": "Fluffy pancakes at Gram", "time": "8:30 AM", "cost": 14, "location": "Harajuku, Tokyo", "category": "food"},
                {"id": "c5b", "name": "Souvenir snacks at Don Quijote", "time": "10:00 AM", "cost": 30, "location": "Shinjuku, Tokyo", "category": "shopping"},
                {"id": "c5c", "name": "Depart to airport", "time": "12:00 PM", "cost": 35, "location": "Narita International Airport", "category": "transport"}
            ]}
        ],
        selectedDay: int = 1;

    # Static data
    quickTags = ["Weekend getaway", "Family vacation", "Solo backpacking", "Honeymoon"];

    destinations = [
        {"id": 1, "title": "Tokyo, Japan", "subtitle": "5 days - Culture & Food", "icon": "building"},
        {"id": 2, "title": "Bali, Indonesia", "subtitle": "7 days - Beach & Wellness", "icon": "palm"},
        {"id": 3, "title": "Swiss Alps", "subtitle": "4 days - Adventure", "icon": "mountain"},
        {"id": 4, "title": "Paris, France", "subtitle": "3 days - Romance & Art", "icon": "plane"}
    ];

    planDescriptions = {"A": "Balanced mix", "B": "Budget-friendly", "C": "Foodie focus"};

    categoryLabels = {
        "food": "Food & Dining", "sightseeing": "Sightseeing", "transport": "Transport",
        "hotel": "Accommodation", "shopping": "Shopping", "entertainment": "Entertainment",
        "flight": "Flights", "cafe": "Cafes"
    };

    # Method declarations (implementations in frontend.impl.jac)
    def navigateTo(page: str) -> None;
    def handleSearch(e: any) -> None;
    def sendMessage(text: str) -> None;
    def handleChatSubmit(e: any) -> None;
    def getCurrentDays -> list;
    def getTotalCost -> float;
    def getCurrentDayActivities -> list;
    def startEditTrip -> None;
    def saveTrip -> None;
    def getCostByCategory -> list;
    def getUniqueLocations -> list;
    def selectPlan(plan: str) -> None;
    def selectDay(day: int) -> None;

    # Landing page
    if currentPage == "landing" {
        return
            <LandingPage
                searchQuery={searchQuery}
                quickTags={quickTags}
                destinations={destinations}
                onSearchChange={lambda e: any -> None { searchQuery = e.target.value; }}
                onSearchSubmit={handleSearch}
                onTagClick={lambda tag: str -> None { searchQuery = tag; navigateTo("planner"); }}
                onDestinationClick={lambda -> None { navigateTo("planner"); }}
                onLogoClick={lambda -> None { navigateTo("landing"); }}
                onNewTrip={lambda -> None { navigateTo("planner"); }}
            />;
    }

    # Planner page
    if currentPage == "planner" {
        totalCost = getTotalCost();
        budgetPercent = (totalCost / tripBudget) * 100;
        if budgetPercent > 100 { budgetPercent = 100; }
        overBudget = totalCost > tripBudget;
        currentActivities = getCurrentDayActivities();
        days = getCurrentDays();

        return
            <PlannerPage
                tripDestination={tripDestination}
                tripStartDate={tripStartDate}
                tripEndDate={tripEndDate}
                tripBudget={tripBudget}
                tripTravelers={tripTravelers}
                editingTrip={editingTrip}
                draftDestination={draftDestination}
                draftStartDate={draftStartDate}
                draftEndDate={draftEndDate}
                draftBudget={draftBudget}
                draftTravelers={draftTravelers}
                chatMessages={chatMessages}
                chatInput={chatInput}
                activePlan={activePlan}
                planDescriptions={planDescriptions}
                days={days}
                selectedDay={selectedDay}
                currentActivities={currentActivities}
                totalCost={totalCost}
                budgetPercent={budgetPercent}
                overBudget={overBudget}
                onLogoClick={lambda -> None { navigateTo("landing"); }}
                onSummaryClick={lambda -> None { navigateTo("summary"); }}
                onEditTrip={startEditTrip}
                onSaveTrip={saveTrip}
                onDestinationChange={lambda e: any -> None { draftDestination = e.target.value; }}
                onStartDateChange={lambda e: any -> None { draftStartDate = e.target.value; }}
                onEndDateChange={lambda e: any -> None { draftEndDate = e.target.value; }}
                onBudgetChange={lambda e: any -> None { draftBudget = parseInt(e.target.value); }}
                onTravelersChange={lambda e: any -> None { draftTravelers = parseInt(e.target.value); }}
                onChatInputChange={lambda e: any -> None { chatInput = e.target.value; }}
                onChatSubmit={handleChatSubmit}
                onChipClick={sendMessage}
                onPlanSelect={selectPlan}
                onDaySelect={selectDay}
            />;
    }

    # Summary page
    if currentPage == "summary" {
        totalCost = getTotalCost();
        days = getCurrentDays();
        costByCategory = getCostByCategory();
        locations = getUniqueLocations();

        return
            <SummaryPage
                tripDestination={tripDestination}
                tripStartDate={tripStartDate}
                tripEndDate={tripEndDate}
                tripTravelers={tripTravelers}
                tripBudget={tripBudget}
                days={days}
                totalCost={totalCost}
                costByCategory={costByCategory}
                locations={locations}
                categoryLabels={categoryLabels}
                onLogoClick={lambda -> None { navigateTo("landing"); }}
                onBackClick={lambda -> None { navigateTo("planner"); }}
            />;
    }

    # 404 page
    return
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center">
                <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
                <p className="text-xl text-muted-foreground mb-8">Page not found</p>
                <button onClick={lambda -> None { navigateTo("landing"); }} className="btn btn-primary">
                    Go Home
                </button>
            </div>
        </div>;
}
