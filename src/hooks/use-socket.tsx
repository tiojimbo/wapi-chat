import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// Contexto global do socket
const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketIo = io(SOCKET_URL, { withCredentials: true });
    setSocket(socketIo);
    return () => {
      socketIo.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

export function useSocketRoom(roomId?: string) {
  const socket = useSocket();
  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("join-session", roomId);
    return () => {
      socket.emit("leave-session", roomId);
    };
  }, [socket, roomId]);
}

export function useSocketNotification() {
  const socket = useSocket();
  const [notification, setNotification] = useState<any>(null);
  useEffect(() => {
    if (!socket) return;
    const handler = (data: any) => setNotification(data);
    socket.on("notification", handler);
    return () => {
      socket.off("notification", handler);
    };
  }, [socket]);
  return notification;
} 