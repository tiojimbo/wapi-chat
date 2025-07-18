import React, { useEffect, useState, useRef } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Check, CheckCheck, CircleX, CircleAlert, X, ExternalLink } from "lucide-react";

interface Message {
  id: string;
  wamid: string;
  type: string;
  from_number: string;
  to_number: string;
  timestamp: string;
  text_body?: string;
  media_url?: string;
  status?: string;
}

interface ContextData {
  type: 'projeto' | 'prospect';
  id: string;
  name: string;
  description?: string;
  status?: any;
  url?: string;
  space?: string;
  folder?: string;
  list?: string;
}

interface ContextLookupResponse {
  success: boolean;
  conversationId: string;
  isGroup: boolean;
  searchType: string;
  searchValue: string;
  targetLocation: string;
  contextData: ContextData | null;
  message: string;
}

interface ChatWindowProps {
  conversationId: string;
  contactName?: string;
  contactAvatarUrl?: string;
  sessionId?: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ conversationId, contactName, contactAvatarUrl, sessionId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [contactWaId, setContactWaId] = useState<string | null>(null);
  const [myPhoneNumber, setMyPhoneNumber] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Estados para sidebar de contexto ClickUp
  const [showContextSidebar, setShowContextSidebar] = useState(false);
  const [contextData, setContextData] = useState<ContextLookupResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  // Função para buscar dados contextuais do ClickUp
  const handleContextLookup = async () => {
    if (!conversationId || !sessionId) return;
    
    setContextLoading(true);
    setContextData(null);
    setShowContextSidebar(true);
    
    try {
      const response = await fetch('/api/whatsapp/context-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          sessionId
        })
      });
      
      const data = await response.json();
      setContextData(data);
    } catch (error) {
      console.error('Erro ao buscar dados contextuais:', error);
      setContextData({
        success: false,
        conversationId,
        isGroup: false,
        searchType: 'erro',
        searchValue: '',
        targetLocation: '',
        contextData: null,
        message: 'Erro ao buscar dados contextuais'
      });
    } finally {
      setContextLoading(false);
    }
  };

  // Função para executar sincronização do ClickUp
  const handleSyncClickUp = async () => {
    setSyncLoading(true);
    try {
      const response = await fetch('/api/whatsapp/sync-clickup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      if (result.success) {
        alert('Sincronização do ClickUp executada com sucesso! Tente novamente a busca contextual.');
      } else {
        alert('Erro na sincronização: ' + result.error);
      }
    } catch (error) {
      console.error('Erro ao executar sincronização:', error);
      alert('Erro ao executar sincronização do ClickUp');
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    if (!conversationId || !sessionId) return;
    setLoading(true);
    setError(null);
    
    // Buscar mensagens, detalhes da conversa e informações da sessão
    Promise.all([
      fetch(`/api/whatsapp/conversations/${conversationId}/messages`),
      fetch(`/api/whatsapp/conversations/${conversationId}`),
      fetch(`/api/whatsapp/sessions/${sessionId}`)
    ])
      .then(async ([messagesRes, conversationRes, sessionRes]) => {
        if (!messagesRes.ok) throw new Error('Erro ao buscar histórico');
        if (!conversationRes.ok) throw new Error('Erro ao buscar detalhes da conversa');
        
        const messagesData = await messagesRes.json();
        const conversationData = await conversationRes.json();
        
        setMessages(messagesData.messages || []);
        setContactWaId(conversationData.conversation?.whatsapp_contacts?.wa_id || null);
        
        // Buscar número da sessão para identificar mensagens próprias
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          console.log('Session data received:', sessionData);
          // Extrair apenas o número do telefone (remover @s.whatsapp.net e outros sufixos)
          const phoneNumber = sessionData.phone ? sessionData.phone.split(':')[0].replace(/[^0-9]/g, '') : null;
          console.log('Extracted phone number:', phoneNumber);
          setMyPhoneNumber(phoneNumber);
        } else {
          console.error('Session request failed:', sessionRes.status, sessionRes.statusText);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [conversationId, sessionId]);

  useEffect(() => {
    // Temporarily disabled auto-scroll to prevent page scroll issues
    // Will be re-enabled with proper container scrolling
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() && !file) return;
    
    if (!sessionId || !contactWaId) {
      setError('Informações da sessão ou contato não disponíveis');
      return;
    }
    
    if (!conversationId) {
      setError('ID da conversa não disponível');
      return;
    }
    
    setSending(true);
    setError(null);
    
    try {
      // Criar JID do contato (adicionar @s.whatsapp.net se necessário)
      const jid = contactWaId.includes('@') ? contactWaId : `${contactWaId}@s.whatsapp.net`;
      
      // Criar mensagem otimista (mostrar imediatamente)
      const tempMessage: Message = {
        id: Math.random().toString(),
        wamid: 'temp-' + Date.now(),
        type: file ? 'document' : 'text',
        from_number: 'me',
        to_number: contactWaId,
        timestamp: new Date().toISOString(),
        text_body: input,
        media_url: file ? URL.createObjectURL(file) : undefined,
        status: 'sending'
      };
      
      setMessages((prev) => [...prev, tempMessage]);
      
      const requestBody = {
        sessionId,
        jid,
        message: input,
        conversationId, // Include the current conversation ID
        options: file ? { media: file } : undefined
      };
      
      // Enviar mensagem para o backend
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        console.error('Backend error response:', result);
        throw new Error(result.error || `HTTP ${response.status}: Erro ao enviar mensagem`);
      }
      
      // Atualizar mensagem com status de sucesso
      setMessages((prev) => prev.map(msg => 
        msg.id === tempMessage.id 
          ? { ...msg, status: 'sent', wamid: result.result?.key?.id || msg.wamid }
          : msg
      ));
      
      setInput('');
      setFile(null);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      setError('Erro ao enviar mensagem');
      
      // Atualizar mensagem com status de erro
      setMessages((prev) => prev.map(msg => 
        msg.wamid.startsWith('temp-') 
          ? { ...msg, status: 'error' }
          : msg
      ));
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full h-full flex bg-white dark:bg-[#18181B]">
      {/* Área principal de chat */}
      <div className="flex-1 flex flex-col">
        {/* Header do chat com nome do contato e botão ClickUp */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white dark:bg-[#18181B] border-gray-200 dark:border-[#2D2D30]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg uppercase bg-gray-500">
              {contactName
                ? contactName.split(' ').map(n => n[0]).join('').slice(0,2)
                : 'U'}
            </div>
            <div>
              <h2 className="font-medium text-gray-900 dark:text-white">
                {contactName || 'Contato'}
              </h2>
              {contactWaId && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {contactWaId.replace('@s.whatsapp.net', '').replace('@g.us', '')}
                </p>
              )}
            </div>
          </div>
          
          <button
            onClick={handleContextLookup}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Buscar dados no ClickUp"
          >
            <CircleAlert size={20} className="text-orange-500" />
          </button>
        </div>
        
        {/* Área de mensagens */}
        <div className="flex-1 min-h-0">
        <ScrollArea className="h-full px-6 py-4">
          <div className="flex flex-col gap-2">
            {loading && <div className="text-center text-gray-400">Carregando mensagens...</div>}
            {error && <div className="text-center text-red-500">{error}</div>}
            {!loading && !error && messages.length === 0 && (
              <div className="text-center text-gray-400">Nenhuma mensagem encontrada.</div>
            )}
            {messages.map((msg) => {
              // Determinar se a mensagem é minha
              // Lógica: se from_number é 'me' (mensagem otimista) OU
              // se from_number não é o contactWaId (então é minha mensagem)
              const contactNumber = contactWaId ? contactWaId.replace(/[^0-9]/g, '') : null;
              const isMyMessage = msg.from_number === 'me' || 
                (contactNumber && msg.from_number !== contactNumber);
              
              console.log('Message debug:', {
                wamid: msg.wamid,
                from_number: msg.from_number,
                contactNumber,
                contactWaId,
                isMyMessage,
                text: msg.text_body
              });
              
              return (
                <div
                  key={msg.id || msg.wamid}
                  className={`max-w-[70%] px-4 py-2 rounded-lg shadow-sm text-sm mb-2 whitespace-pre-line ${isMyMessage ? 'self-end bg-blue-100 dark:bg-blue-900 dark:text-white' : 'self-start bg-gray-100 dark:bg-gray-700 dark:text-white'}`}
                >
                {msg.type === 'text' && <span>{msg.text_body}</span>}
                {msg.type === 'image' && msg.media_url && (
                  <img src={msg.media_url} alt="imagem" className="max-w-xs max-h-60 rounded" />
                )}
                {msg.type === 'video' && msg.media_url && (
                  <video controls className="max-w-xs max-h-60 rounded">
                    <source src={msg.media_url} type="video/mp4" />
                    Seu navegador não suporta vídeo.
                  </video>
                )}
                {msg.type === 'audio' && msg.media_url && (
                  <audio controls className="w-full">
                    <source src={msg.media_url} type="audio/ogg" />
                    Seu navegador não suporta áudio.
                  </audio>
                )}
                {msg.type === 'sticker' && msg.media_url && (
                  <img src={msg.media_url} alt="sticker" className="max-w-[120px] max-h-[120px] rounded" />
                )}
                {msg.type === 'document' && msg.media_url && (
                  <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline flex items-center gap-1">
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Documento
                  </a>
                )}
                {/* Placeholder para tipos desconhecidos */}
                {['unknown', undefined, null].includes(msg.type) && (
                  <span className="italic text-gray-400">[Mídia não suportada]</span>
                )}
                <div className="text-xs text-gray-400 mt-1 text-right flex items-center gap-1 justify-end">
                  {new Date(msg.timestamp).toLocaleString()}
                  {msg.status === 'sending' && <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin ml-1" />}
                  {msg.status === 'sent' && <Check size={16} className="text-blue-500 ml-1" />}
                  {msg.status === 'read' && <CheckCheck size={16} className="text-green-500 ml-1" />}
                  {msg.status === 'error' && <CircleX size={16} className="text-red-500 ml-1" />}
                </div>
              </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        </div>
        
        {/* Campo de envio */}
        <form
        className="flex items-center gap-2 px-6 py-4 border-t bg-white dark:bg-[#18181B] border-gray-200 dark:border-[#2D2D30] justify-center"
        onSubmit={e => {
          e.preventDefault();
          handleSend();
        }}
      >
        <label className="cursor-pointer">
          <input type="file" className="hidden" onChange={handleFileChange} />
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3 3 0 114.24 4.24l-9.19 9.19a1 1 0 01-1.41-1.41l9.19-9.19" /></svg>
          </span>
        </label>
        <input
          type="text"
          className="flex-1 px-4 py-2 rounded bg-[#F3F4F6] focus:outline-none focus:ring-2 focus:ring-[#59C29D] placeholder:text-gray-400 dark:bg-[#232326] dark:text-white"
          placeholder="Digite uma mensagem..."
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          className="w-10 h-10 rounded-full font-semibold text-white disabled:opacity-50 flex items-center justify-center p-0"
          style={{ background: '#59C29D' }}
          onMouseOver={e => (e.currentTarget.style.background = '#4ea885')}
          onMouseOut={e => (e.currentTarget.style.background = '#59C29D')}
          disabled={sending || (!input.trim() && !file)}
        >
          <Send size={20} className="-translate-x-px" />
        </button>
        </form>
      </div>
      
      {/* Sidebar de contexto ClickUp */}
      {showContextSidebar && (
        <div className="w-96 border-l bg-white dark:bg-[#18181B] border-gray-200 dark:border-[#2D2D30] flex flex-col">
          {/* Header da sidebar */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#2D2D30]">
            <h3 className="font-medium text-gray-900 dark:text-white">Dados ClickUp</h3>
            <button
              onClick={() => setShowContextSidebar(false)}
              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <X size={20} />
            </button>
          </div>
          
          {/* Conteúdo da sidebar */}
          <div className="flex-1 p-4 overflow-auto">
            {contextLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-3 text-sm">Buscando dados...</span>
              </div>
            ) : contextData ? (
              <div className="space-y-4">
                {/* Informações de detecção */}
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <h4 className="font-medium mb-2 text-sm">Detecção Automática</h4>
                  <div className="text-xs space-y-1">
                    <p><strong>Tipo:</strong> {contextData.isGroup ? 'Grupo (Projeto)' : 'Conversa Direta (Prospect)'}</p>
                    <p><strong>Busca em:</strong> {contextData.targetLocation}</p>
                    <p><strong>Valor buscado:</strong> {contextData.searchValue}</p>
                    {(contextData as any).debug && (
                      <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                        <p><strong>Debug:</strong></p>
                        <p>Spaces: {(contextData as any).debug.spacesInDB} | Lists: {(contextData as any).debug.listsInDB} | Tasks: {(contextData as any).debug.tasksInDB}</p>
                        {(contextData as any).debug.sampleSpaces?.length > 0 && (
                          <p>Spaces: {(contextData as any).debug.sampleSpaces.join(', ')}</p>
                        )}
                        {(contextData as any).debug.sampleLists?.length > 0 && (
                          <p>Lists: {(contextData as any).debug.sampleLists.join(', ')}</p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Botão de sincronização se não há tasks */}
                  {(contextData as any).debug?.tasksInDB === 0 && (
                    <div className="mt-3">
                      <button
                        onClick={handleSyncClickUp}
                        disabled={syncLoading}
                        className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded disabled:opacity-50"
                      >
                        {syncLoading ? 'Sincronizando...' : 'Sincronizar ClickUp'}
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Resultado da busca */}
                {contextData.contextData ? (
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="font-medium text-green-800 dark:text-green-200 text-sm">
                        {contextData.contextData.type === 'projeto' ? '🏗️ Projeto Encontrado' : '👤 Prospect Encontrado'}
                      </h4>
                      {contextData.contextData.url && (
                        <a
                          href={contextData.contextData.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
                        >
                          <ExternalLink size={12} />
                          Abrir
                        </a>
                      )}
                    </div>
                    
                    <div className="space-y-2 text-xs">
                      <p><strong>Nome:</strong> {contextData.contextData.name}</p>
                      {contextData.contextData.description && (
                        <p><strong>Descrição:</strong> {contextData.contextData.description}</p>
                      )}
                      <p><strong>ID:</strong> {contextData.contextData.id}</p>
                      <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                        <p>Space: {contextData.contextData.space}</p>
                        <p>Folder: {contextData.contextData.folder}</p>
                        <p>List: {contextData.contextData.list}</p>
                      </div>
                      {contextData.contextData.status && (
                        <div className="mt-2">
                          <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                            Status: {typeof contextData.contextData.status === 'object' ? contextData.contextData.status.status || 'N/A' : contextData.contextData.status}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2 text-sm">
                      🔍 {contextData.searchType === 'projeto' ? 'Projeto' : 'Item'} Não Encontrado
                    </h4>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      {contextData.message}
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                      Verifique se existe uma task em "{contextData.targetLocation}" com o {contextData.isGroup ? 'ID do grupo' : 'número WhatsApp'} nos campos personalizados.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                Erro ao carregar dados contextuais
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWindow; 