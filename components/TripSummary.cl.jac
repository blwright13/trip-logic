"""Trip details panel with edit mode component."""

import from "lucide-react" { Pencil, Check, MapPin, Users, Calendar, DollarSign }

def:pub TripSummary(
    editing: bool,
    tripDestination: str,
    tripStartDate: str,
    tripEndDate: str,
    tripBudget: int,
    tripTravelers: int,
    draftDestination: str,
    draftStartDate: str,
    draftEndDate: str,
    draftBudget: int,
    draftTravelers: int,
    onEdit: any,
    onSave: any,
    onDestinationChange: any,
    onStartDateChange: any,
    onEndDateChange: any,
    onBudgetChange: any,
    onTravelersChange: any
) -> any {
    if editing {
        return
            <div className="trip-summary space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Trip Details</h2>
                    <button onClick={lambda -> None { onSave(); }} className="text-primary transition-colors">
                        {<Check size={18} />}
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input
                        className="col-span-2 trip-edit-input"
                        value={draftDestination}
                        onChange={onDestinationChange}
                        placeholder="Destination"
                    />
                    <input
                        type="date"
                        className="trip-edit-input"
                        value={draftStartDate}
                        onChange={onStartDateChange}
                    />
                    <input
                        type="date"
                        className="trip-edit-input"
                        value={draftEndDate}
                        onChange={onEndDateChange}
                    />
                    <input
                        type="number"
                        className="trip-edit-input"
                        value={draftBudget}
                        onChange={onBudgetChange}
                        placeholder="Budget"
                    />
                    <input
                        type="number"
                        className="trip-edit-input"
                        value={draftTravelers}
                        onChange={onTravelersChange}
                        placeholder="Travelers"
                    />
                </div>
            </div>;
    }

    return
        <div className="trip-summary">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Trip Details</h2>
                <button onClick={lambda -> None { onEdit(); }} className="text-muted-foreground hover:text-primary transition-colors">
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
        </div>;
}
