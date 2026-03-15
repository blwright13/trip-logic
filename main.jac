"""TripLogic - AI-Powered Trip Planning Application."""

cl {
    import from frontend { app as ClientApp }

    def:pub app -> any {
        return
            <ClientApp />;
    }
}

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
        activities: list;
}

sem Trip.start = "Date and time of start of trip";
sem Trip.end = "Date and time of end of trip";
sem Trip.budget = "Total budget for trip in USD";

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

def generate_activity(request: str) -> Activity by llm();

walker:priv AddTrip {
    has request: str;

    can create with `root entry {
        trip = generate_trip(self.request);
        new_trip = here ++> Trip(
            id = str(uuid4()),
            title = trip.title,
            start = trip.start,
            end = trip.end,
            num_people = trip.num_people,
            budget = trip.budget,
            activities = []
        );
        report {
            "id": new_trip[0].id,
            "title": new_trip[0].title
        };
    }
}

walker:priv ListTrips {
    has trips: list = [];

    can search with `root entry {
        visit [-->];
    }

    can collect with Trip entry {
        self.trips.append({
            "id": here.id,
            "title": here.title,
            "start": here.start,
            "end": here.end,
            "num_people": here.num_people,
            "budget": here.budget
        });
    }

    can list with `root exit {
        report self.trips;
    }
}

walker:priv DeleteTrip {
    has trip_id: str;

    can search with `root entry {
        visit [-->];
    }

    can delete with Trip entry {
        if here.id == self.trip_id {
            del here;
            report {"deleted": self.trip_id};
        }
    }
}

walker:priv GetTrip {
    has trip_id: str;

    can search with `root entry {
        visit [-->];
    }

    can get with Trip entry {
        if here.id == self.trip_id {
            report {
                "id": here.id,
                "title": here.title,
                "start": here.start,
                "end": here.end,
                "num_people": here.num_people,
                "budget": here.budget,
                "activities": here.activities
            };
        }
    }
}

walker:priv UpdateTrip {
    has trip_id: str;
    has title: str = "";
    has start: str = "";
    has end: str = "";
    has num_people: int = -1;
    has budget: float = -1.0;

    can search with `root entry {
        visit [-->];
    }

    can update with Trip entry {
        if here.id == self.trip_id {
            if self.title != "" {
                here.title = self.title;
            }
            if self.start != "" {
                here.start = self.start;
            }
            if self.end != "" {
                here.end = self.end;
            }
            if self.num_people != -1 {
                here.num_people = self.num_people;
            }
            if self.budget != -1.0 {
                here.budget = self.budget;
            }
            report {
                "id": here.id,
                "title": here.title,
                "start": here.start,
                "end": here.end,
                "num_people": here.num_people,
                "budget": here.budget
            };
        }
    }
}

walker:priv GetItinerary {
    has trip_id: str;

    can search with `root entry {
        visit [-->];
    }

    can get with Trip entry {
        if here.id == self.trip_id {
            # Group activities by day
            days = {};
            for activity in here.activities {
                day_key = activity.start.split("T")[0] if "T" in activity.start else activity.start;
                if day_key not in days {
                    days[day_key] = [];
                }
                days[day_key].append(activity);
            }
            report {
                "trip_id": here.id,
                "days": days
            };
        }
    }
}

walker:priv SendChatMessage {
    has trip_id: str;
    has message: str;

    can search with `root entry {
        visit [-->];
    }

    can respond with Trip entry {
        if here.id == self.trip_id {
            # Generate AI response about the trip
            prompt = f"The user is planning a trip to {here.title} from {here.start} to {here.end} with a budget of ${here.budget} for {here.num_people} people. They said: {self.message}. Provide a helpful, concise response about their trip.";
            response = llm(prompt);
            report {
                "trip_id": here.id,
                "user_message": self.message,
                "ai_response": response,
                "chips": ["Tell me more", "Update my itinerary", "What else can I do?"]
            };
        }
    }
}
