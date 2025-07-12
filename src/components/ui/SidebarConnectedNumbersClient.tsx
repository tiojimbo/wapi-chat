"use client";
import { useEffect, useState } from "react";
import { SidebarMenuClient } from "@/components/ui/SidebarMenuClient";

export function SidebarConnectedNumbersClient() {
  const [connectedNumbers, setConnectedNumbers] = useState<any[]>([]);
  useEffect(() => {
    let stopped = false;
    const fetchNumbers = async () => {
      try {
        const res = await fetch("/api/whatsapp/sessions");
        if (res.ok) {
          const data = await res.json();
          setConnectedNumbers(
            (data.sessions || []).map((s: any) => ({
              id: s.id,
              name: s.name || s.id,
              number: s.phone ? s.phone.replace(/[:@].*$/, "") : s.id,
            }))
          );
        }
      } catch {}
    };
    fetchNumbers();
    const interval = setInterval(() => {
      if (!stopped) fetchNumbers();
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);
  if (connectedNumbers.length === 0) return null;
  return <SidebarMenuClient connectedNumbers={connectedNumbers} />;
} 