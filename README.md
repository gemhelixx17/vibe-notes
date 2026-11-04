# Notaku — Catatan PWA Self-Host

Seperti Google Keep, tapi data dipegang Anda sendiri. Tidak ada akun cloud, tidak ada iklan, tidak ada data yang dikirim ke pihak ketiga.

## Yang lebih baik dari Google Keep

- **Self-host penuh:** backend Python stdlib saja (tanpa npm, tanpa dependensi), database satu file SQLite `data/notaku.db` di server Anda.
- **PWA installable + offline:** manifest, service worker, ikon 192/512. Tanpa server pun tetap jalan di mode lokal browser (localStorage) — berguna saat server mati. Catatan: ikon PNG sengaja tidak disimpan di repo GitHub (push biner ditolak konektor), server membuatnya otomatis dengan Python stdlib saat pertama jalan, jadi deploy dari repo tetap menampilkan ikon.
- **Riwayat versi:** setiap simpan menyimpan snapshot, bisa pulihkan 5 versi terakhir dari editor.
- **Checklist dengan progres:** persentase selesai di kartu, bukan sekadar coret.
- **Pengingat berulang:** sekali, harian, mingguan, bulanan, plus penanda lewat waktu.
- **Template:** rapat, tugas harian, belanja, ide — sekali klik.
- **Aksi massal:** pilih beberapa kartu, lalu arsipkan / ke sampah / pulihkan sekaligus.
- **Ekspor/impor JSON:** cadangan penuh dalam satu file, bisa dipindah server kapan saja. Ekspor juga jadi jalan pindah dari mode lokal ke mode server.
- **Pencarian + filter gabungan:** teks (judul, isi, item checklist, label), label, warna, urutan (diubah/dibuat/judul).
- **Lampiran gambar, duplikat catatan, sampah dengan pulihkan, mode gelap, tampilan grid/daftar, shortcut `n` (baru) dan `/` (cari).**

## Menjalankan

```bash
cd notaku
python3 server.py --port 3000
# buka http://localhost:3000  (atau IP server Anda:3000)
```

## Deploy / update dengan satu file

Di server (bukan di laptop, kecuali untuk tes), cukup:

```bash
git clone https://github.com/gemhelixx17/vibe-notes.git
cd vibe-notes
chmod +x deploy.sh
sudo ./deploy.sh
```

Update berikutnya, file yang sama:

```bash
cd vibe-notes
git pull
sudo ./deploy.sh
```

Yang dilakukan `deploy.sh`: menyalin kode ke `/opt/notaku`, membackup versi lama ke `/opt/notaku-backup-TANGGAL-JAM`, **mempertahankan `data/notaku.db`**, memasang dan me-restart service systemd `notaku`, lalu mengecek `http://127.0.0.1:3000/api/health`. Opsi berguna: `./deploy.sh --check` (dry-run, tanpa mengubah apa pun), `./deploy.sh --status` (cek saja), `./deploy.sh --port 3000 --dir /opt/notaku`, dan `./deploy.sh --no-systemd` kalau tidak mau pakai systemd. Editor di versi ini sudah rich text (tebal, miring, judul, daftar, tautan, sorotan, dan lain-lain), bukan lagi textarea polos.

## Deploy dengan Docker (opsi)

Tanpa systemd, langsung dari folder repo:

```bash
docker compose up -d --build
# update: git pull, lalu docker compose up -d --build lagi
```

Atau lewat script yang sama, supaya target dan datanya konsisten dengan versi systemd:

```bash
sudo ./deploy.sh --docker
# update: git pull, lalu sudo ./deploy.sh --docker lagi
```

Yang dilakukan mode Docker: kode disalin ke `/opt/notaku` (sama seperti systemd), data tetap di `/opt/notaku/data` lewat bind mount `./data:/app/data` di `docker-compose.yml`, image dibangun dari `Dockerfile` (Python 3.12 slim, tanpa npm), container `notaku` di-restart otomatis (`unless-stopped`), dan health dicek ke `/api/health`. Kalau sebelumnya pakai systemd, `deploy.sh --docker` menghentikan service systemd lama dulu supaya port 3000 tidak bentrok. Port bisa diubah dengan `NOTAKU_PORT=3001 docker compose up -d` atau `./deploy.sh --docker --port 3001`. Caddy tetap sama: reverse_proxy ke port host tersebut.

Di HP: buka alamat itu di Chrome, lalu Add to Home Screen / Install app. Untuk install yang andal, pakai HTTPS (lihat Caddy di bawah) — Chrome membatasi install di HTTP non-localhost.

## Deploy di Proxmox Anda (pola yang sudah Anda pakai)

Paling aman: jalankan di LXC/VM di subnet privat, jangan ekspos langsung ke internet.

```bash
# di guest, misal 10.0.1.30
sudo apt update && sudo apt install -y python3
cd /opt && cp -r notaku /opt/notaku
cd /opt/notaku && nohup python3 server.py --port 3000 > logs.txt 2>&1 &
```

Unit systemd (opsional, simpan di `/etc/systemd/system/notaku.service`):

```ini
[Unit]
Description=Notaku
After=network.target
[Service]
WorkingDirectory=/opt/notaku
ExecStart=/usr/bin/python3 server.py --port 3000
Restart=always
User=www-data
[Install]
WantedBy=multi-user.target
```

Caddy (di proxy Anda, sesuaikan domain):

```
notaku.domain-anda.id {
    reverse_proxy 10.0.1.30:3000
}
```

Jika domain ini harus privat, tambahkan `basic_auth` di Caddy atau batasi akses lewat Tailscale saja, seperti pola SSH/8006 Anda. Server ini sengaja tanpa login bawaan karena ditujukan untuk jaringan privat.

## Cadangan

1. Di aplikasi: Ekspor JSON secara berkala.
2. Di server: salin `data/notaku.db` saat server berhenti, atau `sqlite3 data/notaku.db ".backup backup.db"`.

## Batasan yang jujur

- Pengingat ditandai lewat waktu saat aplikasi dibuka; belum ada push notification saat aplikasi tertutup (Keep punya ini via layanan Google — di self-host perlu push server terpisah).
- Belum ada kolaborasi real-time multi-pengguna; ini aplikasi satu pemilik, sesuai permintaan self-host.
- Data di SQLite tersimpan tidak terenkripsi di disk server Anda; enkripsi at-rest mengandalkan enkripsi disk server Anda sendiri.
- Mode lokal dan mode server adalah dua penyimpanan terpisah; pindahkan dengan Ekspor JSON lalu Impor JSON setelah server jalan.

## Desain

Dibangun dengan Hallmark sebagai acuan utama (halaman baru), dengan palet kertas dan tinta: latar hangat, satu aksen hijau, tanpa gradien ungu-biru, tanpa emoji sebagai ikon, label sentence case. Audit Unslop setelah build tidak menemukan tanda slop berat, jadi tidak ada redesign tambahan — hanya perbaikan kecil yang sudah diterapkan di token dan jarak.
