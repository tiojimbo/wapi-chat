import React, { useState, useEffect } from 'react';
import { useSession } from '@supabase/auth-helpers-react';
import { ScrollArea } from "@/components/ui/scroll-area";

interface Conversation {
  id: string;
  whatsapp_contacts: { profile_name: string; wa_id: string };
  last_message_preview: string;
  last_message_at: string;
  unread_count: number;
}

interface ConversationListProps {
  sessionId: string;
  onSelectConversation?: (conv: Conversation) => void;
  selectedConversationId?: string;
}

export function ConversationList({ sessionId, onSelectConversation, selectedConversationId }: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConversations() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ sessionId });
        if (search) params.append('q', search);
        const res = await fetch(`/api/whatsapp/conversations?${params.toString()}`);
        if (!res.ok) throw new Error('Erro ao buscar conversas');
        const data = await res.json();
        setConversations(data.conversations || []);
      } catch (err: any) {
        setError(err.message || 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    }
    fetchConversations();
  }, [search, sessionId]);

  return (
    <aside className="w-80 border-r bg-white dark:bg-[#18181B] flex flex-col h-full min-h-screen">
      <div className="p-4 border-b">
        <input
          type="text"
          placeholder="Pesquisar conversa"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded bg-gray-100 dark:bg-[#18181b] border focus:outline-none focus:ring-2 focus:ring-[#59C29D]"
        />
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">Carregando...</div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-red-500">{error}</div>
      ) : (
        <ScrollArea className="flex-1 h-full">
          <ul className="min-h-0">
            {conversations.length === 0 && (
              <li className="text-center text-gray-400 py-8">Nenhuma conversa encontrada</li>
            )}
            {conversations.map(conv => (
              <li
                key={conv.id}
                className={`flex items-center gap-3 px-4 py-3 border-b hover:bg-gray-50 dark:hover:bg-[#18181b] cursor-pointer ${selectedConversationId === conv.id ? 'bg-gray-100 dark:bg-[#232326] font-bold' : ''}`}
                onClick={() => onSelectConversation?.(conv)}
              >
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-lg uppercase">
                  {conv.whatsapp_contacts?.profile_name
                    ? conv.whatsapp_contacts.profile_name.split(' ').map(n => n[0]).join('').slice(0,2)
                    : 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="font-medium truncate text-sm">{conv.whatsapp_contacts?.profile_name || conv.whatsapp_contacts?.wa_id || 'Contato'}</span>
                    <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                      {conv.last_message_at ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-500 truncate max-w-[140px]">{conv.last_message_preview}</span>
                    {conv.unread_count > 0 && (
                      <span className="ml-2 bg-pink-400 text-white rounded-full px-2 py-0.5 text-xs font-bold">{conv.unread_count}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </aside>
  );
} 