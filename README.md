# Gider Defteri

Roman Gençlik Derneği'nin gider kayıtlarını tutmak için hazırlanmış basit bir web sayfası.

- Kayıtlar elle girilir: Tarih, Belge Türü, Açıklama, Tutar.
- **Sıra no tarihe göre otomatik verilir.** Araya eski tarihli bir kayıt girilirse sonraki kayıtların numarası birer artar.
- Seçilen yılın kayıtları **Excel** olarak indirilir. En altta yıl toplamı formülle hesaplanır.
- Kayıtlar **Supabase**'de tutulur. Herkes her cihazdan aynı kayıtları görür. Sayfayı yalnızca giriş yapan kullanıcılar kullanabilir.
- Site **GitHub Pages** üzerinde çalışır.

---

## Kurulum (bir kez yapılır)

### 1. Supabase projesi

1. https://supabase.com adresinden ücretsiz hesap açın ve **New project** ile bir proje oluşturun.
   - Bölge olarak Avrupa'dan birini (ör. Frankfurt) seçin.
   - Veritabanı şifresini bir yere not edin.
2. Soldaki menüden **SQL Editor** sayfasını açın ve **New query** deyin.
   - `supabase/1_kurulum.sql` dosyasının tamamını yapıştırıp **Run** deyin.
3. Yine **SQL Editor**'da yeni bir sorgu açın.
   - `supabase/2_mevcut_veriler.sql` dosyasının tamamını yapıştırıp **Run** deyin.
   - En altta şu toplamlar görünmeli:
     - 2024 → 910636.61
     - 2025 → 1857733.20
     - 2026 → 1370475.34
   - Bu dosyayı **yalnızca bir kez** çalıştırın.
4. **Authentication → Sign In / Providers** bölümünde **Allow new users to sign up** seçeneğini **kapatın**. Böylece yabancılar kendi kendine hesap açamaz.
5. **Authentication → Users → Add user → Create new user** ile sayfayı kullanacak her kişiyi ekleyin.
   - E-posta ve şifre girin.
   - **Auto Confirm User** seçeneğini işaretleyin.

### 2. Bağlantı bilgileri

1. Supabase'de **Project Settings → API Keys** (veya üstteki **Connect** düğmesi) bölümüne gidin.
2. Şu iki bilgiyi alıp `config.js` dosyasına yazın:
   - **Project URL** (ör. `https://abcd1234.supabase.co`) → `SUPABASE_URL`
   - **anon public** anahtarı ya da **publishable** anahtar (`sb_publishable_...`) → `SUPABASE_ANON_KEY`

> Bu anahtar herkese açık olabilir. Veriler giriş zorunluluğu ve veritabanı kurallarıyla (RLS) korunur.
> **service_role / secret** anahtarını asla bu dosyaya yazmayın.

### 3. GitHub Pages

1. Bu klasörü GitHub'da bir repoya yükleyin (push).
2. Repoda **Settings → Pages** bölümüne gidin.
   - **Source:** Deploy from a branch
   - **Branch:** `main` / `(root)` → **Save**
3. 1–2 dakika sonra site `https://KULLANICI_ADI.github.io/REPO_ADI/` adresinde açılır.

> `supabase/2_mevcut_veriler.sql` dosyası derneğin gerçek harcamalarını içerir. Bu yüzden `.gitignore` ile repodan **hariç tutulur**. Repo herkese açık olsa bile bu veriler GitHub'a gitmez.

---

## Kullanım

- **Giriş:** Size verilen e-posta ve şifreyle giriş yapın.
- **Kayıt ekleme:** Tarih, Belge Türü, Açıklama ve Tutarı girip **Kaydet** deyin.
  - Tutar `1.250,50` veya `1250,50` şeklinde yazılabilir.
  - Kayıt, tarihine göre doğru sıraya yerleşir.
- **Düzenleme:** Satırdaki **Düzenle** düğmesine basın. Tarih değişirse kaydın sırası da değişir.
- **Silme:** Satırdaki **Sil** düğmesine basın. Sonraki kayıtların sıra numarası birer azalır.
- **Excel:** Üstten yılı seçip **Excel İndir** deyin.
- **Yeni yıl:** O yılın tarihiyle ilk kaydı girmeniz yeterli. Yıl listesine kendiliğinden eklenir.

## Yedek

Supabase'de **Table Editor → giderler → Export → CSV** ile tüm kayıtları indirebilirsiniz. Ayrıca her yılın Excel'ini sayfadan indirebilirsiniz.

## Dosyalar

| Dosya | Görevi |
|---|---|
| `index.html`, `style.css`, `app.js` | Sayfanın kendisi |
| `config.js` | Supabase bağlantı bilgileri |
| `supabase/1_kurulum.sql` | Tablo, güvenlik kuralları ve sıra no fonksiyonları |
| `supabase/2_mevcut_veriler.sql` | 2024–2026 kayıtları (repoya gönderilmez) |

Sıra no mantığı veritabanındaki `gider_ekle`, `gider_guncelle` ve `gider_sil` fonksiyonlarındadır. Yeni kayıt, aynı yılda tarihi kendisinden küçük veya eşit olan son kaydın hemen arkasına yerleşir.

Kâğıt defterde tarih sırası dışında yazılmış birkaç eski kayıt (2024: 9–10 ve 38–39, 2025: 43–44) defterdeki numaralarıyla korunmuştur.
