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
