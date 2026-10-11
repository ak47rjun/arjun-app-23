'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Singleton Socket.IO connection (same origin, cookie-authenticated). */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io({
    path: '/api/socket',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
