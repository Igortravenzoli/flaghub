// Service worker do Timer Flag instalado (PWA). Escopo: só /timer.
//
// Não guarda nada em cache: o Timer depende do servidor (o relógio é o banco)
// e qualquer resposta velha seria errada. Existe só para o navegador oferecer
// "Instalar app" (Chrome/Edge pedem um service worker com fetch).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // sem respondWith: a requisição segue direto para a rede
});
