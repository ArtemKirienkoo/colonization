# Музика та звуки в грі Colonization

Усі файли лежать у `assets/audio/` і підключені в коді за **іменем файла** —
щоб замінити звук, просто поклади новий файл із таким самим ім'ям (або зміни
ім'я у викликах `_ensureFileMusic(...)` / `_playFileSfx(...)` у `src/ui/splash.html`
та `src/ui/index.html`). Код має fallback на синтезовані звуки, якщо файл не знайдено.

| Файл | Де грає | Опис |
|---|---|---|
| `TownTheme.mp3` | Головне меню (`splash.html`) | спокійна середньовічна тема, луп |
| `Crusaders-Approaching.mp3` | Ігровий процес (`index.html`) | «Crusaders Approaching» Eric Matyas — середньовічні труби, ~0:51, луп |
| `VictoryTheme.mp3` | Екран перемоги (тільки переможцю) | фанфара, без лупу |
| `DefeatTheme.mp3` | Екран поразки (тільки тому, хто програв) | «Taps» U.S. Army Band — сумний горн (різновид труби), ~1:00, без лупу, public domain |
| `Dice_Roll.ogg` | Кидання кубиків | запис: деревʼяні кубики котяться й стукають по деревʼяному столу |
| `Settle_Wood.ogg` | Будівництво поселення і дороги / загальний «будівельний» стук | дошковий стук |
| `City_Stone.ogg` | Будівництво (перетворення в) місто | важкий камінний стук |
| `UI_Click.wav` | Клік по кнопках (меню й гра) | мʼякий короткий клік замість дзвінких тонів |

## Гучність
Базові рівні зашиті в коді й множаться на повзунки гри:
- меню: `0.05 × загальна × музика`
- гра: `0.02 × загальна × музика`
- фанфара перемоги: `0.18 × загальна × ефекти`
- тема поразки: `0.10 × загальна × ефекти` (гучність Taps знижена — горн звучить різко)
- будівництво: `0.85`, поселення: `0.85`, дорога: `0.80`, місто: `0.90`, кубики: `0.55`, клік кнопки: `0.50` (усі × загальна × ефекти; кубики додатково обрізані до 0.7с через maxDurMs)

## Ліцензії / авторство

### Crusaders-Approaching.mp3 — **Eric Matyas** (soundimage.org)
- «Crusaders Approaching» (фонова музика бою, середньовічні труби, ~0:51) —
  http://soundimage.org/wp-content/uploads/2018/05/Crusaders-Approaching.mp3
Автор: Eric Matyas (soundimage.org)
Ліцензія: вільне використання (зокрема комерційне) за умови атрибуції — https://soundimage.org/attribution-info/
⚠️ Атрибуція обов'язкова: при публікації гри додай у титри/опис рядок:
Music by Eric Matyas (soundimage.org)

### DefeatTheme.mp3 — «Taps» — **The United States Army Band** (public domain)
- «Taps» (сумний сигнал горна з «Daily Sequence of Bugle Calls», ~1:00, без лупу) —
  https://archive.org/details/TapsBugleCall — запис військового оркестру США,
  суспільне надбання (public domain, твори уряду США); атрибуція не обов'язкова,
  але бажано вказати: «Taps — The United States Army Band».
- Попередні теми (усі збережені в `candidates/`):
  «The Fallen» Jonathan Shaw / InspectorJ (CC-BY 3.0) — `The-Fallen_InspectorJ.mp3`;
  «Comrades Always» Eric Matyas — `Comrades-Always.mp3`.

#### LoseTrumpet.mp3 — **CC0** (OpenGameArt)
- «Game Over Trumpet SFX» (одинокий низький трубний звук для game over/lose, ~1с) —
  https://opengameart.org/content/game-over-trumpet-sfx — автор 0new4y, CC0
Вільний для використання; станом на зараз НЕ підключений у код (архів на майбутнє).

## Архів кандидатів — `assets/audio/candidates/`
Тут лежить підбір з часів підбору теми поразки — **на майбутнє**, поки не використовується грою:
- `Crusaders-Approaching.mp3`, `Comrades-Always.mp3`, `Ancient-Crusades.mp3`, `The-Key-to-the-Kingdom.mp3`,
  `The-Voyage-Begins.mp3`, `North-Ridge.mp3`, `Bitter-Sweet-Goodbye.mp3`, `Strings-of-Sadness.mp3` — Eric Matyas (soundimage.org; ліцензія з атрибуцією «Music by Eric Matyas (soundimage.org)»)
- `Impact-Prelude.mp3`, `Impact-Lento.mp3`, `Impact-Moderato.mp3`, `Goblin-King.mp3`, `Angevin-B.mp3`, `Mourning-Song.mp3` — Kevin MacLeod (incompetech.com; CC-BY 4.0)
- `GameOver-IV.mp3` — Kistol (OpenGameArt; CC0)
- `Game-Over-Kistol.ogg` — Kistol (OpenGameArt; CC0)

### Кандидати 2-го раунду — стиль «як у Brawl Stars / Clash Royale» (епічна поразка)
- `The-Fallen_InspectorJ.mp3` — «The Fallen» Jonathan Shaw / InspectorJ
  (CC-BY 3.0; оркестрова поразка в бою, ~1:17) — https://opengameart.org/content/the-fallen-rpg-orchestral-essentials-defeated-music
  ⚠️ атрибуція: «The Fallen» Composed by Jonathan Shaw (www.jshaw.co.uk).
  (якийсь час був встановлений як `DefeatTheme.mp3`)
- `The-Sad-Battle_EldritchGrim.mp3` — «The Sad Battle» Eldritch Grim
  (CC0; епічна сумна кінематографічна поразка, ~1:35) — https://opengameart.org/content/the-sad-battle
- `Medieval-Defeat-Theme_RandomMind.mp3` — «Medieval: Defeat Theme» RandomMind
  (CC0; медієвально-фентезійна тема поразки, ~0:45) — https://opengameart.org/content/medieval-defeat-theme
- `Icy-Game-Over_Sudocolon.mp3` — «Icy Game Over» Sudocolon
  (CC0; короткий game-over джингл, ~0:08) — https://opengameart.org/content/icy-game-over
- `Loss_Remixed.mp3` (~0:39), `Low-Point.mp3` (~0:50), `Bitter-Sweet-Ending_Remixed.mp3` (~1:15),
  `Book-End.mp3` (~1:14), `A-Sad-Goodbye_Remixed.mp3` (~1:09) — Eric Matyas (soundimage.org;
  атрибуція «Music by Eric Matyas (soundimage.org)») — тихі фортепіанні драматичні п'єси

### Кандидати 3-го раунду — короткі стінги game over (виявились надто короткими)
- `Mixkit-OrchestraGameOver.mp3` (~0:05; якийсь час був встановлений як `DefeatTheme.mp3`),
  `Mixkit-ArcadeGameOver.mp3` (~0:04), `Mixkit-SpookyGameOver.mp3` (~0:04),
  `Mixkit-GameOver-1948-unknown.mp3` (~0:05) — https://mixkit.co/free-sound-effects/game-over/
  Ліцензія Mixkit: безкоштовне використання (зокрема комерційне), атрибуція не потрібна.
- `Kenney-Jingles/` — пак Kenney «85 Short music jingles» (CC0): 17 джинглів × 5
  інструментів (HIT, NES, PIZZA, SAX, STEEL) — https://opengameart.org/content/85-short-music-jingles

### Кандидати 4-го раунду — сумні теми ~45–60 сек
- `Taps_Bugle_PD.mp3` — «Taps» The United States Army Band (public domain; сумний горн,
  ~1:00) — **зараз встановлений як `DefeatTheme.mp3`** — https://archive.org/details/TapsBugleCall
- `The-Land-of-Despair_Matyas.mp3` — «The Land of Despair» Eric Matyas (атрибуція;
  сумна фентезі-оркестрова, ~0:53) — https://soundimage.org/wp-content/uploads/2021/06/The-Land-of-Despair.mp3
- `Village-in-Ashes_Matyas.ogg` — «Village in Ashes» Eric Matyas (атрибуція; «після рейду
  чи битви», ~0:48) — https://soundimage.org/wp-content/uploads/2026/07/Village-in-Ashes.ogg

Щоб увімкнути будь-який — поклади файл в `assets/audio/` під потрібним ім'ям (або зміни ім'я у викликах коду) і допиши авторство сюди.

## TownTheme.mp3 / VictoryTheme.mp3 — TODO ⚠️
Джерело цих треків треба підтвердити: якщо під CC-BY — допиши автора тут;
якщо ліцензія не підтвердиться — заміни файл на будь-який CC0 з Pixabay/OpenGameArt
із тим самим ім'ям, код міняти не доведеться.

### UI_Click.wav — **CC0** (Kenney Interface Sounds)
Мʼякий клік кнопки: файл `click_002.wav` із паку Kenney «Interface Sounds» —
https://kenney.nl/assets/interface-sounds (CC0; дзеркало:
https://github.com/Calinou/kenney-interface-sounds). Авторство не обовʼязкове (CC0).

### Dice_Roll.ogg / Settle_Wood.ogg / City_Stone.ogg — CC0
- Кубики: запис «Wooden Dice on Wooden Table Roll» — https://opengameart.org/content/wooden-dice-on-wodden-table-roll
- Деревʼяний стук (поселення та дорога) адаптовано з CC0-джерел.
- Авторство не обовʼязкове (CC0), але джерело фіксуємо для порядку.

