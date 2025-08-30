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
    navigate("/");
  };

  return (
    <AuthForm 
      mode={mode} 
      onSuccess={handleSuccess} 
      onModeChange={setMode} 
    />
  );
}
