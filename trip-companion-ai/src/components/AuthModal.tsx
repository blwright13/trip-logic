import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const AuthModal = () => {
  const {
    authModalOpen,
    authModalMode,
    authModalDestination,
    closeAuthModal,
    signIn,
    signUp,
    signInWithGoogle,
  } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">(authModalMode);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const authErrorMessage = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    if (message.toLowerCase().includes("failed to fetch")) {
      return "Cannot reach Supabase Auth. Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in trip-companion-ai/.env, then restart the frontend.";
    }
    return message;
  };

  useEffect(() => {
    if (authModalOpen) {
      setMode(authModalMode);
    }
  }, [authModalMode, authModalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
        toast.success("Signed in");
      } else {
        await signUp(email.trim(), password, {
          display_name: displayName.trim() || undefined,
        });
        toast.success("Account created");
      }
      closeAuthModal();
      setPassword("");
    } catch (error) {
      toast.error(authErrorMessage(error, "Authentication failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      toast.error(authErrorMessage(error, "Google sign-in failed"));
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={authModalOpen} onOpenChange={(open) => !open && closeAuthModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "signup" ? "Create your account" : "Welcome back"}</DialogTitle>
          <DialogDescription>
            {authModalDestination
              ? `Continue planning ${authModalDestination} after signing in.`
              : "Sign in to access your saved trips and profile."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "signup" ? "default" : "outline"}
            onClick={() => setMode("signup")}
          >
            Sign up
          </Button>
          <Button
            type="button"
            variant={mode === "signin" ? "default" : "outline"}
            onClick={() => setMode("signin")}
          >
            Log in
          </Button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What should we call you?"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <Button disabled={submitting} className="w-full" type="submit">
            {mode === "signup" ? "Create account" : "Log in"}
          </Button>
        </form>

        <div className="relative my-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Button type="button" variant="outline" onClick={handleGoogle} disabled={submitting}>
          Continue with Google
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
