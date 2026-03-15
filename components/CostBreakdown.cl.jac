"""Cost by category breakdown component."""

import from "lucide-react" {
    MapPin, Utensils, Camera, Map, Bed, ShoppingBag, Music, Plane, Coffee
}

def:pub CostBreakdown(costByCategory: list, totalCost: float, budget: int, categoryLabels: dict) -> any {
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
                Budget: ${budget} - {("Under budget" if totalCost <= budget else "Over budget")}
            </p>
        </div>;
}
