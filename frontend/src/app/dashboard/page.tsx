"use client";
import { useState, useEffect } from "react";
import { useSession } from '@supabase/auth-helpers-react';
import { ConversationList } from '@/components/ConversationList';
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import ChatWindow from '@/components/ChatWindow';

export default function DashboardPage() {
  const session = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectedSessions, setConnectedSessions] = useState<any[]>([]);

  // Buscar sessões conectadas do backend
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch("/api/whatsapp/sessions");
        if (res.ok) {
          const data = await res.json();
          setConnectedSessions(data.sessions || []);
        }
      } catch {}
    };
    fetchSessions();
  }, []);

  useEffect(() => {
    // Tenta pegar o sessionId da URL (parâmetro 'number' é o id da sessão)
    const urlSessionId = searchParams.get("number");
    if (urlSessionId) {
      setSessionId(urlSessionId);
    } else if (connectedSessions.length > 0) {
      // Se não houver na URL, usa o primeiro conectado
      setSessionId(connectedSessions[0].id);
      // Atualiza a URL para refletir a sessão selecionada
      router.replace(`/dashboard?number=${encodeURIComponent(connectedSessions[0].id)}`);
    } else if (session?.user?.id) {
      setSessionId(session.user.id);
    } else {
      setSessionId('teste');
    }
  }, [searchParams, connectedSessions, session, router]);

  return (
    <div className="flex h-full -mt-8 -ml-8 mr-0">
      {sessionId && (
        <ConversationList
          sessionId={sessionId}
          onSelectConversation={setSelectedConversation}
          selectedConversationId={selectedConversation?.id}
        />
      )}
      <div className="flex-1 min-w-0 h-full flex flex-col">
        {selectedConversation ? (
          <ChatWindow
            conversationId={selectedConversation.id}
            contactName={selectedConversation.whatsapp_contacts?.profile_name || selectedConversation.whatsapp_contacts?.wa_id}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">Selecione uma conversa</div>
        )}
      </div>
    </div>
  );
} 