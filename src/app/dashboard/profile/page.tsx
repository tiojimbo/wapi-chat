"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);
      // Buscar dados extras do usuário na tabela users
      const { data, error } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (data) setFullName(data.full_name || "");
      setLoading(false);
    };
    fetchUser();
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    const { error } = await supabase
      .from("users")
      .update({ full_name: fullName })
      .eq("id", user.id);
    if (error) setMessage("Erro ao atualizar perfil");
    else setMessage("Perfil atualizado com sucesso!");
  };

  if (loading) return <div className="p-8">Carregando...</div>;

  return (
    <div className="w-full">
      <form
        onSubmit={handleSave}
        className="bg-white p-8 rounded shadow-md w-full max-w-sm"
        style={{ margin: 0 }}
      >
        <h1 className="text-2xl font-bold mb-6 text-center">Meu Perfil</h1>
        <div className="mb-4">
          <label className="block text-sm mb-1">Email</label>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full p-2 border rounded bg-gray-100"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm mb-1">Nome completo</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        {message && <div className="mb-2 text-green-600 text-sm">{message}</div>}
        <button
          type="submit"
          className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition"
        >
          Salvar
        </button>
      </form>
    </div>
  );
} 