"""Activity row with timeline component."""

import from "lucide-react" {
    MapPin, Utensils, Camera, Map, Bed, ShoppingBag, Music, Plane, Coffee
}

def:pub ActivityItem(activity: dict) -> any {
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

    return
        <div className="activity-row">
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
        </div>;
}
