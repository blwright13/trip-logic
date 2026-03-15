"""Plan A/B/C selector component."""

def:pub PlanToggle(activePlan: str, planDescriptions: dict, onPlanSelect: any) -> any {
    return
        <div className="plan-toggle">
            {[
                <button
                    key={plan}
                    onClick={lambda -> None { onPlanSelect(plan); }}
                    className={("plan-btn " + ("plan-btn-active" if activePlan == plan else ""))}
                >
                    <span>Plan {plan}</span>
                    <span className="plan-btn-desc">{planDescriptions[plan]}</span>
                </button>
                for plan in ["A", "B", "C"]
            ]}
        </div>;
}
