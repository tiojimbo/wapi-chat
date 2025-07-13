"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Log do erro para debug
    console.error(error);
  }, [error]);

  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <h2>Ocorreu um erro inesperado.</h2>
      <p>{error.message}</p>
      <button onClick={() => reset()} style={{ marginTop: 16, padding: "8px 16px" }}>
        Tentar novamente
      </button>
    </div>
  );
} 