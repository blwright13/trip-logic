"""TripLogic - Client-Side UI (Matching Lovable Design)."""

import "./styles.css";
import from "lucide-react" {
    Compass, Plus, Search, ArrowRight, ArrowLeft, Send, FileText, Download,
    Pencil, Check, MapPin, Users, Calendar, DollarSign, Map,
    Building, Palmtree as TreePalm, Mountain, Plane,
    Utensils, Camera, Bed, ShoppingBag, Music, Coffee
}

def:pub app -> any {
    has currentPage: str = "landing",
        searchQuery: str = "",
        tripDestination: str = "Tokyo, Japan",
        tripStartDate: str = "2026-04-10",
        tripEndDate: str = "2026-04-14",
        tripBudget: int = 3000,
        tripTravelers: int = 2,
        editingTrip: bool = False,
        draftDestination: str = "",
        draftStartDate: str = "",
        draftEndDate: str = "",
        draftBudget: int = 0,
        draftTravelers: int = 0,
        chatMessages: list = [
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
        chatInput: str = "",
        activePlan: str = "A",
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
        selectedDay: int = 1,
        dragIdx: int = -1,
        overIdx: int = -1;

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

    def navigateTo(page: str) -> None {
        currentPage = page;
    }

    def handleSearch(e: any) -> None {
        e.preventDefault();
        if searchQuery.trim() {
            currentPage = "planner";
        }
    }

    def sendMessage(text: str) -> None {
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

    def handleChatSubmit(e: any) -> None {
        e.preventDefault();
        if chatInput.trim() {
            sendMessage(chatInput);
        }
    }

    def getCurrentDays -> list {
        if activePlan == "A" { return planA; }
        if activePlan == "B" { return planB; }
        return planC;
    }

    def getTotalCost -> float {
        total = 0.0;
        days = getCurrentDays();
        for day in days {
            for activity in day.activities {
                total = total + activity.cost;
            }
        }
        return total;
    }

    def getCurrentDayActivities -> list {
        days = getCurrentDays();
        for day in days {
            if day.day == selectedDay {
                return day.activities;
            }
        }
        return [];
    }

    def startEditTrip -> None {
        draftDestination = tripDestination;
        draftStartDate = tripStartDate;
        draftEndDate = tripEndDate;
        draftBudget = tripBudget;
        draftTravelers = tripTravelers;
        editingTrip = True;
    }

    def saveTrip -> None {
        tripDestination = draftDestination;
        tripStartDate = draftStartDate;
        tripEndDate = draftEndDate;
        tripBudget = draftBudget;
        tripTravelers = draftTravelers;
        editingTrip = False;
    }

    def getCostByCategory -> list {
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

    def getUniqueLocations -> list {
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

    def getActivityIconClass(cat: str) -> str {
        return "activity-icon activity-icon-" + cat;
    }

    def getActivityIcon(cat: str) -> any {
        if cat == "food" { return <Utensils size={16} />; }
        if cat == "sightseeing" { return <Camera size={16} />; }
        if cat == "transport" { return <Map size={16} />; }
        if cat == "hotel" { return <Bed size={16} />; }
        if cat == "shopping" { return <ShoppingBag size={16} />; }
        if cat == "entertainment" { return <Music size={16} />; }
        if cat == "flight" { return <Plane size={16} />; }
        if cat == "cafe" { return <Coffee size={16} />; }
        return <MapPin size={16} />;
    }

    def getDestinationIcon(iconType: str) -> any {
        if iconType == "building" { return <Building size={22} />; }
        if iconType == "palm" { return <TreePalm size={22} />; }
        if iconType == "mountain" { return <Mountain size={22} />; }
        return <Plane size={22} />;
    }

    if currentPage == "landing" {
        return
            <div className="flex flex-col min-h-screen bg-background">
                <header className="top-nav">
                    <button onClick={lambda -> None { navigateTo("landing"); }} className="logo">
                        <div className="logo-icon">
                            {<Compass size={18} />}
                        </div>
                        <span className="logo-text">TripLogic</span>
                    </button>
                    <div className="flex items-center gap-3">
                        <button onClick={lambda -> None { navigateTo("planner"); }} className="btn btn-primary btn-sm flex items-center gap-1.5">
                            {<Plus size={14} />}
                            <span>New Trip</span>
                        </button>
                        <div className="avatar h-8 w-8">JD</div>
                    </div>
                </header>

                <main className="flex-1 flex flex-col items-center justify-center px-4">
                    <div className="max-w-2xl w-full text-center mt-8">
                        <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-tight mb-3">
                            Plan your perfect trip
                        </h1>
                        <p className="text-muted-foreground text-lg mb-8">
                            AI-powered itineraries tailored to your style, budget, and timeline.
                        </p>

                        <form onSubmit={handleSearch} className="search-box max-w-xl mx-auto">
                            <span className="search-icon">{<Search size={20} />}</span>
                            <input
                                value={searchQuery}
                                onChange={lambda e: any -> None { searchQuery = e.target.value; }}
                                placeholder="Where do you want to go?"
                            />
                            <button type="submit" className="btn btn-primary btn-sm flex items-center gap-1.5">
                                <span>Plan Trip</span>
                                {<ArrowRight size={14} />}
                            </button>
                        </form>

                        <div className="flex flex-wrap justify-center gap-2 mt-5">
                            {[
                                <button
                                    key={tag}
                                    onClick={lambda -> None { searchQuery = tag; navigateTo("planner"); }}
                                    className="chip"
                                >
                                    {tag}
                                </button>
                                for tag in quickTags
                            ]}
                        </div>
                    </div>

                    <section className="max-w-3xl w-full mt-16 mb-12">
                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 text-center">
                            Popular Destinations
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                <button
                                    key={dest.id}
                                    onClick={lambda -> None { navigateTo("planner"); }}
                                    className="destination-card"
                                >
                                    <div className="destination-icon">
                                        {getDestinationIcon(dest.icon)}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm text-foreground">{dest.title}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{dest.subtitle}</p>
                                    </div>
                                </button>
                                for dest in destinations
                            ]}
                        </div>
                    </section>
                </main>
            </div>;
    }

    if currentPage == "planner" {
        totalCost = getTotalCost();
        budgetPercent = (totalCost / tripBudget) * 100;
        if budgetPercent > 100 { budgetPercent = 100; }
        overBudget = totalCost > tripBudget;
        currentActivities = getCurrentDayActivities();
        days = getCurrentDays();

        return
            <div className="flex flex-col h-screen w-full overflow-hidden">
                <header className="top-nav">
                    <button onClick={lambda -> None { navigateTo("landing"); }} className="logo">
                        <div className="logo-icon">
                            {<Compass size={18} />}
                        </div>
                        <span className="logo-text">TripLogic</span>
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="avatar h-8 w-8">JD</div>
                    </div>
                </header>

                <div className="flex flex-1 min-h-0 overflow-hidden">
                    <div className="md:w-[420px] shrink-0 border-r border-border flex flex-col">
                        {(
                            <div className="trip-summary space-y-3">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Trip Details</h2>
                                    <button onClick={lambda -> None { saveTrip(); }} className="text-primary transition-colors">
                                        {<Check size={18} />}
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        className="col-span-2 trip-edit-input"
                                        value={draftDestination}
                                        onChange={lambda e: any -> None { draftDestination = e.target.value; }}
                                        placeholder="Destination"
                                    />
                                    <input
                                        type="date"
                                        className="trip-edit-input"
                                        value={draftStartDate}
                                        onChange={lambda e: any -> None { draftStartDate = e.target.value; }}
                                    />
                                    <input
                                        type="date"
                                        className="trip-edit-input"
                                        value={draftEndDate}
                                        onChange={lambda e: any -> None { draftEndDate = e.target.value; }}
                                    />
                                    <input
                                        type="number"
                                        className="trip-edit-input"
                                        value={draftBudget}
                                        onChange={lambda e: any -> None { draftBudget = parseInt(e.target.value); }}
                                        placeholder="Budget"
                                    />
                                    <input
                                        type="number"
                                        className="trip-edit-input"
                                        value={draftTravelers}
                                        onChange={lambda e: any -> None { draftTravelers = parseInt(e.target.value); }}
                                        placeholder="Travelers"
                                    />
                                </div>
                            </div>
                        ) if editingTrip else (
                            <div className="trip-summary">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Trip Details</h2>
                                    <button onClick={lambda -> None { startEditTrip(); }} className="text-muted-foreground hover:text-primary transition-colors">
                                        {<Pencil size={14} />}
                                    </button>
                                </div>
                                <div className="trip-summary-grid">
                                    <div className="trip-summary-item">
                                        <span className="trip-summary-icon">{<MapPin size={14} className="text-primary" />}</span>
                                        <span className="font-medium truncate">{tripDestination}</span>
                                    </div>
                                    <div className="trip-summary-item">
                                        <span className="trip-summary-icon">{<Users size={14} className="text-primary" />}</span>
                                        <span>{tripTravelers} travelers</span>
                                    </div>
                                    <div className="trip-summary-item">
                                        <span className="trip-summary-icon">{<Calendar size={14} className="text-primary" />}</span>
                                        <span>{tripStartDate} - {tripEndDate}</span>
                                    </div>
                                    <div className="trip-summary-item">
                                        <span className="trip-summary-icon">{<DollarSign size={14} className="text-primary" />}</span>
                                        <span>${tripBudget}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-chat">
                            {[
                                <div key={msg.id} className={("flex " + ("justify-end" if msg.role == "user" else "justify-start"))}>
                                    <div className="chat-message space-y-2">
                                        <div className={("chat-bubble " + ("chat-bubble-user" if msg.role == "user" else "chat-bubble-ai"))}>
                                            {msg.text}
                                        </div>
                                        {(
                                            <div className="flex flex-wrap gap-1.5">
                                                {[
                                                    <button
                                                        key={chip}
                                                        onClick={lambda -> None { sendMessage(chip); }}
                                                        className="chip"
                                                    >
                                                        {chip}
                                                    </button>
                                                    for chip in msg.chips
                                                ]}
                                            </div>
                                        ) if msg.chips else None}
                                    </div>
                                </div>
                                for msg in chatMessages
                            ]}
                        </div>

                        <form onSubmit={handleChatSubmit} className="p-3 border-t border-border bg-card">
                            <div className="chat-input-wrapper">
                                <input
                                    value={chatInput}
                                    onChange={lambda e: any -> None { chatInput = e.target.value; }}
                                    placeholder="Ask about your trip..."
                                />
                                <button type="submit" className="chat-send-btn" disabled={not chatInput.trim()}>
                                    {<Send size={16} />}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col bg-background hidden md:flex">
                        <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-card">
                            <button onClick={lambda -> None { navigateTo("summary"); }} className="btn btn-outline btn-sm flex items-center gap-1.5">
                                {<FileText size={14} />}
                                <span>View Summary</span>
                            </button>
                        </div>

                        <div className="px-4 pt-4 pb-2 border-b border-border">
                            <div className="plan-toggle">
                                {[
                                    <button
                                        key={plan}
                                        onClick={lambda -> None { activePlan = plan; selectedDay = 1; }}
                                        className={("plan-btn " + ("plan-btn-active" if activePlan == plan else ""))}
                                    >
                                        <span>Plan {plan}</span>
                                        <span className="plan-btn-desc">{planDescriptions[plan]}</span>
                                    </button>
                                    for plan in ["A", "B", "C"]
                                ]}
                            </div>
                        </div>

                        <div className="px-4 pt-3 pb-2 border-b border-border">
                            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Itinerary</h2>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {[
                                    <button
                                        key={day.day}
                                        onClick={lambda -> None { selectedDay = day.day; }}
                                        className={("day-tab " + ("day-tab-active" if selectedDay == day.day else ""))}
                                    >
                                        <span className="font-semibold text-sm">Day {day.day}</span>
                                        <span className="opacity-80">{day.date}</span>
                                    </button>
                                    for day in days
                                ]}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-4">
                            {[
                                <div key={activity.id} className="activity-row">
                                    <div className="activity-timeline">
                                        <div className={getActivityIconClass(activity.category)}>
                                            {getActivityIcon(activity.category)}
                                        </div>
                                        <div className="timeline-line"></div>
                                    </div>
                                    <div className="activity-card">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-semibold text-sm text-foreground truncate">{activity.name}</h3>
                                                <p className="text-xs text-muted-foreground mt-0.5">{activity.location}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-xs font-medium text-foreground">{activity.time}</span>
                                                <p className="text-xs text-primary font-semibold">${activity.cost}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                for activity in currentActivities
                            ]}
                            {(
                                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                                    No activities planned yet
                                </div>
                            ) if currentActivities.length == 0 else None}
                        </div>

                        <div className="budget-tracker">
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-muted-foreground font-medium">Budget</span>
                                <span className={("font-semibold " + ("text-budget-over" if overBudget else "text-foreground"))}>
                                    ${totalCost} / ${tripBudget}
                                </span>
                            </div>
                            <div className="budget-bar">
                                <div
                                    className={("budget-fill " + ("budget-fill-over" if overBudget else ""))}
                                    style={{"width": budgetPercent.toString() + "%"}}
                                ></div>
                            </div>
                            {(
                                <p className="text-xs text-budget-over mt-1">Over budget by ${totalCost - tripBudget}</p>
                            ) if overBudget else None}
                        </div>
                    </div>
                </div>
            </div>;
    }

    if currentPage == "summary" {
        totalCost = getTotalCost();
        days = getCurrentDays();
        costByCategory = getCostByCategory();
        locations = getUniqueLocations();

        return
            <div className="flex flex-col min-h-screen bg-background">
                <header className="top-nav">
                    <button onClick={lambda -> None { navigateTo("landing"); }} className="logo">
                        <div className="logo-icon">
                            {<Compass size={18} />}
                        </div>
                        <span className="logo-text">TripLogic</span>
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-4xl mx-auto px-4 py-8">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <button onClick={lambda -> None { navigateTo("planner"); }} className="btn btn-ghost btn-icon">
                                    {<ArrowLeft size={18} />}
                                </button>
                                <div>
                                    <h1 className="text-2xl font-bold text-foreground">{tripDestination}</h1>
                                    <p className="text-sm text-muted-foreground">
                                        {tripStartDate} - {tripEndDate} - {tripTravelers} travelers
                                    </p>
                                </div>
                            </div>
                            <button className="btn btn-primary flex items-center gap-1.5">
                                {<Download size={14} />}
                                <span>Export</span>
                            </button>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            <div className="md:col-span-2 space-y-6">
                                {[
                                    <div key={day.day} className="summary-card">
                                        <h3 className="font-semibold text-foreground mb-3">
                                            Day {day.day}
                                            <span className="text-muted-foreground font-normal"> - {day.date}</span>
                                        </h3>
                                        <div className="space-y-2.5">
                                            {[
                                                <div key={a.id} className="flex items-center gap-3 text-sm">
                                                    <span className="text-xs text-muted-foreground w-16 shrink-0">{a.time}</span>
                                                    <span className="text-primary shrink-0">{getActivityIcon(a.category)}</span>
                                                    <span className="text-foreground font-medium flex-1 truncate">{a.name}</span>
                                                    <span className="text-primary font-semibold">${a.cost}</span>
                                                </div>
                                                for a in day.activities
                                            ]}
                                        </div>
                                    </div>
                                    for day in days
                                ]}
                            </div>

                            <div className="space-y-6">
                                <div className="summary-card">
                                    <h3 className="font-semibold text-foreground mb-4">Cost Breakdown</h3>
                                    <div className="space-y-3">
                                        {[
                                            <div key={item.category} className="cost-item">
                                                <div className="flex items-center justify-between text-sm mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-primary">{getActivityIcon(item.category)}</span>
                                                        <span className="text-foreground">{categoryLabels[item.category]}</span>
                                                    </div>
                                                    <span className="font-semibold text-foreground">${item.cost}</span>
                                                </div>
                                                <div className="cost-bar">
                                                    <div className="cost-bar-fill" style={{"width": ((item.cost / totalCost) * 100).toString() + "%"}}></div>
                                                </div>
                                            </div>
                                            for item in costByCategory
                                        ]}
                                    </div>
                                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                                        <span className="font-semibold text-foreground">Total</span>
                                        <span className="font-bold text-lg text-primary">${totalCost}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Budget: ${tripBudget} - {("Under budget" if totalCost <= tripBudget else "Over budget")}
                                    </p>
                                </div>

                                <div className="summary-card">
                                    <h3 className="font-semibold text-foreground mb-3">Locations</h3>
                                    <div className="map-placeholder">
                                        <span className="text-muted-foreground">{<Map size={32} />}</span>
                                        <span className="absolute bottom-2 right-2 text-[10px] text-muted-foreground">Map coming soon</span>
                                    </div>
                                    <div className="locations-list space-y-1.5">
                                        {[
                                            <div key={loc} className="location-item">
                                                <span className="text-primary shrink-0">{<MapPin size={12} className="text-primary" />}</span>
                                                <span className="truncate">{loc}</span>
                                            </div>
                                            for loc in locations
                                        ]}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>;
    }

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
