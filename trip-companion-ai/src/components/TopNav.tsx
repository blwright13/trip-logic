import { useNavigate, useLocation } from "react-router-dom";
import { Plus, Compass } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const TopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isPlanner = location.pathname === "/planner";

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-4">
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity">

        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Compass size={18} className="text-primary-foreground" />
        </div>
        <span className="font-bold text-lg text-foreground tracking-tight">TripLogic

        </span>
      </button>

      <div className="flex items-center gap-3">
        {!isPlanner && <Button size="sm" onClick={() => navigate("/planner")} className="gap-1.5">
            <Plus size={14} />
            New Trip
          </Button>}
        <Avatar className="h-8 w-8 cursor-pointer">
          <AvatarFallback className="bg-secondary text-muted-foreground text-xs font-semibold">
            JD
          </AvatarFallback>
        </Avatar>
      </div>
    </header>);

};

export default TopNav;