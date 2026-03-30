import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Trash2, ArrowLeft, Loader2 } from "lucide-react";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { useTrips } from "@/hooks/useTrip";
import { deleteTrip } from "@/services/api";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const formatDateRange = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
};

const getDuration = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return `${days} day${days !== 1 ? 's' : ''}`;
};

const TripListPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: trips = [], isLoading, isError } = useTrips();
  const [tripToDelete, setTripToDelete] = useState<number | null>(null);

  const deleteTripMutation = useMutation({
    mutationFn: (tripId: number) => deleteTrip(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      toast.success("Trip deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete trip");
    },
  });

  const handleDelete = (e: React.MouseEvent, tripId: number) => {
    e.stopPropagation();
    setTripToDelete(tripId);
  };

  const confirmDelete = () => {
    if (tripToDelete !== null) {
      deleteTripMutation.mutate(tripToDelete);
      setTripToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <TopNav />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <TopNav />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <p className="text-muted-foreground mb-4">Failed to load trips</p>
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to Home
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopNav />

      <main className="flex-1 px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => navigate('/')}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-bold text-foreground">All Trips</h1>
          </div>

          {trips.length === 0 ? (
            <div className="text-center py-16">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">You haven't planned any trips yet</p>
              <Button onClick={() => navigate('/')}>
                Plan Your First Trip
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {trips.map((trip) => (
                <div
                  key={trip.id}
                  onClick={() => navigate(`/planner/${trip.id}`)}
                  className="group relative flex flex-col items-start gap-2 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-md transition-all text-left cursor-pointer"
                >
                  <button
                    onClick={(e) => handleDelete(e, trip.id)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete trip"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
                    <MapPin size={18} />
                  </div>
                  <div className="w-full">
                    <p className="font-semibold text-sm text-foreground truncate pr-6">{trip.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDateRange(trip.start, trip.end)} · {getDuration(trip.start, trip.end)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {trip.activities.length} activities · ${trip.budget.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <AlertDialog open={tripToDelete !== null} onOpenChange={() => setTripToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trip? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TripListPage;
