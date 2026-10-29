# Highbeam

Highbeam, Discord benzeri, modern, koyu temalı ve gerçek zamanlı bir sohbet uygulamasıdır (MVP).

## 🚀 Teknolojiler

- **Backend:** Node.js 20, TypeScript (strict), Fastify 4, `ws` (WebSocket)
- **Veritabanı:** `better-sqlite3` — Bağımsız 3 SQLite dosyası:
  - `auth.db`: Kullanıcılar ve oturumlar
  - `guilds.db`: Sunucular, kanallar, roller, üyelikler
  - `messages.db`: Mesajlar ve silinme durumları
  - *Tüm SQLite bağlantılarında WAL modu ve Foreign Keys aktiftir.*
- **Frontend:** React 18, Vite 5, TypeScript (strict)
- **Kimlik Doğrulama:** `argon2` ile güvenli parola özetleme, `jsonwebtoken` ile JWT erişim belirteci + `httpOnly` çerez desteği
- **Girdi Doğrulama:** `zod` ile tüm REST ve WebSocket mesajlarının şema doğrulaması
- **Test:** `vitest` (Birim testleri, izin matrisi testleri, imleç tabanlı sayfalama testleri ve uçtan uca WebSocket testleri)

---

## 🎨 Tasarım & Tema

Highbeam koyu temaya (`#1A1A1A`) ve turuncu vurgu rengine (`#FF9800`) sahiptir.
- CSS Değişkenleri:
  - `--bg-primary: #1A1A1A`
  - `--bg-surface: #242424`
  - `--bg-hover: #2E2E2E`
  - `--bg-active: #383838`
  - `--text-primary: #FFFFFF`
  - `--text-secondary: #B0B0B0`
  - `--text-muted: #808080`
  - `--accent: #FF9800`
- Yer tutucu logo: `frontend/public/logo.svg`

---

## ⚡ Özellikler

1. **Kayıt / Giriş / Çıkış:** Güvenli parola hash (`argon2`), JWT access token ve `httpOnly` cookie.
2. **Sunucu (Guild) Yönetimi:** Sunucu oluşturma (otomatik `owner`, `admin`, `member` rolleri ve `#general` kanalı), davet kodu (`inviteCode`) ile katılma.
3. **Metin Kanalları:** Yetki kontrolüne bağlı kanal açma ve listeleme.
4. **Gerçek Zamanlı Mesajlaşma (WebSocket):** Anlık mesajlaşma, canlı mesaj güncelleme ve canlı silme.
5. **Rol ve İzin Sistemi:**
   - `MANAGE_CHANNELS (1)`
   - `DELETE_MESSAGES (2)`
   - `ADMIN (4)` — tüm izinleri kapsar.
   - Sunucu sahibi (`owner`) tam yetkiye sahiptir.
6. **İmleç Tabanlı Sayfalama (Cursor-based Pagination):** `created_at` imleci ile verimli mesaj geçmişi yükleme.
7. **Çevrimiçi Durum Göstergesi (Presence):** WebSocket bağlantı ve kopmalarında anlık çevrimiçi/çevrimdışı durumu yayını.

---

## 🛠️ Kurulum ve Çalıştırma

### 1. Bağımlılıkları Yükleme

Kök dizinde veya servis dizinlerinde aşağıdaki komutları çalıştırın:

```bash
# Kök dizinde:
npm run install:all

# Veya ayrı ayrı:
cd backend && npm install
cd ../frontend && npm install
```

### 2. Ortam Değişkenleri

Kök dizindeki `.env.example` dosyasını `backend/.env` olarak kopyalayabilirsiniz:

```bash
# backend/.env
PORT=3001
JWT_SECRET=highbeam-dev-secret-super-secure-change-in-production
JWT_EXPIRES_IN=7d
DB_PATH=./data
CORS_ORIGIN=http://localhost:5173
```

### 3. Geliştirme Sunucularını Başlatma

Backend ve Frontend servislerini iki ayrı terminalde veya kök komutlarıyla başlatabilirsiniz:

```bash
# Terminal 1: Backend (http://localhost:3001 & ws://localhost:3001/ws)
npm run dev:backend
# veya (cd backend && npm run dev)

# Terminal 2: Frontend (http://localhost:5173)
npm run dev:frontend
# veya (cd frontend && npm run dev)
```

Tarayıcınızda `http://localhost:5173` adresine giderek Highbeam'i kullanmaya başlayabilirsiniz.

---

## 🧪 Testleri Çalıştırma

Tüm birim, izin, sayfalama ve WebSocket entegrasyon testlerini çalıştırmak için:

```bash
# Kök dizinden:
npm test

# veya backend dizininden:
cd backend
npm test
```

Test kapsamı:
- `tests/auth.test.ts`: Kayıt, giriş, şifre doğrulama, JWT & cookie oturumu, me endpoint, logout.
- `tests/permissions.test.ts`: Rol oluşturma, kanal yönetimi izni, üye rolü yükseltme, mesaj silme izni, sunucu sahibi koruması.
- `tests/messages.test.ts`: Mesaj gönderimi, yazarın düzenlemesi, başkasının düzenlemesinin engellenmesi, cursor-based pagination.
- `tests/ws.test.ts`: WebSocket yetkisiz bağlantı reddi, JWT ile kimlik doğrulama, presence bildirimi, kanala abone olma ve anlık mesaj yayını.
