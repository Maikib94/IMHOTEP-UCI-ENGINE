// src/global.d.ts — declaraciones de tipos globales para Vite

/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
