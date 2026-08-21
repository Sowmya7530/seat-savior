import { Link, useRouter } from "@tanstack/react-router";
import { Ticket, LogOut } from "lucide-react";
import { useAuth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function SiteNav() {
  const { user, roles } = useAuth();
  const router = useRouter();

  const links: Array<{ to: string; label: string }> = [{ to: "/", label: "Events" }];
  if (user) links.push({ to: "/bookings", label: "My bookings" });
  if (roles.includes("organiser")) links.push({ to: "/organiser", label: "Organiser" });
  if (roles.includes("admin")) links.push({ to: "/admin", label: "Admin" });
  if (user) links.push({ to: "/mailbox", label: "Mailbox" });

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2">
          <Ticket className="size-5 text-primary" />
          <span className="font-display text-2xl leading-none tracking-wide">SEATFLOW</span>
        </Link>
        <nav className="flex flex-1 items-center gap-4 text-sm text-muted-foreground">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="transition-colors hover:text-foreground [&.active]:text-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await signOut();
                await router.navigate({ to: "/" });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        ) : (
          <Button size="sm" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
