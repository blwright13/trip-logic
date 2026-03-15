"""Budget progress bar component."""

def:pub BudgetTracker(totalCost: float, budget: int, overBudget: bool, budgetPercent: float) -> any {
    return
        <div className="budget-tracker">
            <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground font-medium">Budget</span>
                <span className={("font-semibold " + ("text-budget-over" if overBudget else "text-foreground"))}>
                    ${totalCost} / ${budget}
                </span>
            </div>
            <div className="budget-bar">
                <div
                    className={("budget-fill " + ("budget-fill-over" if overBudget else ""))}
                    style={{"width": budgetPercent.toString() + "%"}}
                ></div>
            </div>
            {(
                <p className="text-xs text-budget-over mt-1">Over budget by ${totalCost - budget}</p>
            ) if overBudget else None}
        </div>;
}
