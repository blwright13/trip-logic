import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, DollarSign, Lightbulb, Loader2 } from "lucide-react";
import type { AlternativeActivity } from "@/services/api";

interface AlternativesModalProps {
  open: boolean;
  onClose: () => void;
  alternatives: AlternativeActivity[];
  onSelect: (alternative: AlternativeActivity) => void;
  loading?: boolean;
  currentActivityName?: string;
}

const categoryColors: Record<string, string> = {
  food: "bg-orange-100 text-orange-600",
  sightseeing: "bg-blue-100 text-blue-600",
  transport: "bg-green-100 text-green-600",
  hotel: "bg-purple-100 text-purple-600",
  shopping: "bg-pink-100 text-pink-600",
  entertainment: "bg-yellow-100 text-yellow-600",
  flight: "bg-sky-100 text-sky-600",
  cafe: "bg-amber-100 text-amber-700",
};

const AlternativesModal = ({
  open,
  onClose,
  alternatives,
  onSelect,
  loading,
  currentActivityName,
}: AlternativesModalProps) => {
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alternative Activities</DialogTitle>
          <DialogDescription>
            {currentActivityName
              ? `Choose an alternative to "${currentActivityName}"`
              : "Choose an alternative activity"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Finding alternatives...</span>
            </div>
          ) : alternatives.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No alternatives found
            </div>
          ) : (
            alternatives.map((alt, idx) => (
              <button
                key={idx}
                onClick={() => onSelect(alt)}
                className="w-full text-left p-4 rounded-xl border border-border bg-card hover:border-primary hover:bg-accent/50 transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          categoryColors[alt.category] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {alt.category}
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm text-foreground group-hover:text-primary truncate">
                      {alt.title}
                    </h4>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {alt.location}
                      </span>
                      <span className="flex items-center gap-1 text-primary font-semibold">
                        <DollarSign size={12} />
                        {alt.cost}
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5 mt-2 text-xs text-muted-foreground">
                      <Lightbulb size={12} className="shrink-0 mt-0.5" />
                      <span>{alt.reason}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AlternativesModal;
