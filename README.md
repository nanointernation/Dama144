# Dama 144 — Proyecto

Juego de damas en tablero de 12×12 (144 casillas), 30 fichas por jugador, con captura
obligatoria, captura máxima, captura hacia adelante/atrás y dama voladora.

## Estructura del monorepo

```
packages/
  engine/   Reglas del juego + IA (TypeScript puro, sin DOM). Se reutiliza en el
            cliente web, en un Web Worker y en el servidor.
  client/   App web (Vite + TypeScript). Modos: local, vs IA, en línea.
  server/   Servidor Node + Socket.io para el modo multijugador en línea.
```

El paquete `engine` es la única fuente de verdad de las reglas. El cliente lo usa
para mostrar jugadas posibles; el servidor lo usa para **validar** cada jugada
antes de aceptarla (así ningún cliente puede hacer trampa).

## Requisitos

- Node.js 18 o superior
- npm 9 o superior

## Instalación

```bash
npm install
npm run build:engine
```

## Ejecutar en desarrollo

Terminal 1 — servidor (necesario solo para el modo en línea):
```bash
npm run dev:server
```

Terminal 2 — cliente web:
```bash
npm run dev:client
```

Abre `http://localhost:5173`. El modo local y el modo vs IA funcionan sin el
servidor; el modo en línea sí lo necesita.

## Construir para producción

```bash
npm run build:engine
npm run build:client        # genera packages/client/dist (archivos estáticos)
npm run -w packages/server build   # genera packages/server/dist
```

- El **cliente** (`packages/client/dist`) es estático: se despliega en cualquier
  hosting de sitios estáticos (Cloudflare Pages, Netlify, Vercel, GitHub Pages, o
  el propio hosting de ISM/Karmat).
- El **servidor** (`packages/server/dist`) es un proceso Node: se despliega en
  cualquier proveedor que corra Node (Railway, Render, un VPS con pm2, un
  contenedor Docker, etc). Expone un WebSocket (Socket.io) en el puerto que
  indique la variable de entorno `PORT`.

Antes de construir el cliente para producción, define la URL real del servidor:

```bash
# packages/client/.env.production
VITE_SERVER_URL=https://tu-servidor-de-dama144.com
```

## Hoja de ruta hacia Android (recomendada)

**No reescribir la app.** El camino más corto y de menor mantenimiento es empacar
esta misma app web con **Capacitor**:

1. `npm run build:client` para generar `packages/client/dist`.
2. Dentro de `packages/client`: `npm install @capacitor/core @capacitor/android` y
   `npx cap init "Dama 144" "com.karmat.dama144"`.
3. `npx cap add android` (crea el proyecto Android en `packages/client/android`,
   se abre con Android Studio).
4. `npx cap copy` cada vez que reconstruyas el cliente, y `npx cap open android`
   para compilar el `.apk`/`.aab` y publicarlo en Play Store.

Con esto, el modo local y vs IA funcionan igual (la IA corre en el propio
teléfono, sin conexión). El modo en línea funciona igual siempre que el
teléfono tenga internet y el servidor esté desplegado y accesible por HTTPS/WSS
(los navegadores y WebViews modernos exigen conexión segura para producción).

Si en el futuro se necesita algo verdaderamente nativo (notificaciones push,
Google Play Games, IAP, etc.), se agrega como plugin de Capacitor sin tocar el
resto del código.

## Estado actual (MVP funcional, verificado)

- ✅ Motor de reglas portado a TypeScript y probado (captura obligatoria, captura
  máxima, captura adelante/atrás, cadenas de captura, coronación, dama voladora).
- ✅ IA con minimax + poda alfa-beta y profundización iterativa, en 3 niveles de
  dificultad, corriendo en un Web Worker (no bloquea la interfaz).
- ✅ Servidor de salas en tiempo real (crear sala / unirse por código de 6
  caracteres), con validación autoritativa de cada jugada. Probado de extremo a
  extremo con dos clientes reales jugando una partida completa.
- ✅ Cliente web con los 3 modos desde un mismo menú.

## Pendiente para llevar esto a producción real

- Reconexión: si un jugador pierde la conexión a mitad de partida, hoy el
  servidor solo avisa al oponente; falta lógica de "reanudar sesión" por código.
- Botón de reinicio en modo en línea (hoy solo reinicia local/IA).
- Persistencia de salas (hoy viven solo en memoria del servidor; si se reinicia
  el proceso, las partidas en curso se pierden). Para producción real conviene
  Redis o una base de datos ligera si se espera mucho tráfico simultáneo.
- Cuentas de usuario / historial de partidas (opcional, útil para Karmat
  Academy si se quiere gamificar o llevar un ranking).
- Empaquetado con Capacitor para Android (pasos arriba) y, si se desea, iOS.
- Sonidos, animaciones de pieza y modo claro/oscuro son mejoras de pulido, no
  bloqueantes.
