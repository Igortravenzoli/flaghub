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
    checkMfaStatus();
  }, []);

  const checkMfaStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const verifiedFactors = data.totp.filter((f) => f.status === "verified");

      if (verifiedFactors.length > 0) {
        setFactorId(verifiedFactors[0].id);
        setStep("verify");
      } else {
        setStep("enroll");
      }
    } catch (err) {
      console.error("[MFA] Error checking factors:", err);
      setStep("enroll");
    }
  };

  const handleComplete = () => {
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
