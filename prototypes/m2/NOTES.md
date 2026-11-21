# M2 — NOTES (vision + detection)

Skenario headless CDP (`/tmp/m2-cdp.mjs`, stock Chrome headless + --disable-gpu,
server 127.0.0.1:8124, 0 console error): pemain di cone terbuka (450,300)
-> suspicious 0,40 dtk (susp 0,98) -> chase 0,65 dtk (guard 342,300) ->
pemain teleport ke (300,420) saat guard di x=351 -> search (susp 0,08,
guard 439,300 — bergerak ke last-known 450,300, BUKAN ke pemain) ->
patrol + susp 0,00 di +5,4 dtk (guard 325,300, jalan kembali ke waypoint 0).

Screenshot di `shots/`: m2-{suspicious,chase,search,patrol}.png (live FSM)
+ m2-shot-{start,play,end,chase}.png (mode ?shot= deterministik).

Pelajaran skenario: draft pertama teleport TERLAMBAT — pemain idle di cone
terbuka ditangkap guard ~1,6 dtk setelah fixture (status lost sebelum
teleport mendarat). Itu perilaku game yang BENAR, bukan bug; skenario
diperbaiki dengan teleport segera setelah chase dimulai (guard ~130px jauh).

Framing: jendela headless default 800x600 memotong canvas 960x600 (HUD atas
terpotong, scrollbar terlihat) — kondisi harness M1 juga. M5 WAJIB set
ukuran window/metrics 960x600 sebelum screenshot juri.
