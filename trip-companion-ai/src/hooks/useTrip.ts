import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as api from "@/services/api";
import type { TastePlaceSuggestion } from "@/services/api";

export function useTrip(tripId: number | undefined) {
  return useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => api.getTrip(tripId!),
    enabled: !!tripId,
  });
}

export function useTrips() {
  return useQuery({
    queryKey: ["trips"],
    queryFn: api.getTrips,
  });
}

export function useCreateTrip() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: string) => api.createTrip(request),
    onSuccess: (trip) => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      toast.success("Trip created!");
      navigate(`/planning/${trip.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create trip");
    },
  });
}

export function useUpdateTrip(tripId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<api.Trip>) => api.updateTrip(tripId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      toast.success("Trip updated!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update trip");
    },
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tripId: number) => api.deleteTrip(tripId),
    onSuccess: (_data, tripId) => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.removeQueries({ queryKey: ["trip", tripId] });
      toast.success("Trip deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete trip");
    },
  });
}

export function useChatHistory(tripId: number | undefined) {
  return useQuery({
    queryKey: ["chat", tripId],
    queryFn: () => api.getChatHistory(tripId!),
    enabled: !!tripId,
  });
}

export function useSendPlanningMessage(tripId: number | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (message: string) => {
      if (tripId === undefined) throw new Error("No trip id");
      return api.sendPlanningMessage(tripId, message);
    },
    onSuccess: (data) => {
      if (tripId === undefined) return;
      queryClient.invalidateQueries({ queryKey: ["chat", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      queryClient.invalidateQueries({ queryKey: ["tasteSuggestions", tripId] });
      if (data.planning_phase === "complete") {
        queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
        toast.success("Your itinerary is ready!");
        navigate(`/planner/${tripId}`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    },
  });
}

export function usePostPlanningConfirm(tripId: number | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => {
      if (tripId === undefined) throw new Error("No trip id");
      return api.postPlanningConfirm(tripId);
    },
    onSuccess: (data) => {
      if (tripId === undefined) return;
      queryClient.invalidateQueries({ queryKey: ["chat", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      if (data.planning_phase === "complete") {
        queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
        toast.success("Your itinerary is ready!");
        navigate(`/planner/${tripId}`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not build itinerary");
    },
  });
}

export function useClaimTrip(tripId: number | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (tripId === undefined) throw new Error("No trip id");
      return api.claimTrip(tripId);
    },
    onSuccess: () => {
      if (tripId === undefined) return;
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

export function usePostPlanningTasteSignals(tripId: number | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { liked: TastePlaceSuggestion[]; disliked: TastePlaceSuggestion[]; skip?: boolean }) => {
      if (tripId === undefined) throw new Error("No trip id");
      return api.postPlanningTasteSignals(tripId, body);
    },
    onSuccess: () => {
      if (tripId === undefined) return;
      queryClient.invalidateQueries({ queryKey: ["chat", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      queryClient.invalidateQueries({ queryKey: ["tasteSuggestions", tripId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save taste preferences");
    },
  });
}

export function usePatchPlanningContext(tripId: number | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planningContext: Record<string, unknown>) => {
      if (tripId === undefined) throw new Error("No trip id");
      return api.patchPlanningContext(tripId, planningContext);
    },
    onSuccess: () => {
      if (tripId === undefined) return;
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      toast.success("Trip details updated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update details");
    },
  });
}

export function useSendMessage(tripId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (message: string) => api.sendMessage(tripId, message),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["chat", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      if (data.trip_updated) {
        queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    },
  });
}

export function useItinerary(tripId: number | undefined) {
  return useQuery({
    queryKey: ["itinerary", tripId],
    queryFn: () => api.getItinerary(tripId!),
    enabled: !!tripId,
  });
}

export function useUpdateActivity(tripId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ activityId, data }: { activityId: number; data: api.ActivityUpdate }) =>
      api.updateActivity(activityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      toast.success("Activity updated!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update activity");
    },
  });
}

export function useDeleteActivity(tripId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (activityId: number) => api.deleteActivity(activityId),
    onMutate: async (activityId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["itinerary", tripId] });

      // Snapshot current data
      const previousItinerary = queryClient.getQueryData<api.DayItinerary[]>(["itinerary", tripId]);

      // Optimistically update
      if (previousItinerary) {
        queryClient.setQueryData<api.DayItinerary[]>(["itinerary", tripId], (old) =>
          old?.map((day) => ({
            ...day,
            activities: day.activities.filter((a) => a.id !== activityId),
          }))
        );
      }

      return { previousItinerary };
    },
    onError: (error, _activityId, context) => {
      // Rollback on error
      if (context?.previousItinerary) {
        queryClient.setQueryData(["itinerary", tripId], context.previousItinerary);
      }
      toast.error(error instanceof Error ? error.message : "Failed to delete activity");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
    },
    onSuccess: () => {
      toast.success("Activity removed");
    },
  });
}

function parseTimeString(t: string): number {
  const [timePart, period] = t.split(" ");
  const [h, m] = timePart.split(":").map(Number);
  const hour = period === "PM" && h !== 12 ? h + 12 : period === "AM" && h === 12 ? 0 : h;
  return hour * 60 + m;
}

export function useReorderActivities(tripId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (activityIds: number[]) => api.reorderActivities(tripId, activityIds),
    onMutate: async (activityIds) => {
      await queryClient.cancelQueries({ queryKey: ["itinerary", tripId] });
      const prev = queryClient.getQueryData<api.DayItinerary[]>(["itinerary", tripId]);

      if (prev) {
        queryClient.setQueryData<api.DayItinerary[]>(["itinerary", tripId], (old) => {
          if (!old) return old;
          const idSet = new Set(activityIds);
          return old.map((day) => {
            const inDay = day.activities.filter((a) => idSet.has(a.id));
            if (inDay.length === 0) return day;

            // Sorted time slots from current positions (API already returns in time order)
            const sortedTimes = inDay.map((a) => a.time);

            // Map new-order IDs → time slots
            const timeMap = new Map<number, string>();
            activityIds.forEach((id, i) => { timeMap.set(id, sortedTimes[i]); });

            const updated = day.activities.map((a) =>
              timeMap.has(a.id) ? { ...a, time: timeMap.get(a.id)! } : a
            );
            return {
              ...day,
              activities: updated.sort((a, b) => parseTimeString(a.time) - parseTimeString(b.time)),
            };
          });
        });
      }

      return { prev };
    },
    onError: (error, _ids, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["itinerary", tripId], ctx.prev);
      toast.error(error instanceof Error ? error.message : "Failed to reorder activities");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
    },
  });
}

export function useGetAlternatives(tripId: number) {
  return useMutation({
    mutationFn: (activityId: number) => api.getAlternatives(tripId, activityId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to get alternatives");
    },
  });
}

export function useApplySuggestion(tripId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: api.ApplySuggestionRequest) => api.applySuggestion(tripId, body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      toast.success(data.mode === "replaced" ? "Activity replaced!" : "Activity added!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to apply suggestion");
    },
  });
}

export function useCreateActivity(tripId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: api.ActivityCreate) => api.createActivity(tripId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      toast.success("Activity added!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create activity");
    },
  });
}
