"use client";

import React from "react";
import localFont from "next/font/local";
import Link from "next/link";
import * as SidebarModule from "@/components/ui/sidebar";
import { Home, User, LogOut, Sun, Moon } from "lucide-react";
import { SidebarMenuClient } from "@/components/ui/SidebarMenuClient";
import { SidebarConnectedNumbersClient } from "@/components/ui/SidebarConnectedNumbersClient";
import { Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { useEffect, useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@/components/ui/button";
import * as Avatar from "@radix-ui/react-avatar";
import { supabase } from "@/lib/supabaseClient";

const geistSans = localFont({
  src: "../fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "../fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [openLogoutModal, setOpenLogoutModal] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    async function fetchUser() {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email) {
        setUserEmail(data.user.email);
      }
    }
    fetchUser();
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  function SidebarHeaderContent() {
    return (
      <div className="flex flex-row items-center justify-between px-5 h-16 w-full border-b border-gray-200 dark:border-[#2D2D30] bg-white dark:bg-[#232326]">
        {mounted && (
          <span className={
            `text-2xl font-bold transition-all duration-200 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0 overflow-hidden ${theme === 'dark' ? 'text-white' : 'text-[#47c8bf]'}`
          }>
            WapiChat
          </span>
        )}
      </div>
    );
  }

  function SidebarMenuWithTrigger() {
    return (
      <SidebarModule.SidebarMenu>
        {/* Números conectados */}
        <SidebarConnectedNumbersClient />
        {/* Removido menu de Organizações */}
        {/* Removido menu de Perfil */}
        {/* Removido botão de Sair daqui */}
      </SidebarModule.SidebarMenu>
    );
  }

  return (
    <div className={`group flex min-h-screen ${geistSans.variable} ${geistMono.variable} antialiased bg-background dark:bg-[#18181b]`}>
      <SidebarModule.SidebarProvider>
        <SidebarModule.Sidebar collapsible="icon">
          <SidebarModule.SidebarRail />
          <SidebarModule.SidebarHeader className="h-50">
            {mounted && (
              <div className="flex flex-row items-center justify-between px-5 h-20 w-full border-b border-gray-200 dark:border-[#2D2D30] bg-white bg-[#F6F6F6] dark:bg-[#232326]">
                <span className={`text-2xl font-bold transition-all duration-200 overflow-hidden ${theme === 'dark' ? 'text-white' : 'text-[#59C29D]'}`}> 
                  WapiChat
                </span>
              </div>
            )}
          </SidebarModule.SidebarHeader>
          <SidebarModule.SidebarContent>
            <SidebarMenuWithTrigger />
          </SidebarModule.SidebarContent>
          <SidebarModule.SidebarFooter>
            <SidebarModule.SidebarMenuButton tooltip="Sair" className="text-red-600 hover:bg-red-50" onClick={() => setOpenLogoutModal(true)}>
              <LogOut className="w-5 h-5" />
              <span>Sair</span>
            </SidebarModule.SidebarMenuButton>
          </SidebarModule.SidebarFooter>
        </SidebarModule.Sidebar>
        <div className="flex-1 flex flex-col min-w-0 bg-background dark:bg-[#18181b]">
        <header className="h-20 bg-white dark:bg-[#18181B] border-b border-gray-200 dark:border-[#2D2D30] flex items-center px-6">

            <div className="flex items-center gap-2 flex-1">
              <SidebarModule.SidebarTrigger />
              {/* Removido o texto 'Painel Principal' */}
            </div>
            <div className="flex items-center gap-4">
              {mounted && (
                <button
                  onClick={toggleTheme}
                  className="focus:outline-none"
                  aria-label="Alternar tema"
                >
                  {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-gray-700" />}
                </button>
              )}
              <Link href="/dashboard/profile" className="outline-none focus:ring-2 focus:ring-[#59C29D] rounded-full">
                <Avatar.Root className="w-10 h-10 rounded-full border border-gray-200 bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#59C29D] transition">
                  <Avatar.Fallback className="text-gray-500 font-bold text-lg flex items-center justify-center w-full h-full uppercase">
                    {userEmail ? userEmail[0] : "U"}
                  </Avatar.Fallback>
                </Avatar.Root>
              </Link>
            </div>
          </header>
          <main className="flex-1 w-full min-w-0 p-8 bg-background dark:bg-[#18181b]">
            {children}
          </main>
        </div>
        <Modal isOpen={openLogoutModal} onOpenChange={setOpenLogoutModal}>
          <ModalContent className="max-w-md w-full">
            <ModalHeader>
              <span className="text-lg font-semibold">Confirmar saída</span>
            </ModalHeader>
            <ModalBody>
              <span>Tem certeza que deseja sair?</span>
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenLogoutModal(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => { window.location.href = "/dashboard/logout"; }} className="bg-red-600 text-white">Sair</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </SidebarModule.SidebarProvider>
    </div>
  );
} 