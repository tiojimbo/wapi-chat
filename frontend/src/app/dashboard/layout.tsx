"use client";

import React from "react";
import localFont from "next/font/local";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as SidebarModule from "@/components/ui/sidebar";
import { Home, User, LogOut, Sun, Moon, Settings } from "lucide-react";
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
  const [openClickUpModal, setOpenClickUpModal] = useState(false);
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
    <div className={`group flex h-screen overflow-hidden ${geistSans.variable} ${geistMono.variable} antialiased bg-background dark:bg-[#18181b]`}>
      <SidebarModule.SidebarProvider>
        <div className="relative overflow-hidden w-full h-full flex">
          <SidebarModule.Sidebar collapsible="icon">
            <SidebarModule.SidebarRail />
            <SidebarModule.SidebarHeader className="h-50">
              {mounted && (
                <div className="flex flex-row items-center justify-between px-5 h-20 w-full border-b border-gray-200 dark:border-[#2D2D30] bg-[#F6F6F6] dark:bg-[#232326]">
                  <span className={`text-2xl font-bold transition-all duration-200 overflow-hidden ${theme === 'dark' ? 'text-white' : 'text-[#59C29D]'}`}> 
                    WapiChat
                  </span>
                </div>
              )}
            </SidebarModule.SidebarHeader>
            <SidebarModule.SidebarContent>
              <SidebarMenuWithTrigger />
            </SidebarModule.SidebarContent>
            {/* <SidebarModule.SidebarFooter>
              <SidebarModule.SidebarMenuButton tooltip="Sair" className="text-red-600 hover:bg-red-50" onClick={() => setOpenLogoutModal(true)}>
                <LogOut className="w-5 h-5" />
                <span>Sair</span>
              </SidebarModule.SidebarMenuButton>
            </SidebarModule.SidebarFooter> */}
          </SidebarModule.Sidebar>
          <div className="flex-1 flex flex-col min-w-0 bg-background dark:bg-[#18181b] h-full">
            <header className="h-20 bg-white dark:bg-[#18181B] border-b border-gray-200 dark:border-[#2D2D30] flex items-center px-6 flex-shrink-0">
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
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="outline-none focus:ring-2 focus:ring-[#59C29D] rounded-full">
                      <Avatar.Root className="w-10 h-10 rounded-full border border-gray-200 bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#59C29D] transition">
                        <Avatar.Fallback className="text-gray-500 font-bold text-lg flex items-center justify-center w-full h-full uppercase">
                          {userEmail ? userEmail[0] : "U"}
                        </Avatar.Fallback>
                      </Avatar.Root>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[230px] h-[140px] p-2 rounded-xl shadow-lg border bg-white dark:bg-[#232326] flex flex-col justify-between">
                    <div className="mb-1">
                      <div className="font-semibold text-base text-gray-900 dark:text-white leading-tight">Pedro Carlos</div>
                      <div className="text-xs text-gray-500 dark:text-gray-300 break-all leading-tight">{userEmail}</div>
                    </div>
                    <div className="border-t my-1" />
                    <Link href="/dashboard/profile" className="flex items-center gap-2 py-1 text-gray-700 dark:text-gray-200 hover:underline text-sm">
                      <User className="w-4 h-4" />
                      Perfil
                    </Link>
                    <div className="border-t my-1" />
                    <button
                      className="flex items-center gap-2 text-red-600 hover:bg-red-50 w-full py-1 rounded transition text-sm"
                      onClick={() => setOpenLogoutModal(true)}
                    >
                      <LogOut className="w-4 h-4" />
                      Sair
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
            </header>
            <main className="flex-1 w-full min-w-0 bg-background dark:bg-[#18181b] min-h-0">
              {children}
            </main>
          </div>
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
        {/* Modal de conexão com ClickUp */}
        {openClickUpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white dark:bg-[#232326] rounded-lg shadow-lg p-8 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Conectar ao ClickUp</h2>
              <p className="mb-6">Funcionalidade em breve.</p>
              <button
                onClick={() => setOpenClickUpModal(false)}
                className="mt-4 px-4 py-2 rounded bg-gray-200 dark:bg-[#18181B] text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-[#232326]"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </SidebarModule.SidebarProvider>
    </div>
  );
} 