"use client";
import { useEffect } from "react";
import { useSocket } from "@/hooks/use-socket";
import { useSocketRoom } from "@/hooks/use-socket";
import { useSocketNotification } from "@/hooks/use-socket";

export default function DashboardPage() {
  // Exemplo: entrar automaticamente em uma room de conversa (ID fictício)
  useSocketRoom("conversa-123");
  const notification = useSocketNotification();
  // O socket já está disponível via useSocket() para integrações reais
  // Exemplo de uso removido para evitar logs desnecessários
  return (
    <div className="w-full">
      {notification && (
        <div className="bg-green-100 border border-green-400 text-green-800 px-4 py-2 rounded mb-4">
          <strong>Notificação:</strong> {notification.message || JSON.stringify(notification)}
        </div>
      )}
      <h1 className="text-2xl font-bold mb-4">Bem-vindo ao Painel Principal</h1>
      <p>Escolha uma opção no menu lateral para começar.</p>
    </div>
  );
} 