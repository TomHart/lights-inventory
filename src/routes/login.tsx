import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { Lightbulb } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { userMessage } from "#/lib/errors";
import { passwordStrength as scorePassword } from "#/lib/password-strength";

// Type definition for Google reCAPTCHA Enterprise
declare global {
  interface Window {
    grecaptcha?: {
      enterprise?: {
        ready: (callback: () => void) => void;
        execute: (
          siteKey: string | undefined,
          options: { action: string },
        ) => Promise<string>;
      };
    };
  }
}

const PENDING_VERIFICATION_KEY = "__lightsInventoryPendingVerification";
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as
  | string
  | undefined;

/** Load the reCAPTCHA Enterprise script once and resolve when ready. */
let recaptchaReady: Promise<void> | null = null;
function ensureRecaptchaLoaded(): Promise<void> {
  if (recaptchaReady) return recaptchaReady;
  recaptchaReady = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      recaptchaReady = null;
      reject(new Error("reCAPTCHA timed out"));
    }, 15_000);
    const ready = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    const grecaptcha = window.grecaptcha?.enterprise;
    if (grecaptcha?.ready) {
      grecaptcha.ready(ready);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      recaptchaReady = null;
    };
    script.onload = () => {
      const grecaptcha = window.grecaptcha?.enterprise;
      if (!grecaptcha?.ready) {
        recaptchaReady = null;
        return;
      }

      grecaptcha.ready(ready);
    };
    document.head.appendChild(script);
  });
  return recaptchaReady;
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Eagerly load the reCAPTCHA script when the form mounts
  useEffect(() => {
    void ensureRecaptchaLoaded().catch(() =>
      setError("Unable to load reCAPTCHA. Check your connection and retry."),
    );
  }, []);

  const getRecaptchaToken = useCallback(
    async (action: string): Promise<string> => {
      await ensureRecaptchaLoaded();
      const grecaptcha = window.grecaptcha?.enterprise;
      if (!grecaptcha?.execute) {
        throw new Error("reCAPTCHA is not available.");
      }

      return grecaptcha.execute(RECAPTCHA_SITE_KEY, {
        action,
      });
    },
    [],
  );

  const passwordStrength = flow === "signUp" ? scorePassword(password) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (flow === "signUp" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      // Always verify server-side when reCAPTCHA is enabled; local development can bypass it.
      const recaptchaToken = await getRecaptchaToken(flow);
      const result = await signIn("password", {
        email,
        password,
        flow,
        recaptchaToken,
      });
      // If signingIn is false and no error, verification code was sent
      if (!("signingIn" in result) || !result.signingIn) {
        onVerificationNeeded(email);
      }
    } catch (err: unknown) {
      setError(
        userMessage(
          err,
          "Authentication failed. Check your credentials and try again.",
        ),
      );
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
          placeholder={
            flow === "signUp" ? "At least 8 characters" : "Enter your password"
          }
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
