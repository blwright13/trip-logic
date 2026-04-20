import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";

interface ActivityPin {
  name: string;
  time: string;
  location: string;
}

interface TripMapProps {
  activities: ActivityPin[];
}

function uniqueActivitiesByLocation(activities: ActivityPin[]) {
  const seen = new Map<string, ActivityPin>();

  activities.forEach((activity) => {
    const location = activity.location.trim();
    if (location && !seen.has(location)) {
      seen.set(location, { ...activity, location });
    }
  });

  return Array.from(seen.values());
}

function googleMapEmbedUrl(location: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`;
}

export function TripMap({ activities }: TripMapProps) {
  const locations = useMemo(() => uniqueActivitiesByLocation(activities), [activities]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (locations.length === 0) {
    return (
      <div className="h-52 rounded-xl bg-secondary flex items-center justify-center text-sm text-muted-foreground">
        No mappable locations
      </div>
    );
  }

  const selectedActivity = locations[Math.min(selectedIndex, locations.length - 1)];

  return (
    <div className="space-y-3">
      <div className="h-52 rounded-xl overflow-hidden border border-border bg-secondary">
        <iframe
          key={selectedActivity.location}
          title={`Map preview for ${selectedActivity.location}`}
          src={googleMapEmbedUrl(selectedActivity.location)}
          className="h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
        {locations.map((activity, index) => (
          <button
            key={`${activity.location}-${activity.name}`}
            type="button"
            onClick={() => setSelectedIndex(index)}
            className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
              index === selectedIndex
                ? "bg-primary/10 text-foreground"
                : "text-foreground hover:bg-secondary"
            }`}
          >
            <MapPin size={12} className="mt-0.5 shrink-0 text-primary" />
            <span className="min-w-0 whitespace-normal break-words leading-snug">
              {activity.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
