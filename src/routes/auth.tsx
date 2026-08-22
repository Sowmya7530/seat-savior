import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SeatFlow" },
      { name: "description", content: "Sign in or create a SeatFlow account to book seats." },
      { property: "og:title", content: "Sign in — SeatFlow" },
      { property: "og:description", content: "Sign in or create a SeatFlow account to book seats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"customer" | "organiser">("customer");
  const [busy, setBusy] = useState(false);
  const next = (Route.useSearch() as { next?: string }).next;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: next ?? "/" });
    });
  }, [navigate, next]);

  async function afterAuth() {
    await supabase.rpc("ensure_profile", { p_full_name: fullName, p_role: role });
    router.invalidate();
    await navigate({ to: next ?? "/" });
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    await afterAuth();
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: fullName, role } },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data.session) {
      toast.success("Check your email to confirm your account, then sign in.");
      return;
    }
    await afterAuth();
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4">
      <div className="panel w-full p-6">
        <h1 className="text-3xl">Welcome to SeatFlow</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Customers book seats. Organisers publish shows.
        </p>
        <Tabs defaultValue="signin">
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">
              Sign in
            </TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">
              Create account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={signIn} className="space-y-4 pt-4">
              <Field label="Email" value={email} set={setEmail} type="email" />
              <Field label="Password" value={password} set={setPassword} type="password" />
              <Button className="w-full" disabled={busy}>
                Sign in
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={signUp} className="space-y-4 pt-4">
              <Field label="Full name" value={fullName} set={setFullName} />
              <Field label="Email" value={email} set={setEmail} type="email" />
              <Field label="Password" value={password} set={setPassword} type="password" />
              <div className="space-y-2">
                <Label>I am a</Label>
                <div className="flex gap-2">
                  {(["customer", "organiser"] as const).map((r) => (
                    <Button
                      key={r}
                      type="button"
                      variant={role === r ? "default" : "secondary"}
                      className="flex-1 capitalize"
                      onClick={() => setRole(r)}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              </div>
              <Button className="w-full" disabled={busy}>
                Create account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  set,
  type = "text",
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => set(e.target.value)} required />
    </div>
  );
}
