"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as SidebarModule from "@/components/ui/sidebar";
import { Phone } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

interface SidebarMenuClientProps {
  connectedNumbers: { id: string; name: string; number: string }[];
}

export function SidebarMenuClient({ connectedNumbers }: SidebarMenuClientProps) {
  const searchParams = useSearchParams();
  const selectedNumber = searchParams.get("number");
  const { state } = useSidebar();

  // Função para formatar o número no padrão solicitado
  function formatPhoneNumber(number: string) {
    // Remove caracteres não numéricos
    const digits = number.replace(/\D/g, "");
    // Pega DDI (2 primeiros), DDD (2 seguintes), 4 primeiros e 4 últimos dígitos
    const ddi = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const first = digits.slice(4, 8);
    const last = digits.slice(-4);
    // Monta o formato
    return `+${ddi} ${ddd} ${first}-${last}`;
  }

  return (
    <>
      {connectedNumbers.map((num) => (
        <SidebarModule.SidebarMenuItem key={num.id}>
          <SidebarModule.SidebarMenuButton
            asChild
            tooltip={num.number}
            className={""}
          >
            <Link href={`/dashboard?number=${encodeURIComponent(num.id)}`}>
              {state === "collapsed" ? (
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 ml-2" />
              ) : (
                <span className="flex items-center pl-4">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  <span className="ml-2">{num.name}</span>
                </span>
              )}
            </Link>
          </SidebarModule.SidebarMenuButton>
        </SidebarModule.SidebarMenuItem>
      ))}
    </>
  );
} 