# M3 — NOTES (level 3 sayap + cover + lighting + palet)

Skenario headless CDP (`prototypes/m3/cdp.mjs`, stock Chrome 157 headless +
--disable-gpu, server 127.0.0.1:8124, viewport 960x600 via
Emulation.setDeviceMetricsOverride, 0 console error):
- live seen 1.2s: USHER 1 chase 1.00, USHER 2-5 patrol 0.00, exposure 1.00,
  rings=8 (multi-guard independen, live).
- live hide+1.0s: USHER 1 search 0.00, bergerak ke last-known (350,300).
- live wood-run 1.0s: USHER 1 chase 1.00 (bukan suspicious — analisis di
  laporan §4.3: guard menoleh ke suara, lalu MELIHAT pelari di lantai
  terbuka; rantai noise -> sight -> chase bekerja sesuai desain),
  noiseRing r=140, lastKnown = posisi pelari (32,400).
- live teach walk 2.2s: player (388,520), playing, exposure 0.00.

Screenshot di `shots/`: m3-shot-{start,play,end,chase,foyer,auditorium,
backstage}.png (staged deterministik) + m3-live-{chase,noise,play}.png.

Pelajaran visual (2 putaran perbaikan render, dibaca dari PNG):
- Legenda di y=100 bertabrakan dengan label USHER 2 (y=100) + label
  GOLDEN MASK (y=112) -> pindah ke bawah (y=588) -> TERPOTONG karena
  halaman (canvas + <p>) lebih tinggi dari jendela 960x600 -> akhir:
  kontrol + legenda penuh di y=68, daftar guard + props di y=84.
- Cincin langkah diperkuat (alpha 0.55->0.7, lebar 1.5->2, radius
  6+26t -> 8+30t) + poolGlow 0.16->0.20 supaya pembeda tesis terbaca
  di screenshot.

Utang ke M4/M5 (bukan kelalaian): halaman game lebih tinggi dari viewport
960x600 (canvas 600 + <p> + margin) -> scrollbar + strip bawah canvas
di luar lipatan; M5 WAJIB rapikan index.html sebelum screenshot juri
(index.html di luar scope M3). Persepsi masih tiap step 60 Hz tanpa
staggering (utang M2, kini 5 guard — raycast masih murah, belum diukur).
