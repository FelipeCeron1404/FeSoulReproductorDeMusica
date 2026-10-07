# FeSoul

Reproductor de música hecho en **TypeScript** con **listas doblemente enlazadas** (Taller Listas Dobles).

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre el enlace que muestra la terminal (normalmente http://localhost:5173).

## Funcionalidades

**Requisitos del taller**
- Agregar canciones **al inicio**, **al final** y **en cualquier posición** (arrastrando con drag and drop, o soltando archivos del computador justo donde quieres).
- **Eliminar** canciones (con opción de deshacer).
- **Adelantar** (siguiente canción) y **retroceder** (canción anterior).
- Canciones reales del computador: se eligen desde el sistema de archivos, nada quemado en el código.
- Varias **playlists**: crear, renombrar, eliminar y cambiar entre ellas.
- Reproducción real: play / pausa, barra de progreso, volumen y silencio.

**Extras**
- **Búsqueda en YouTube** (YouTube Data API v3): busca canciones y agrégalas al inicio o al final. Se mezclan con tus archivos locales en la misma lista doble y suenan con el reproductor oficial de YouTube.
- Lee las etiquetas del MP3 (título, artista, álbum y carátula). Si no tiene, usa el nombre del archivo (`Artista - Título.mp3`).
- Aleatorio y repetir (toda la playlist o una canción).
- Búsqueda dentro de la playlist (ignora tildes y mayúsculas).
- Guarda todo en el navegador (IndexedDB): al recargar siguen tus playlists, el orden, el volumen y los modos.
- Atajos de teclado: Espacio, Shift + ← / →, M, Alt + ↑ / ↓ para mover canciones.
- Controles multimedia del sistema (teclas de música del teclado, pantalla de bloqueo del celular).
- Diseño adaptable a celular, el drag and drop funciona con el dedo (desde el ícono ⋮⋮).

## Configurar YouTube

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto.
2. En **APIs y servicios → Biblioteca**, busca **YouTube Data API v3** y presiona **Habilitar**.
3. En **Credenciales → Crear credenciales → Clave de API**, copia la clave.
4. Recomendado: edita la clave y en **Restricciones de aplicaciones** elige *Sitios web* y agrega `http://localhost:5173/*` y la URL de tu despliegue (por ejemplo `https://fesoul.vercel.app/*`). En **Restricciones de API** deja solo *YouTube Data API v3*.
5. Copia `.env.example` como `.env.local` y pega la clave:
   ```
   VITE_YOUTUBE_API_KEY=tu_clave
   ```
6. Reinicia `npm run dev`.

La cuota gratis es de 10.000 unidades al día; cada búsqueda gasta unas 101 (unas 100 búsquedas diarias). Algunos videos no se pueden reproducir fuera de YouTube porque su dueño lo bloquea; la app avisa cuando pasa.

## Estructura

```
src/
├── structures/
│   ├── ListNode.ts          Nodo de la lista doble (value, prev, next)
│   └── DoublyLinkedList.ts  Lista doblemente enlazada genérica
├── models/
│   ├── Song.ts              Modelo de canción
│   ├── Playlist.ts          Playlist: lista doble de canciones + nodo actual
│   └── PlaylistLibrary.ts   Lista doble de playlists
├── api/
│   └── youtube.ts           Búsqueda en YouTube Data API v3
├── audio/
│   ├── Player.ts            Elige el motor (archivo local o YouTube) y detiene el otro
│   ├── AudioPlayer.ts       Motor de archivos locales (un solo <audio>)
│   ├── YouTubeEngine.ts     Motor de YouTube (IFrame Player API)
│   ├── metadata.ts          Lector de etiquetas ID3 y duración
│   └── songFactory.ts       Convierte archivos en canciones
├── storage/
│   └── LibraryStorage.ts    Guardado en IndexedDB
├── ui/                      Interfaz (App, drag and drop, diálogos, avisos)
└── utils/format.ts          Formato de tiempos y textos
```

### Ideas clave de la lista doble
- **Adelantar / retroceder** solo sigue `current.next` o `current.prev`: O(1).
- La playlist guarda un puntero al **nodo** que suena, no a un número de posición. Por eso, si se reordena con drag and drop, la siguiente canción siempre sale del orden nuevo.
- `move()` reutiliza el mismo nodo: lo desconecta y lo vuelve a enlazar en la nueva posición.
- `getNodeAt()` recorre desde el extremo más cercano (cabeza o cola).

## Desplegar en Vercel

1. Sube el proyecto a un repositorio de GitHub.
2. Entra a https://vercel.com, inicia sesión con GitHub y elige **Add New → Project**.
3. Importa el repositorio. Vercel detecta Vite solo (Build: `npm run build`, Output: `dist`).
4. En **Environment Variables** agrega `VITE_YOUTUBE_API_KEY` con tu clave.
5. Presiona **Deploy** y comparte el enlace. Agrega esa URL a las restricciones de la clave en Google Cloud.

Alternativa sin GitHub: `npx vercel` dentro de la carpeta del proyecto y seguir las preguntas.
