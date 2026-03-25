import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MfaEnroll } from "@/components/auth/MfaEnroll";
import { MfaVerify } from "@/components/auth/MfaVerify";
import { Loader2 } from "lucide-react";

type MfaStep = "loading" | "enroll" | "verify";

export default function MfaChallenge() {
  const navigate = useNavigate();
  const { signOut, clearMfaRequired } = useAuth();
  const [step, setStep] = useState<MfaStep>("loading");
  const [factorId, setFactorId] = useState<string>("");

  useEffect(() => {
    performance.mark("mfa:page:mount");
    checkMfaStatus();
  }, []);

  const checkMfaStatus = async () => {
    try {
      performance.mark("mfa:listFactors:start");
      const { data, error } = await supabase.auth.mfa.listFactors();
      performance.mark("mfa:listFactors:end");
      try { performance.measure("mfa:listFactors", "mfa:listFactors:start", "mfa:listFactors:end"); } catch {}
      if (error) throw error;

      const verifiedFactors = data.totp.filter((f) => f.status === "verified");

      if (verifiedFactors.length > 0) {
        setFactorId(verifiedFactors[0].id);
        setStep("verify");
      } else {
        setStep("enroll");
      }
      performance.mark("mfa:page:ready");
      try { performance.measure("mfa:page-load", "mfa:page:mount", "mfa:page:ready"); } catch {}
    } catch (err) {
      console.error("[MFA] Error checking factors:", err);
      setStep("enroll");
    }
  };

  const handleComplete = () => {
    performance.mark("mfa:complete");
    try { performance.measure("mfa:full-flow", "mfa:page:mount", "mfa:complete"); } catch {}
    // Clear the mfaRequired flag so ProtectedRoute won't redirect back here
    clearMfaRequired();
    navigate("/home", { replace: true });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (step === "enroll") {
    return <MfaEnroll onEnrolled={handleComplete} />;
  }

  return (
    <MfaVerify
      factorId={factorId}
      onVerified={handleComplete}
      onSignOut={handleSignOut}
    />
  );
}
