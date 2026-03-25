import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, LogOut } from "lucide-react";
import { toast } from "sonner";

interface MfaVerifyProps {
  factorId: string;
  onVerified: () => void;
  onSignOut: () => void;
}

export function MfaVerify({ factorId, onVerified, onSignOut }: MfaVerifyProps) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;

    setIsVerifying(true);
    performance.mark("mfa:verify:start");
    try {
      performance.mark("mfa:challenge:start");
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      performance.mark("mfa:challenge:end");
      try { performance.measure("mfa:challenge", "mfa:challenge:start", "mfa:challenge:end"); } catch {}

      if (challengeError) throw challengeError;

      performance.mark("mfa:verify-code:start");
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });
      performance.mark("mfa:verify-code:end");
      try { performance.measure("mfa:verify-code", "mfa:verify-code:start", "mfa:verify-code:end"); } catch {}

      if (verifyError) throw verifyError;

      performance.mark("mfa:verify:done");
      try { performance.measure("mfa:verify-total", "mfa:verify:start", "mfa:verify:done"); } catch {}

      toast.success("Verificação MFA concluída!");
      onVerified();
    } catch (err) {
      toast.error("Código inválido", {
        description: "Verifique o código no seu aplicativo autenticador e tente novamente.",
      });
      setCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-primary">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle>Verificação em 2 Fatores</CardTitle>
          <CardDescription>
            Digite o código de 6 dígitos do seu aplicativo autenticador para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Código TOTP</Label>
              <Input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="text-center text-2xl tracking-[0.5em] font-mono"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={code.length !== 6 || isVerifying}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Verificar"
              )}
            </Button>
          </form>

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Voltar ao login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
