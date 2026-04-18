import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, Sun, Moon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

interface TopNavProps {
  variant?: "light" | "dark";
  darkMode?: boolean;
  onToggleDark?: () => void;
}

const TopNav = ({ variant = "light", darkMode, onToggleDark }: TopNavProps) => {
  const navigate = useNavigate();
  const isOverlay = variant === "dark";
  const { user, openAuthModal, signOut } = useAuth();

  const initials = useMemo(() => {
    const source =
      (user?.user_metadata?.display_name as string | undefined) || user?.email || "U";
    return source
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user]);

  return (
    <header
      style={
        isOverlay
          ? {
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              height: "3.75rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 1.5rem",
              background: darkMode ? "rgba(12,10,8,0.85)" : "rgba(255,255,255,0.88)",
              borderBottom: darkMode
                ? "1px solid rgba(255,255,255,0.07)"
                : "1px solid rgba(0,0,0,0.07)",
              backdropFilter: "blur(16px)",
              transition: "background 0.3s, border-color 0.3s",
            }
          : {
              height: "3.75rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 1.5rem",
              borderBottom: "1px solid var(--border)",
              background: "var(--card)",
            }
      }
    >
      <button
        onClick={() => navigate("/")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          background: "none",
          border: "none",
          cursor: "pointer",
          opacity: 1,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.75")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
      >
        <div
          style={{
            width: "2rem",
            height: "2rem",
            borderRadius: "0.5rem",
            background: "linear-gradient(135deg, #E8632A, #C8501A)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Compass size={16} color="#fff" />
        </div>
        <span
          style={{
            fontWeight: 700,
            fontSize: "1rem",
            letterSpacing: "-0.01em",
            color: isOverlay ? (darkMode ? "#F0EBE5" : "#1A1512") : "var(--foreground)",
          }}
        >
          TripLogic
        </span>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {onToggleDark !== undefined && (
          <button
            onClick={onToggleDark}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              width: "2.25rem",
              height: "2.25rem",
              borderRadius: "0.5rem",
              border: darkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)",
              background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: darkMode ? "rgba(240,235,229,0.7)" : "rgba(26,21,18,0.6)",
              transition: "background 0.2s, border-color 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = darkMode
                ? "rgba(255,255,255,0.12)"
                : "rgba(0,0,0,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = darkMode
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)";
            }}
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        )}

        {!user ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openAuthModal({ mode: "signin" })}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => openAuthModal({ mode: "signup" })}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Sign up
            </button>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button">
                <Avatar className="h-8 w-8 cursor-pointer">
                  <AvatarFallback
                    style={
                      isOverlay
                        ? {
                            background: darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
                            color: darkMode ? "rgba(240,235,229,0.6)" : "rgba(26,21,18,0.5)",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                          }
                        : {}
                    }
                    className={!isOverlay ? "bg-secondary text-muted-foreground text-xs font-semibold" : ""}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/profile")}>My Profile</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/trips")}>My Trips</DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut()}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
};

export default TopNav;
