"""Trip summary and export page."""

import from "lucide-react" {
    Compass, ArrowLeft, Download,
    MapPin, Utensils, Camera, Map, Bed, ShoppingBag, Music, Plane, Coffee
}

import from ..components.CostBreakdown { CostBreakdown }
import from ..components.LocationsList { LocationsList }

def:pub SummaryPage(
    tripDestination: str,
    tripStartDate: str,
    tripEndDate: str,
    tripTravelers: int,
    tripBudget: int,
    days: list,
    totalCost: float,
    costByCategory: list,
    locations: list,
    categoryLabels: dict,
    onLogoClick: any,
    onBackClick: any
) -> any {
    def getActivityIcon(cat: str) -> any {
        if cat == "food" { return <Utensils size={14} />; }
        if cat == "sightseeing" { return <Camera size={14} />; }
        if cat == "transport" { return <Map size={14} />; }
        if cat == "hotel" { return <Bed size={14} />; }
        if cat == "shopping" { return <ShoppingBag size={14} />; }
        if cat == "entertainment" { return <Music size={14} />; }
        if cat == "flight" { return <Plane size={14} />; }
        if cat == "cafe" { return <Coffee size={14} />; }
        return <MapPin size={14} />;
    }

    return
        <div className="flex flex-col min-h-screen bg-background">
            <header className="top-nav">
                <button onClick={lambda -> None { onLogoClick(); }} className="logo">
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
                            <button onClick={lambda -> None { onBackClick(); }} className="btn btn-ghost btn-icon">
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
                            <CostBreakdown
                                costByCategory={costByCategory}
                                totalCost={totalCost}
                                budget={tripBudget}
                                categoryLabels={categoryLabels}
                            />

                            <LocationsList
                                locations={locations}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>;
}
