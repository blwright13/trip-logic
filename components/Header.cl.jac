"""Top navigation bar component."""

import from "lucide-react" { Compass, Plus }

def:pub Header(onLogoClick: any, showNewTrip: bool, onNewTrip: any) -> any {
    return
        <header className="top-nav">
            <button onClick={lambda -> None { onLogoClick(); }} className="logo">
                <div className="logo-icon">
                    {<Compass size={18} />}
                </div>
                <span className="logo-text">TripLogic</span>
            </button>
            <div className="flex items-center gap-3">
                {(
                    <button onClick={lambda -> None { onNewTrip(); }} className="btn btn-primary btn-sm flex items-center gap-1.5">
                        {<Plus size={14} />}
                        <span>New Trip</span>
                    </button>
                ) if showNewTrip else None}
                <div className="avatar h-8 w-8">JD</div>
            </div>
        </header>;
}
