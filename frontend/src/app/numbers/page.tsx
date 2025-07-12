"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Input } from "@/components/ui/input";
import { RefreshCw, Plus, Phone, Globe, CalendarDays, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// Importação dinâmica para evitar problemas de SSR
const QRCodeCanvas = dynamic(() => import("qrcode.react").then(mod => mod.QRCodeCanvas), { ssr: false });

export default function NumbersPage() {
  // Estado dos números conectados
  const [numbersState, setNumbersState] = useState<any[]>([]);
  const [loadingNumbers, setLoadingNumbers] = useState(true);
  const [errorNumbers, setErrorNumbers] = useState("");
  // Estado do modal
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  type NumberType = typeof numbersState[0];
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [numberToDelete, setNumberToDelete] = useState<NumberType | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const router = useRouter();

  // Buscar números conectados do backend
  useEffect(() => {
    const fetchNumbers = async () => {
      setLoadingNumbers(true);
      setErrorNumbers("");
      try {
        const res = await fetch("/api/whatsapp/sessions");
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error("Erro inesperado do servidor. Tente novamente.");
        }
        if (!res.ok) throw new Error(data?.error || "Erro ao buscar números conectados");
        // data.sessions deve ser um array [{ id, state, lastSeen, qrCode }]
        setNumbersState(data.sessions || []);
      } catch (err: any) {
        setErrorNumbers(err.message || "Erro desconhecido");
      } finally {
        setLoadingNumbers(false);
      }
    };
    fetchNumbers();
  }, []);

  // Função para abrir modal e resetar estado
  const abrirModal = () => {
    setNome("");
    setQrCode(null);
    setError("");
    setOpen(true);
  };

  // Função para solicitar QR Code ao backend
  const handleGerarQrCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setQrCode(null);
    try {
      // Gerar um sessionId único baseado no nome e timestamp
      const sessionId = `${nome.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}`;
      const res = await fetch("/api/whatsapp/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, name: nome }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Erro inesperado do servidor. Tente novamente.");
      }
      if (!res.ok) throw new Error(data?.error || "Erro ao solicitar QR Code");
      // O backend cria a sessão, mas o QR Code pode não estar disponível imediatamente
      // Buscar o QR Code na rota GET /api/whatsapp/sessions/:sessionId/qr
      let qrCodeData = null;
      for (let i = 0; i < 10; i++) { // tenta por até 5 segundos
        const qrRes = await fetch(`/api/whatsapp/sessions/${sessionId}/qr`);
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          if (qrData.qrCode) {
            qrCodeData = qrData.qrCode;
            break;
          }
        }
        await new Promise(r => setTimeout(r, 500));
      }
      if (!qrCodeData) throw new Error("QR Code não disponível. Tente novamente.");
      setQrCode(qrCodeData);
      // Polling: só adicionar o card quando a sessão aparecer no backend com status válido
      let cardAdicionado = false;
      const startTime = Date.now();
      const pollStatus = async () => {
        try {
          const res = await fetch('/api/whatsapp/sessions');
          if (res.ok) {
            const data = await res.json();
            const sess = data.sessions.find((s: any) => s.id === sessionId);
            if (sess) {
              if ((sess.state === 'connecting' || sess.state === 'connected')) {
                if (!cardAdicionado) {
                  setNumbersState(prev => [...prev, sess]);
                  cardAdicionado = true;
                } else {
                  setNumbersState(prev => prev.map(num => num.id === sessionId ? { ...num, ...sess } : num));
                }
                if (sess.state === 'connected') return; // Parar polling
              }
              // Se a sessão aparecer como 'disconnected', não adiciona o card
            }
          }
        } catch {}
        if (Date.now() - startTime < 30000) {
          setTimeout(pollStatus, 2000); // Tenta novamente em 2s até 30s
        }
      };
      pollStatus();
    } catch (err: any) {
      setError(err.message || "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  // Função para atualizar os cards de número (simulação)
  const handleRefresh = async () => {
    setLoadingRefresh(true);
    const minLoadingTime = 400; // milissegundos
    const start = Date.now();
    try {
      const res = await fetch("/api/whatsapp/sessions");
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Erro inesperado do servidor. Tente novamente.");
      }
      if (!res.ok) throw new Error(data?.error || "Erro ao atualizar números");
      setNumbersState(data.sessions || []);
    } catch (err: any) {
      setErrorNumbers(err.message || "Erro desconhecido");
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < minLoadingTime) {
        setTimeout(() => setLoadingRefresh(false), minLoadingTime - elapsed);
      } else {
        setLoadingRefresh(false);
      }
    }
  };

  // Função para abrir modal de confirmação de exclusão
  const handleDeleteClick = (num: NumberType) => {
    setNumberToDelete(num);
    setDeleteModalOpen(true);
  };

  // Função para confirmar exclusão
  const confirmDelete = async () => {
    if (!numberToDelete) return;
    try {
      const res = await fetch(`/api/whatsapp/sessions/${numberToDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Erro ao excluir número');
      }
      await handleRefresh(); // Atualiza a lista após exclusão
    } catch (err: any) {
      setErrorNumbers(err.message || 'Erro desconhecido ao excluir número');
    } finally {
      setDeleteModalOpen(false);
      setNumberToDelete(null);
    }
  };

  // Filtrar números conforme pesquisa (usando id ou nome)
  const filteredNumbers = numbersState.filter(num => {
    const termo = search.toLowerCase();
    const nome = (num.name || "").toLowerCase();
    const numero = (num.phone ? num.phone.replace(/[:@].*$/, "") : num.id || "").toLowerCase();
    return nome.includes(termo) || numero.includes(termo);
  });

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
    <div className="py-10 px-4 max-w-7xl mx-0 bg-transparent dark:bg-[#18181B] min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-[#59C29D] text-left">Números</h1>
      <div className="flex flex-row items-center gap-4 mb-8 max-w-2xl">
        <div className="flex-1 min-w-[220px]">
          <div className="relative w-full max-w-xs">
            <Input
              type="text"
              placeholder="Pesquisar números"
              className="pl-8 pr-2 bg-background dark:bg-neutral-900 text-foreground"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </span>
          </div>
        </div>
        <Button variant="outline" className="flex items-center gap-2 whitespace-nowrap" onClick={handleRefresh} disabled={loadingRefresh}>
          <RefreshCw className={`w-4 h-4 ${loadingRefresh ? "animate-spin" : ""}`} />
          {mounted ? (loadingRefresh ? "Atualizando..." : "Atualizar") : "Atualizar"}
        </Button>
        <Button variant="default" className="bg-[#59C29D] text-white flex items-center gap-2 whitespace-nowrap" onClick={abrirModal}>
          <Plus className="w-4 h-4" />
          Adicionar Novo Número
        </Button>
      </div>
      <div className="mb-8 text-left">
        {loadingNumbers ? (
          <div className="text-gray-500 dark:text-gray-400">Carregando números conectados...</div>
        ) : errorNumbers ? (
          <div className="text-red-500 dark:text-red-400">{errorNumbers}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNumbers.map((num) => (
              <div
                key={num.id}
                className="bg-background dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-5 shadow-sm flex flex-col gap-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Phone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  <span className="font-semibold text-lg text-foreground">
                    {num.phone ? formatPhoneNumber(num.phone.replace(/[:@].*$/, "")) : num.id}
                  </span>
                  <span className={`ml-auto text-xs px-3 py-1 rounded-full ${
                    num.state === "connected"
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : num.state === "connecting"
                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                  }`}>
                    {num.state === "connected"
                      ? "Conectado"
                      : num.state === "connecting"
                        ? "Conectando"
                        : "Desconectado"}
                  </span>
                </div>
                <div className="font-medium text-base text-foreground mb-1">{num.name || "(sem nome)"}</div>
                <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-1">
                  <CalendarDays className="w-4 h-4 ml-1" /> Conectado em: {num.lastSeen ? new Date(num.lastSeen).toLocaleString() : "-"}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-2">QR Code: {num.qrCode ? "Disponível" : "-"}</div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 bg-[#59C29D] text-white hover:bg-[#4ea885] hover:text-white"
                    onClick={() => router.push(`/dashboard?number=${encodeURIComponent(num.id)}`)}
                  >
                    Acessar Número
                  </Button>
                  <Button variant="ghost" className="p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-900" onClick={() => handleDeleteClick(num)}><Trash2 className="w-5 h-5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Modal para adicionar nome e gerar QR Code */}
      <Modal isOpen={open} onOpenChange={(open) => {
        setOpen(open);
        if (!open && qrCode) {
          // Não faz nada aqui, pois o card já foi adicionado após leitura do QR Code
        }
      }}>
        <ModalContent className="max-w-md w-full">
          <ModalHeader>
            <h2 className="text-lg font-semibold">Adicionar Novo Número</h2>
          </ModalHeader>
          <ModalBody className="pb-6">
            {!qrCode ? (
              <form onSubmit={handleGerarQrCode} className="space-y-4 mt-4">
                <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  placeholder="Digite o nome do número"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  className="w-full p-2 border rounded"
                  required
                  id="nome"
                />
                {error && <div className="text-red-500 text-sm">{error}</div>}
                <ModalFooter className="pb-0 justify-end flex">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={loading} className="bg-[#59C29D] text-white">
                    {loading ? "Gerando QR Code..." : "Gerar QR Code"}
                  </Button>
                </ModalFooter>
              </form>
            ) : (
              <div className="flex flex-col items-center mt-8">
                <div className="mb-4 text-center">Escaneie o QR Code abaixo com o WhatsApp:</div>
                {qrCode && (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 256 }}>
                    {/* @ts-expect-error: Tipagem do dynamic não reconhece as props do QRCodeCanvas */}
                    <QRCodeCanvas value={qrCode} size={256} />
                  </div>
                )}
                <ModalFooter>
                  <Button type="button" className="mt-6 bg-[#59C29D] text-white" onClick={() => setOpen(false)}>Fechar</Button>
                </ModalFooter>
              </div>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
      {/* Modal de confirmação de exclusão */}
      <Modal isOpen={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <ModalContent className="max-w-md w-full">
          <ModalHeader>
            <h2 className="text-lg font-semibold text-red-600">Excluir número</h2>
          </ModalHeader>
          <ModalBody>
            <span>Tem certeza que deseja excluir o número <b>{numberToDelete?.name}</b>?</span>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} className="bg-red-600 text-white">Excluir</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
} 