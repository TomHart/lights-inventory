import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState, useEffect } from "react";
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
import { Mail, ArrowLeft } from "lucide-react";

const PENDING_VERIFICATION_KEY = "__lightsInventoryPendingVerification";

export const Route = createFileRoute("/verify")({
  component: VerifyPage,
  ssr: false,
});

function VerifyPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  const pendingEmail =
    typeof window !== "undefined"
      ? sessionStorage.getItem(PENDING_VERIFICATION_KEY)
      : null;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Verification succeeded — clear storage and go to dashboard
      sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
      navigate({ to: "/" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !pendingEmail) {
      // No pending verification — send back to login
      navigate({ to: "/login" });
    }
  }, [isLoading, isAuthenticated, pendingEmail, navigate]);

  if (isLoading || isAuthenticated || !pendingEmail) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Mail className="mx-auto h-10 w-10 text-primary mb-2" />
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            We sent a verification code to{" "}
            <span className="font-medium text-foreground">{pendingEmail}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VerifyForm email={pendingEmail} />
        </CardContent>
      </Card>
    </div>
  );
}

function VerifyForm({ email }: { email: string }) {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn("password", {
        email,
        code,
        flow: "email-verification",
      });
      // On success the user becomes authenticated —
      // the useEffect in VerifyPage will redirect to /
    } catch (err: any) {
      setError(
        err?.message || "Invalid or expired code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError("");
    setResent(false);
    try {
      await signIn("password", {
        email,
        flow: "signIn",
      });
      setResent(true);
    } catch {
      setError("Please go back and sign in again to receive a new code.");
    } finally {
      setResending(false);
    }
  };

  const handleBack = () => {
    sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
    navigate({ to: "/login" });
  };

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="verification-code">Verification Code</Label>
        <Input
          id="verification-code"
          type="text"
          inputMode="numeric"
          placeholder="Enter the code from your email"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {resent && (
        <p className="text-sm text-green-600 dark:text-green-400">
          A new code has been sent to your email.
        </p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Verifying..." : "Verify Email"}
      </Button>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={handleResend}
          disabled={resending}
        >
          {resending ? "Sending..." : "Resend code"}
        </Button>
      </div>
    </form>
  );
}
