import React, { useEffect, useState, useRef } from 'react';

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

interface ChatWindowProps {
  conversationId: string;
  contactName?: string;
  contactAvatarUrl?: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ conversationId, contactName, contactAvatarUrl }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/whatsapp/conversations/${conversationId}/messages`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Erro ao buscar histórico');
        const data = await res.json();
        setMessages(data.messages || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() && !file) return;
    setSending(true);
    // Aqui você pode implementar o envio real para o backend
    // Exemplo: await fetch('/api/whatsapp/send', ...)
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          wamid: '',
          type: file ? 'document' : 'text',
          from_number: 'me',
          to_number: '',
          timestamp: new Date().toISOString(),
          text_body: input,
          media_url: file ? URL.createObjectURL(file) : undefined,
        },
      ]);
      setInput('');
      setFile(null);
      setSending(false);
    }, 500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white border overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-gray-50">
        {contactAvatarUrl ? (
          <img src={contactAvatarUrl} alt={contactName} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center text-lg font-bold text-green-900">
            {contactName ? contactName[0].toUpperCase() : '?'}
          </div>
        )}
        <span className="font-semibold text-lg">{contactName || 'Contato'}</span>
      </div>
      {/* Área de mensagens */}
      <div className="flex-1 flex flex-col gap-2 px-6 py-4 overflow-y-auto min-h-0">
        {loading && <div className="text-center text-gray-400">Carregando mensagens...</div>}
        {error && <div className="text-center text-red-500">{error}</div>}
        {!loading && !error && messages.length === 0 && (
          <div className="text-center text-gray-400">Nenhuma mensagem encontrada.</div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id || msg.wamid}
            className={`max-w-[70%] px-4 py-2 rounded-lg shadow-sm text-sm mb-2 whitespace-pre-line ${msg.from_number === 'me' ? 'self-end bg-blue-100' : 'self-start bg-gray-100'}`}
          >
            {msg.type === 'text' && <span>{msg.text_body}</span>}
            {msg.type === 'image' && msg.media_url && (
              <img src={msg.media_url} alt="imagem" className="max-w-xs max-h-60 rounded" />
            )}
            {msg.type === 'document' && msg.media_url && (
              <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Documento</a>
            )}
            <div className="text-xs text-gray-400 mt-1 text-right">{new Date(msg.timestamp).toLocaleString()}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {/* Campo de envio */}
      <form
        className="flex items-center gap-2 px-6 py-4 border-t bg-white"
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
          className="flex-1 px-4 py-2 rounded border bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
          placeholder="Digite uma mensagem..."
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          className="ml-2 px-5 py-2 rounded bg-blue-500 text-white font-semibold hover:bg-blue-600 disabled:opacity-50"
          disabled={sending || (!input.trim() && !file)}
        >
          Enviar
        </button>
      </form>
    </div>
  );
};

export default ChatWindow; 