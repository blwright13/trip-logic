"""Destination card component for landing page."""

import from "lucide-react" { Building, Palmtree as TreePalm, Mountain, Plane }

def:pub TripCard(dest: dict, onClick: any) -> any {
    def getDestinationIcon(iconType: str) -> any {
        if iconType == "building" { return <Building size={22} />; }
        if iconType == "palm" { return <TreePalm size={22} />; }
        if iconType == "mountain" { return <Mountain size={22} />; }
        return <Plane size={22} />;
    }

    return
        <button
            onClick={lambda -> None { onClick(); }}
            className="destination-card"
        >
            <div className="destination-icon">
                {getDestinationIcon(dest.icon)}
            </div>
            <div>
                <p className="font-semibold text-sm text-foreground">{dest.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{dest.subtitle}</p>
            </div>
        </button>;
}
