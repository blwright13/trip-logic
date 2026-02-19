import from byllm.lib { Model }

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

with entry {
    request = """
    I would like to take a trip to Florida, from June 5 to June 7 2026.
    It will be me and one other person on the trip.
    We like to be active, so outdoor activities are ideal.
    Our budget is $3000.
    """;

    trip = generate_trip(request);

    print(f"Title: {trip.title}");
    print(f"Duration: {trip.start} to {trip.end}");
    print(f"Budget {trip.budget}");

    for activity in trip.activities {
        print();
        print(f"Activity: {activity.title}");
        print(f"Type: {activity.type}");
        print(f"Start: {activity.start}");
        print(f"Duration: {activity.duration}");
        print(f"Cost: {activity.cost}");
    }
}
