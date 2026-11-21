# BRIEF — M1 (CP1) CURTAIN CALL, vertical slice greybox

QUESTION:   Apakah mengendap di balik cover sambil guard patrol lewat terasa tegang dan terbaca?
CORE VERB:  Menyelinap (gerak pelan, tunggu patrol lewat, pindah cover) menuju exit.
THROWAWAY:  no — struktur file ini dipertahankan ke M2–M5 (brief M1 memerintahkan
            split file produksi, bukan throwaway di folder terpisah).
TIMEBOX:    Selesai ~04:00 WIB (22 Nov 2026).
KEEP IF:    Pemain baru melakukan core verb tanpa penjelasan dalam ~30 dtk, dan
            loop start → play → win/lose → restart jalan.
KILL IF:    Verb hanya terasa setelah dijelaskan, atau butuh sistem di luar M1
            untuk terasa.

RESULT:     22 Nov 2026 ~02:54 WIB — KEEP (bersyarat).
            Bukti yang teramati:
            - Loop jalan penuh di browser nyata (CDP, real-time): start → Enter →
              play → gerak (D+W 1,5 dtk: (80,520) → (230,370)) → P jeda → P lanjut
              → teleport ke exit → win → R → play → masuk cone 0,3 dtk: exposure
              0,30, masih play (grace) → 1,0 dtk: lose → R → play.
            - 12/12 tes node lolos: gerak + diagonal ternormalisasi + lari lebih
              cepat + tabrakan dinding/tirai + patrol bolak-balik + menang di exit
              + kalah setelah grace 0,5 dtk + tidak terdeteksi di balik cover /
              di luar cone + exposure meluruh keluar cone.
            - Screenshot headless (start/play/end) tanpa console error; shot play
              menunjukkan verb terbaca sekilas: cone merah panas + HUD "TERLIHAT!
              sembunyi!" + rute patrol garis putus-putus + tirai merah + EXIT.
            Syarat yang BELUM terpenuhi (jujur, prototype-fast: hanya author yang
            playtest sejauh ini): pemain BARU tanpa penjelasan belum mencoba.
            Kriteria "fresh player ~30 dtk" baru bisa dinyatakan lolos setelah
            playtest user di M4 (tesis Q5). Bila user di M4 tidak melakukan verb
            tanpa penjelasan, M1 harus di-retune (kecepatan guard / visibilitas
            cone), bukan dilanjutkan buta ke M2.
