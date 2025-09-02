import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AuthForm } from "@/components/auth/auth-form";
import { isAuthenticated } from "@/lib/auth";

export default function Login() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");

  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/");
    }
  }, [navigate]);

  const handleSuccess = () => {
    // Force a page reload to ensure authentication state is properly checked
    window.location.href = "/";
  };

  return (
    <AuthForm 
      mode={mode} 
      onSuccess={handleSuccess} 
      onModeChange={setMode} 
    />
  );
}
