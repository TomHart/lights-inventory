import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Lightbulb } from "lucide-react";

const PENDING_VERIFICATION_KEY = "__lightsInventoryPendingVerification";
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as
  | string
  | undefined;

/** Load the reCAPTCHA v3 script once and resolve when ready. */
let recaptchaReady: Promise<void> | null = null;
function ensureRecaptchaLoaded(): Promise<void> {
  if (!RECAPTCHA_SITE_KEY) return Promise.resolve();
  if (recaptchaReady) return recaptchaReady;
  recaptchaReady = new Promise<void>((resolve) => {
    if ((window as any).grecaptcha?.ready) {
      (window as any).grecaptcha.ready(() => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.onload = () =>
      (window as any).grecaptcha.ready(() => resolve());
    document.head.appendChild(script);
  });
  return recaptchaReady;
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
  ssr: false,
});

function LoginPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return <LoginContent />;
}

function LoginContent() {
  const navigate = useNavigate();

  const startVerification = (email: string) => {
    sessionStorage.setItem(PENDING_VERIFICATION_KEY, email);
    navigate({ to: "/verify" });
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Lightbulb className="mx-auto h-10 w-10 text-amber-500 mb-2" />
          <CardTitle className="text-2xl">Lights Inventory</CardTitle>
          <CardDescription>
            Track and manage all the lights across your properties
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <AuthForm
                flow="signIn"
                onVerificationNeeded={startVerification}
              />
            </TabsContent>
            <TabsContent value="signup">
              <AuthForm
                flow="signUp"
                onVerificationNeeded={startVerification}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function AuthForm({
  flow,
  onVerificationNeeded,
}: {
  flow: "signIn" | "signUp";
  onVerificationNeeded: (email: string) => void;
}) {
  const { signIn } = useAuthActions();
  const verifyRecaptcha = useAction(api.recaptcha.verify);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Eagerly load the reCAPTCHA script when the form mounts
  useEffect(() => {
    void ensureRecaptchaLoaded();
  }, []);

  const getRecaptchaToken = useCallback(
    async (action: string): Promise<string> => {
      if (!RECAPTCHA_SITE_KEY) return "";
      await ensureRecaptchaLoaded();
      return (window as any).grecaptcha.execute(RECAPTCHA_SITE_KEY, {
        action,
      });
    },
    [],
  );

  const passwordStrength = useMemo(() => {
    if (flow !== "signUp" || password.length === 0) return null;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 1) return { label: "Weak", colour: "bg-red-500", width: "w-1/5" };
    if (score === 2) return { label: "Fair", colour: "bg-orange-500", width: "w-2/5" };
    if (score === 3) return { label: "Good", colour: "bg-yellow-500", width: "w-3/5" };
    if (score === 4) return { label: "Strong", colour: "bg-green-500", width: "w-4/5" };
    return { label: "Very strong", colour: "bg-green-600", width: "w-full" };
  }, [password, flow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (flow === "signUp" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      // --- reCAPTCHA verification ---
      const recaptchaToken = await getRecaptchaToken(flow);
      if (recaptchaToken) {
        await verifyRecaptcha({ token: recaptchaToken });
      }

      const result = await signIn("password", { email, password, flow });
      // If signingIn is false and no error, verification code was sent
      if (!(result as any)?.signingIn) {
        onVerificationNeeded(email);
      }
    } catch (err: any) {
      const msg = (err?.message ?? "").toLowerCase();
      if (msg.includes("recaptcha")) {
        setError("reCAPTCHA verification failed. Please try again.");
      } else if (
        msg.includes("invalidaccountid") ||
        msg.includes("invalid") ||
        msg.includes("could not find") ||
        msg.includes("incorrect") ||
        msg.includes("credentials")
      ) {
        setError("Invalid email or password. Please try again.");
      } else if (msg.includes("too many") || msg.includes("rate")) {
        setError("Too many attempts. Please wait a moment and try again.");
      } else {
        setError("Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor={`${flow}-email`}>Email</Label>
        <Input
          id={`${flow}-email`}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${flow}-password`}>Password</Label>
        <Input
          id={`${flow}-password`}
          type="password"
          placeholder={flow === "signUp" ? "At least 8 characters" : "Enter your password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={flow === "signUp" ? 8 : 6}
        />
        {passwordStrength && (
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${passwordStrength.colour} ${passwordStrength.width}`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Password strength: {passwordStrength.label}
            </p>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading
          ? "Please wait..."
          : flow === "signIn"
            ? "Sign In"
            : "Create Account"}
      </Button>
    </form>
  );
}
