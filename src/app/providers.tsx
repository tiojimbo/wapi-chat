"use client";
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabaseClient';
import { ReactNode } from 'react';
import { SocketProvider } from "@/hooks/use-socket";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SocketProvider>
      <SessionContextProvider supabaseClient={supabase}>
        {children}
      </SessionContextProvider>
    </SocketProvider>
  );
} 