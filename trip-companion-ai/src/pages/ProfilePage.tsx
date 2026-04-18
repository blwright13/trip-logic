import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { getProfile, updateProfile, type ProfileUpdate } from "@/services/api";

const STYLE_TAGS = [
  "Budget-conscious",
  "Foodie",
  "Adventure",
  "Luxury",
  "Culture",
  "Nightlife",
  "Relaxed",
];

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"];

const ProfilePage = () => {
  const { user, sendPasswordReset, signOut } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  const [displayName, setDisplayName] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [styles, setStyles] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.display_name ?? "");
    setHomeCity(data.home_city ?? "");
    setCurrency(data.preferred_currency ?? "USD");
    setStyles(data.travel_style_tags ?? []);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: ProfileUpdate) => updateProfile(payload),
    onSuccess: (profile) => {
      queryClient.setQueryData(["profile"], profile);
      toast.success("Profile updated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save profile");
    },
  });

  const toggleStyle = (tag: string) => {
    setStyles((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  };

  const save = () => {
    saveMutation.mutate({
      display_name: displayName || undefined,
      home_city: homeCity || undefined,
      preferred_currency: currency || undefined,
      travel_style_tags: styles,
    });
  };

  const onResetPassword = async () => {
    if (!user?.email) {
      toast.error("No email found for your account");
      return;
    }
    try {
      await sendPasswordReset(user.email);
      toast.success("Password reset email sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send reset email");
    }
  };

  const onLogout = async () => {
    try {
      await signOut();
      toast.success("Logged out");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not log out");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopNav />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TopNav />
        <main className="flex flex-1 items-center justify-center text-muted-foreground">Unable to load profile</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopNav />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="mb-6 text-2xl font-bold">My Profile</h1>

        <div className="space-y-5 rounded-xl border border-border bg-card p-6">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={data.email ?? user?.email ?? ""} readOnly />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="home-city">Home city</Label>
            <Input id="home-city" value={homeCity} onChange={(e) => setHomeCity(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Preferred currency</Label>
            <select
              id="currency"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Travel style tags</Label>
            <div className="flex flex-wrap gap-2">
              {STYLE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleStyle(tag)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    styles.includes(tag)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={save} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
            <Button variant="outline" onClick={onResetPassword}>
              Change password
            </Button>
            <Button variant="ghost" onClick={onLogout}>
              Log out
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProfilePage;
