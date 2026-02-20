import from byllm.lib { Model }
import from uuid { uuid4 }

glob llm = Model(model_name="gemini/gemini-2.5-flash");

node Trip {
    has id: str,
        title: str,
        start: str,
        end: str,
        num_people: int,
        budget: float,
        activities: list[Activity];
}

sem Trip.start = "Date and time of start of trip";
sem Trip.end = "Date and time of end of trip";
sem Trip.budget = "Total budget for trip in USD";
sem Trip.activities = """
List of activities to do on trip.
The times should not overlap and should fit within the trip duration.
The total cost of all activities should be within the trip budget.
""";

obj Activity {
    has id: str,
        title: str,
        type: ActivityType,
        start: str,
        duration: float,
        cost: float;
}

enum ActivityType {
    TRAVEL, 
    LODGING, 
    ACTIVE, 
    FOOD, 
    SHOPPING, 
    SIGHTSEEING, 
    ENTERTAINMENT, 
    OTHER
}

sem Activity.start = "Date and time of start of activity";
sem Activity.duration = "Duration of activity in hours";
sem Activity.cost = "Cost of activity in USD";

def generate_trip(request: str) -> Trip by llm();

walker add_trip {
    has request: str;

    can create with Root entry {
        trip = generate_trip(request);
        root ++> Trip(
            id = str(uuid4()),
            title = trip.title,
            start = trip.start,
            end = trip.end,
            num_people = trip.num_people,
            budget = trip.budget,
            activities = [Activity(
                id = str(uuid4()),
                title = activity.title,
                type = activity.type,
                start = activity.start,
                duration = activity.duration,
                cost = activity.cost
            ) for activity in trip.activities]
        );
    }
}

walker listTrips {
    has trips: list[Trip] = [];
    
    can search with Root entry {
        visit[-->];
    }

    can collect with Trip entry {
        self.trips.append({
            "id": here.id,
            "title": here.title,
            "start": here.start,
            "end": here.end,
            "num_people": here.num_people,
            "budget": here.budget,
            "activities": [{
                "id": activity.id,
                "title": activity.title,
                "type": activity.type,
                "start": activity.start,
                "duration": activity.duration,
                "cost": activity.cost
            } for activity in here.activities]
        });
    }

    can list with Root exit {
        report self.trips;
    }
}

with entry {
    request = """
    I would like to take a trip to Florida, from June 5 to June 7 2026.
    It will be me and one other person on the trip.
    We like to be active, so outdoor activities are ideal.
    Our budget is $3000.
    """;

    root spawn add_trip(request);

    trips = root spawn listTrips();

    print(trips.reports[0]);
}
