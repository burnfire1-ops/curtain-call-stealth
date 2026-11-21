# M4 — NOTES (HUD + layar + audio + feel)

Skenario headless CDP (`prototypes/m4/cdp.mjs`, stock Chrome 157 headless +
--disable-gpu, server 127.0.0.1:8124, viewport 960x600 via
Emulation.setDeviceMetricsOverride, 0 console error, 2 run penuh):
- start: screen=start, 5 patrol, exposure 0.
- play 1s walk: playing, exposure 0.00, player bergerak.
- prop pickup (teleport ke tiara): props 1/3, propFlash 0.87.
- ghost win (teleport ke exit, tanpa terlihat): screen=win, detections=0.
- spotted setup (1,2 dtk di cone USHER 1): detections=1, USHER 1 chase 1.00.
- spotted win: screen=win, detections=1.
- lose: screen=lose, status=lost, caughtBy=USHER 1, detections=1.
- pause/resume: paused -> play. Mute: true -> false, audio ready=true.
- restart dari lose via Enter: screen=play, status=playing, detections=0.
- ?shot=end: frame win deterministik (M5).

No-audio (`prototypes/m4/noaudio.mjs`, AudioContext dihapus sebelum load):
screen=start, audioReady=false, mute toggle tetap jalan (muted=true),
ghost win tercapai, console errors 0.

Screenshot di `shots/`: m4-shot-{start,play,prop,win-ghost,win-spotted,
alert,lose,pause,end}.png.

Perbaikan visual dari membaca screenshot (3 putaran):
- Garis kontrol+legenda y=68 menabrak kotak EXIT -> dipendekkan
  ("R restart" -> "R ulang", separator " | ", "· M suara" pindah ke
  indikator MUTE di samping timer; M tetap terdokumentasi di start screen).
- Baris SUARA y=100 menabrak diamond + label Star Tiara -> pindah ke
  y=116 rata kanan (clear dari EXIT, label Golden Mask, label usher).
- Flash "+1 PROP" di atas pemain menabrak HUD (prop di ujung atas peta)
  -> pindah ke tengah layar; y=128 menabrak label Golden Mask -> y=150.

Utang ke M5 (bukan kelalaian):
- Halaman game lebih tinggi dari viewport 960x600 (canvas 600 + <p> +
  margin) -> scrollbar + strip bawah di luar lipatan (utang M3, diteruskan).
  M5 WAJIB rapikan index.html sebelum screenshot juri.
- Persepsi masih tiap step 60 Hz tanpa staggering (utang M2/M3, 5 guard).
- HUD text (hudDim) tercuci saat pemain/putih berdiri tepat di bawah
  baris HUD (top strip) — kandidat M5: backing strip gelap di belakang
  baris HUD. Bukan tabrakan, hanya kontras; tidak diperbaiki di M4
  karena mengubah tampilan yang sudah disetujui M3.
- Footstep audio memakai lantai di bawah guard terdekat (pilihan
  implementasi; brief tidak menentukan lantai siapa — lihat laporan §5).
