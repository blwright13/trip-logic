"""Locations panel component."""

import from "lucide-react" { Map, MapPin }

def:pub LocationsList(locations: list) -> any {
    return
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
        </div>;
}
