"""Day selector tab component."""

def:pub DayTab(day: dict, isSelected: bool, onSelect: any) -> any {
    return
        <button
            onClick={lambda -> None { onSelect(day.day); }}
            className={("day-tab " + ("day-tab-active" if isSelected else ""))}
        >
            <span className="font-semibold text-sm">Day {day.day}</span>
            <span className="opacity-80">{day.date}</span>
        </button>;
}
