# Video Call Documentation Generator 📱🎥

Generator Template Foto Dokumentasi Video Call Android yang realistis, cepat, dan 100% diproses langsung di sisi klien (*client-side*).

Didesain khusus untuk kebutuhan dokumentasi inspeksi, verifikasi lapangan, audit operasional, monitoring proyek, dan pelaporan resmi berbasis panggilan video.

---

## 🚀 Fitur Unggulan

### 1. Layer 1: Android Status Bar (Atas Layar)
- **Kontrol Waktu Fleksibel:** Input jam bebas (contoh: `09:13`, `09.13`, `913`), tombol cepat **"Jam Sekarang"**, mode **Jam Live** (auto-update per menit), serta pilihan pemisah (`:` atau `.`).
- **Indikator Baterai:** Slider persentase 1–100%, toggle status charging ⚡, dan pilihan gaya baterai (Pill ala ColorOS/Realme dengan angka di dalam vs. Stock Android).
- **Konektivitas & Kecepatan:** Pilihan label jaringan (5G, 4G, LTE, 4G+, H+, 3G), slider sinyal seluler (0–4 bar), toggle Wi-Fi (1–3 bar), dan teks kecepatan internet (misal `221 K/s`).
- **Ikon Notifikasi Realistis:** WhatsApp (hijau), Telegram (biru), SMS, Email, Alarm ⏰, dan Getar 📳 (pilihan warna asli atau monokrom).
- **Mode Custom Status Bar:** Bisa menggunakan status bar bawaan kode (vektor murni) atau mengunggah potongan gambar screenshot status bar kustom sendiri.

### 2. Layer 2: Foto Utama Kegiatan (Tengah Layar)
- **Upload Mudah:** Drag-and-drop file atau klik picker (mendukung JPG, PNG, WebP).
- **Zoom & Panning:** Slider zoom (20% – 250%) serta slider posisi geser X & Y.
- **Interaksi Langsung:** Seret (*drag*) mouse langsung di atas canvas preview untuk menggeser posisi, dan scroll roda mouse untuk memperbesar/memperkecil (*zoom*).
- **Pintasan Cepat:** Tombol **Cover/Fill**, **Fit**, dan **Center**.
- **Latar Belakang Blur:** Opsi blur otomatis jika rasio foto tidak memenuhi penuh layar smartphone.

### 3. Layer 3: PiP / Foto Selfie Petugas (Pojok Layar)
- **Format Video Call Standar:** Rasio aspek 3:4 portrait khas kamera depan smartphone.
- **Kustomisasi Bingkai:** Pilihan posisi (Kanan Bawah, Kiri Bawah, Kanan Atas), ukuran frame, border radius sudut membulat, ketebalan border putih halus, dan drop shadow realistis.
- **Kontrol Wajah:** Slider zoom selfie terpisah (50% – 300%), offset X & Y, dan fitur **Mirror** (efek cermin kamera depan).

### 4. Bottom Navigation Bar (Bawah Layar)
- Bar navigasi Android gelap dengan 3 tombol standar:
  - **Recents:** Pilihan icon garis 3 (☰) atau kotak (▢).
  - **Home:** Lingkaran (○).
  - **Back:** Segitiga / panah (◁).
- Pengaturan urutan tombol (Kanan-ke-Kiri atau Kiri-ke-Kanan) dan toggle visibilitas.

### 5. Utilitas & Ekspor
- **🔄 Tombol Swap Foto:** Satu klik untuk menukar foto utama dengan foto selfie jika tidak sengaja tertukar.
- **💾 Ekspor Resolusi Tinggi:** Pilihan resolusi **HD (720 × 1280 px)** atau **Full HD (1080 × 1920 px)**, format **JPG** (lengkap dengan slider kualitas kompresi) dan **PNG**.
- **Nama File Otomatis:** Diberi stempel waktu otomatis: `dokumentasi_videocall_YYYYMMDD_HHMM.jpg`.
- **Zero-Dependency:** Siap dijalankan tanpa instalasi Node.js atau package eksternal.

---

## ⌨️ Pintasan Keyboard & Mouse

| Aksi | Pintasan |
|---|---|
| **Geser Foto** | Seret (*Drag*) langsung pada layar HP |
| **Zoom Foto** | Putar roda mouse (*Wheel scroll*) di atas foto |
| **Ganti Foto Cepat** | Klik 2x (*Double-click*) pada area foto utama / PiP |
| **Tempel Foto** | `Ctrl + V` langsung dari clipboard |
| **Unduh Hasil** | `Ctrl + S` |

---

## 💻 Cara Menjalankan

Aplikasi ini 100% berbasis *client-side*. Anda dapat membukanya dengan salah satu cara berikut:

### Cara 1: Langsung di Browser
Cukup klik dua kali (atau seret) file [`index.html`](index.html) ke browser favorit Anda (Google Chrome, Microsoft Edge, Firefox, Brave).

### Cara 2: Menggunakan Local Server (Opsional)
Jika Anda memiliki Python atau Node.js terpasang:
```bash
# Menggunakan Python:
python -m http.server 8000

# Atau menggunakan npx serve:
npx serve .
```
Lalu buka `http://localhost:8000` di browser.