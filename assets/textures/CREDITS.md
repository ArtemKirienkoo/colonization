# Текстури та арт у грі Colonization

Усі файли в `assets/textures/`. Джерела та ліцензії — нижче.

## `menu/` — відео-фон головного меню

| Файл | Що це | Використання |
|---|---|---|
| `menu/0331f2e3336021c488d45b19.mp4` | Анімований відео-луп — фон головного меню | `src/ui/splash.html`: `<video class="bg-video" autoplay muted loop playsinline>`; CSS — `position: fixed`, `100vw/100vh`, `object-fit: cover` (повний екран) |

> Джерело: файл надано користувачем (оригінальну назву збережено) — джерело/ліцензію додати за потреби.
> Старі живописні фони (Claude Lorrain, Turner, Айвазовський, Фрідріх, Teichs, батальні морські сцени,
> rawpixel-полотна, «село + річка + замок») видалено з репозиторію — замінені відео.

## `buttons/stone-textures/` — кам'яні кнопки

| Файл | Що це | Джерело |
|---|---|---|
| `686f0e79-46c7-4639-963d-6188c84289c4.png` | Вихідний атлас: 8 готових кнопок-каменів (2 колонки × 4 ряди) | Надано користувачем (джерело уточнити) |
| `btn-0.png` … `btn-7.png` | Ті самі 8 каменів, вирізані з атласу (PIL: обрізка по силуету каменя + альфа-канал, прозорий фон навколо) | Згенеровано з атласу вище |

Використання в UI (`src/ui/splash.html`, `src/ui/index.html`, `src/ui/styles/main.css`):
- CSS: `background-image: var(--btn-bg)` + `mask-image: var(--btn-bg)` — кнопка стає
  ФОРМОЮ каменя (маска по альфа-каналу PNG), без border-radius і прямокутних підкладок.
- JS `applyRandomStone()`: кожна кнопка випадково отримує один із btn-0…btn-7 через
  `--btn-bg`; пере-рандомізація при відкритті модалок та ігрового меню.

Старі матеріали (`medieval-button-pack` від pzUH / OpenGameArt CC0, ambientCG `Bricks097`
та `Rock051` CC0) видалено з репозиторію — більше не використовуються.

## Видалені варіанти фону (історична довідка)

- Відео-лупи Mixkit — `loop-medieval-town-time-lapse.mp4` (id 11404), `loop-medieval-castle-cliff.mp4`
  (id 14787), `loop-castle-on-hill.mp4` (id 30140), `loop-castle-in-mountain-aerial.mp4` (id 25230),
  `loop-castle-flyaway-forest.mp4` (id 9892) — видалено; залишено лише
  `menu/0331f2e3336021c488d45b19.mp4`. Ліцензія Mixkit: безкоштовно, комерція дозволена,
  без атрибуції. Директ-схема на випадок повернення:
  `https://assets.mixkit.co/videos/{id}/{id}-720.mp4`.
- `menu/painting-village-river-castle.jpg` — Christian Georg Schütz the Elder, «Landscape
  with River» (Städel Museum) — Public domain — видалено разом з іншими картинами.

## Інші видалені паки (історична довідка)

- `menu/fairy-tale-backgrounds/` — 4 рисовани анімовані сцени (7 паралакс-шарів кожна,
  freebie-пак у стилі CraftPix; ліцензію перед комерційним релізом треба було б звірити) — видалено.
- `menu/medieval-town-backgrounds/` — рисовани міста з замком (автор fodric,
  https://fodric.itch.io/medieval-town-backgrounds; $0, комерція дозволена, кредити не
  потрібні; сцени `scene01.png`–`scene03.png` 512×512 + `preview.html`) — видалено.
  Платна 4K-альтернатива на випадок повернення: jussi87 «2D Medieval Town Backgrounds»
  (https://jussi87.itch.io/2d-medieval-town-backgrounds, $9.90).
