# FeSoul

Reproductor de música hecho en **TypeScript** con **listas doblemente enlazadas**. Proyecto del Taller Listas Dobles.

## Funcionalidades

**Requisitos del taller**
- Agregar canciones **al inicio**, **al final** y **en cualquier posición**: arrastrándolas con drag and drop, o soltando archivos del computador justo donde se quieren.
- **Eliminar** canciones, con opción de deshacer.
- **Adelantar** a la siguiente canción y **retroceder** a la anterior.
- Canciones reales del computador, elegidas desde el sistema de archivos; nada quemado en el código.
- Varias **playlists**: crear, renombrar, eliminar y cambiar entre ellas.
- Reproducción real: play, pausa, barra de progreso, volumen y silencio.

**Extras**
- **Pantalla de inicio** con saludo personalizado, "Seguir escuchando", tarjetas de playlists y canciones escuchadas recientemente.
- **Ver la lista doble**: muestra cada nodo con sus punteros `prev` y `next`, la cabeza (`head`), la cola (`tail`) y el nodo que suena (`current`), en vivo.
- **Reproducir a continuación**: pone una canción justo después de la que está sonando.
- **Invertir** la playlist y **ordenarla** por título, artista o duración (merge sort sobre los nodos), con opción de deshacer.
- **Me gusta**: playlist automática con las canciones marcadas con el corazón.
- **Búsqueda en YouTube** (YouTube Data API v3): las canciones de YouTube se mezclan con las locales en la misma lista doble.
- Lee las etiquetas del MP3 (título, artista, álbum y carátula). Si no las tiene, usa el nombre del archivo (`Artista - Título.mp3`).
- Aleatorio y repetir (toda la playlist o una canción).
- Búsqueda dentro de la playlist, sin importar tildes ni mayúsculas.
- Guarda todo en el navegador (IndexedDB): al recargar siguen las playlists, el orden, el volumen y los modos.
- Atajos de teclado: Espacio, Shift + ← / →, M, y Alt + ↑ / ↓ para mover canciones.
- Controles multimedia del sistema, como las teclas de música del teclado o la pantalla de bloqueo del celular.
- Diseño adaptable a celular; el drag and drop funciona con el dedo desde el ícono ⋮⋮.

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
├── ui/                      Interfaz (App, drag and drop, diálogos, avisos, buscador)
└── utils/format.ts          Formato de tiempos y textos
```

## Operaciones de la lista doble

| Operación | Uso en el reproductor | Complejidad |
|---|---|---|
| `addFirst` / `addLast` | Agregar al inicio / al final | O(1) |
| `addAt` | Agregar en una posición | O(n) |
| `insertAfter` | Agregar a continuación de la que suena | O(1) |
| `remove` | Eliminar una canción | O(1) con el nodo |
| `move` / `moveAfter` | Drag and drop / reproducir a continuación | O(n) / O(1) |
| `reverse` | Invertir la playlist | O(n) |
| `sort` | Ordenar (merge sort enlazado) | O(n log n) |
| `next` / `prev` del nodo actual | Adelantar / retroceder | O(1) |

### Ideas clave
- **Adelantar y retroceder** solo siguen `current.next` o `current.prev`.
- La playlist guarda un puntero al **nodo** que suena, no un número de posición. Por eso, si se reordena con drag and drop, la siguiente canción siempre sale del orden nuevo.
- `move()` reutiliza el mismo nodo: lo desconecta y lo vuelve a enlazar en la nueva posición.
- `reverse()` intercambia `prev` y `next` en cada nodo y luego cambia `head` por `tail`.
- `sort()` divide la lista con un puntero lento y uno rápido, mezcla las mitades ordenadas y al final reconstruye los `prev`.
- `getNodeAt()` recorre desde el extremo más cercano (cabeza o cola).
