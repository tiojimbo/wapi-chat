"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const logout = async () => {
      await supabase.auth.signOut();
      router.push("/login");
    };
    logout();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-6">Saindo...</h1>
        <p>Você está sendo desconectado.</p>
      </div>
    </div>
  );
} 