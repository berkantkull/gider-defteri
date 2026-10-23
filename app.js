import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.79.0/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, DERNEK_ADI, DOSYA_ON_EKI } from "./config.js";

// ---------- Yardımcılar ----------
const $ = (id) => document.getElementById(id);
const paraBicim = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tl = (n) => paraBicim.format(Number(n) || 0);
const tarihGoster = (iso) => { const [y, a, g] = iso.split("-"); return `${g}.${a}.${y}`; };
const bugunIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// "1.234,56" / "1234,56" / "1234.56" / "1.234" -> sayı
export function tutarCoz(metin) {
  let s = String(metin ?? "").trim().replace(/\s|₺|TL/gi, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100) / 100;
}

let bildirimZaman;
function bildir(mesaj, hata = false) {
  const el = $("bildirim");
  el.textContent = mesaj;
  el.classList.toggle("hata-bildirim", hata);
  el.hidden = false;
  clearTimeout(bildirimZaman);
  bildirimZaman = setTimeout(() => (el.hidden = true), hata ? 6000 : 4000);
}

function hataMetni(err) {
  const m = err?.message || String(err);
  if (/Invalid login credentials/i.test(m)) return "E-posta veya şifre hatalı.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Bağlantı kurulamadı. İnternetinizi kontrol edin.";
  if (/JWT|not authorized|permission denied/i.test(m)) return "Oturum süresi dolmuş olabilir. Çıkış yapıp tekrar girin.";
  return m;
}

// ---------- Durum ----------
let sb;
let kayitlar = [];
let seciliYil = null;
let duzenlenenId = null;
let vurguluId = null;
let anaYuklendi = false;

// ---------- Başlangıç ----------
$("dernekAdi").textContent = DERNEK_ADI;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  $("ayarEksik").hidden = false;
} else {
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange((_olay, oturum) => ekranAyarla(oturum));
  const { data } = await sb.auth.getSession();
  ekranAyarla(data.session);
}

function ekranAyarla(oturum) {
  const girisli = !!oturum;
  $("girisEkrani").hidden = girisli;
  $("anaEkran").hidden = !girisli;
  $("kullaniciAlani").hidden = !girisli;
  if (girisli) {
    $("kullaniciEposta").textContent = oturum.user.email || "";
    if (!anaYuklendi) { anaYuklendi = true; anaBaslat(); }
  } else {
    anaYuklendi = false;
  }
}

// ---------- Giriş / çıkış ----------
$("girisForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("girisBtn"), hata = $("girisHata");
  hata.hidden = true;
  const email = $("girisEposta").value.trim(), password = $("girisSifre").value;
  if (!email || !password) { hata.textContent = "E-posta ve şifre girin."; hata.hidden = false; return; }
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  if (error) { hata.textContent = hataMetni(error); hata.hidden = false; }
  else $("girisSifre").value = "";
});

$("cikisBtn").addEventListener("click", async () => { await sb.auth.signOut(); });

// ---------- Ana ekran ----------
async function anaBaslat() {
  formSifirla();
  await yillariYukle();
}

async function yillariYukle(tercih) {
  const { data, error } = await sb.rpc("gider_yillar");
  if (error) { bildir(hataMetni(error), true); return; }
  const buYil = new Date().getFullYear();
  const yillar = new Set((data || []).map(Number));
  yillar.add(buYil);
  if (tercih) yillar.add(tercih);
  const sirali = [...yillar].sort((a, b) => b - a);
  const sec = $("yilSec");
  sec.innerHTML = sirali.map((y) => `<option value="${y}">${y}</option>`).join("");
  seciliYil = tercih || seciliYil || buYil;
  if (!yillar.has(seciliYil)) seciliYil = buYil;
  sec.value = String(seciliYil);
  await listeyiYukle();
}

$("yilSec").addEventListener("change", async (e) => {
  seciliYil = Number(e.target.value);
  vurguluId = null;
  if (!duzenlenenId) formSifirla();
  await listeyiYukle();
});

async function listeyiYukle() {
  const { data, error } = await sb
    .from("giderler")
    .select("id, yil, sira, tarih, tur, aciklama, tutar")
    .eq("yil", seciliYil)
    .order("sira", { ascending: true })
    .range(0, 4999);
  if (error) { bildir(hataMetni(error), true); return; }
  kayitlar = (data || []).map((k) => ({ ...k, tutar: Number(k.tutar) }));
  tabloyuCiz();
}

function tabloyuCiz() {
  const ara = $("araKutusu").value.trim().toLocaleLowerCase("tr-TR");
  const gosterilen = ara ? kayitlar.filter((k) => k.aciklama.toLocaleLowerCase("tr-TR").includes(ara)) : kayitlar;
  const govde = $("tabloGovde");
  govde.innerHTML = "";
  for (const k of gosterilen) {
    const tr = document.createElement("tr");
    tr.dataset.id = k.id;
    if (vurguluId != null && String(k.id) === String(vurguluId)) tr.classList.add("vurgulu");
    tr.innerHTML = `
      <td class="sira"></td><td class="tarih"></td><td class="tur"></td><td class="aciklama"></td>
      <td class="tutar"></td>
      <td><div class="islemler">
        <button type="button" class="btn btn-ince btn-kucuk" data-islem="duzenle">Düzenle</button>
        <button type="button" class="btn btn-ince btn-kucuk btn-sil" data-islem="sil">Sil</button>
      </div></td>`;
    tr.querySelector(".sira").textContent = k.sira;
    tr.querySelector(".tarih").textContent = tarihGoster(k.tarih);
    tr.querySelector(".tur").textContent = k.tur;
    tr.querySelector(".aciklama").textContent = k.aciklama;
    tr.querySelector(".tutar").textContent = tl(k.tutar);
    govde.appendChild(tr);
  }
  const toplam = kayitlar.reduce((t, k) => t + k.tutar, 0);
  $("toplamEtiket").textContent = `${seciliYil} YILI TOPLAM GİDER`;
  $("toplamTutar").textContent = tl(toplam);
  $("listeBaslik").textContent = `${seciliYil} Giderleri (${kayitlar.length} kayıt)`;
  $("bosMesaj").hidden = kayitlar.length > 0;
  if (vurguluId) govde.querySelector(`tr[data-id="${vurguluId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
}

$("araKutusu").addEventListener("input", tabloyuCiz);

$("tabloGovde").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-islem]");
  if (!btn) return;
  const id = btn.closest("tr").dataset.id;
  const k = kayitlar.find((x) => String(x.id) === id);
  if (!k) return;
  if (btn.dataset.islem === "duzenle") duzenlemeyeAl(k);
  else await sil(k);
});

// ---------- Form ----------
function formSifirla() {
  duzenlenenId = null;
  $("kayitForm").reset();
  $("kayitForm").classList.remove("duzenleme");
  $("formBaslik").textContent = "Yeni Gider";
  $("kaydetBtn").textContent = "Kaydet";
  $("iptalBtn").hidden = true;
  $("formHata").hidden = true;
  const buYil = new Date().getFullYear();
  $("fTarih").value = seciliYil && seciliYil !== buYil ? `${seciliYil}-01-01` : bugunIso();
}

function duzenlemeyeAl(k) {
  duzenlenenId = k.id;
  $("fTarih").value = k.tarih;
  $("fTur").value = [...$("fTur").options].some((o) => o.value === k.tur) ? k.tur : "Diğer";
  $("fAciklama").value = k.aciklama;
  $("fTutar").value = tl(k.tutar);
  $("kayitForm").classList.add("duzenleme");
  $("formBaslik").textContent = `Kaydı Düzenle (Sıra ${k.sira})`;
  $("kaydetBtn").textContent = "Değişikliği Kaydet";
  $("iptalBtn").hidden = false;
  $("formHata").hidden = true;
  $("kayitForm").scrollIntoView({ behavior: "smooth", block: "start" });
  $("fAciklama").focus();
}

$("iptalBtn").addEventListener("click", formSifirla);

$("kayitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const hata = $("formHata");
  hata.hidden = true;
  const tarih = $("fTarih").value;
  const tur = $("fTur").value;
  const aciklama = $("fAciklama").value.trim();
  const tutar = tutarCoz($("fTutar").value);
  const eksik = [];
  if (!tarih) eksik.push("tarih");
  if (!aciklama) eksik.push("açıklama");
  if (!(tutar > 0)) eksik.push("geçerli bir tutar");
  if (eksik.length) { hata.textContent = `Lütfen ${eksik.join(", ")} girin.`; hata.hidden = false; return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || Number(tarih.slice(0, 4)) < 2000) {
    hata.textContent = "Tarih geçersiz."; hata.hidden = false; return;
  }

  const btn = $("kaydetBtn");
  btn.disabled = true;
  const eskiId = duzenlenenId;
  const { data, error } = eskiId
    ? await sb.rpc("gider_guncelle", { p_id: eskiId, p_tarih: tarih, p_tur: tur, p_aciklama: aciklama, p_tutar: tutar })
    : await sb.rpc("gider_ekle", { p_tarih: tarih, p_tur: tur, p_aciklama: aciklama, p_tutar: tutar });
  btn.disabled = false;
  if (error) { hata.textContent = hataMetni(error); hata.hidden = false; return; }

  const sonuc = typeof data === "string" ? JSON.parse(data) : data;
  const yeniYil = Number(sonuc.yil);
  let mesaj = eskiId ? `Kayıt güncellendi (sıra ${sonuc.sira}).` : `Kayıt ${sonuc.sira} numaraya eklendi.`;
  if (sonuc.kayan > 0) mesaj += " Diğer kayıtların sıra numaraları tarihe göre güncellendi.";
  bildir(mesaj);

  seciliYil = yeniYil;
  await yillariYukle(yeniYil);
  vurguluId = eskiId || kayitlar.find((k) => k.sira === Number(sonuc.sira))?.id || null;
  tabloyuCiz();
  const sonTarih = tarih;
  formSifirla();
  if (!eskiId) $("fTarih").value = sonTarih; // art arda giriş kolaylığı
});

async function sil(k) {
  const onay = confirm(
    `Bu kayıt silinsin mi?\n\nSıra ${k.sira} · ${tarihGoster(k.tarih)} · ${k.tur}\n${k.aciklama}\n${tl(k.tutar)} TL\n\nSonraki kayıtların sıra numarası birer azalacak.`
  );
  if (!onay) return;
  const { error } = await sb.rpc("gider_sil", { p_id: k.id });
  if (error) { bildir(hataMetni(error), true); return; }
  if (String(duzenlenenId) === String(k.id)) formSifirla();
  vurguluId = null;
  bildir(`Sıra ${k.sira} silindi.`);
  await yillariYukle(seciliYil);
}

// ---------- Excel ----------
$("excelBtn").addEventListener("click", async () => {
  if (!window.ExcelJS) { bildir("Excel aracı yüklenemedi. Sayfayı yenileyin.", true); return; }
  if (!kayitlar.length) { bildir("Bu yıl için kayıt yok.", true); return; }
  const btn = $("excelBtn");
  btn.disabled = true;
  try {
    const buf = await excelOlustur(seciliYil, kayitlar);
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${DOSYA_ON_EKI}-${seciliYil}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (err) {
    bildir("Excel oluşturulamadı: " + hataMetni(err), true);
  } finally {
    btn.disabled = false;
  }
});

export async function excelOlustur(yil, liste) {
  const wb = new window.ExcelJS.Workbook();
  wb.creator = DERNEK_ADI;
  const ws = wb.addWorksheet(String(yil), { views: [{ state: "frozen", ySplit: 3 }] });
  ws.columns = [{ width: 9 }, { width: 13 }, { width: 15 }, { width: 58 }, { width: 16 }];

  const font = { name: "Arial", size: 10 };
  const ince = { style: "thin", color: { argb: "FF999999" } };
  const kenar = { top: ince, left: ince, bottom: ince, right: ince };

  ws.getCell("A1").value = `${yil} Yılı Gider Listesi`;
  ws.getCell("A1").font = { name: "Arial", size: 14, bold: true };

  const basliklar = ["Sıra No", "Tarih", "Belge Türü", "Açıklama", "Tutar (TL)"];
  const bas = ws.getRow(3);
  basliklar.forEach((b, i) => {
    const c = bas.getCell(i + 1);
    c.value = b;
    c.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF305496" } };
    c.alignment = { horizontal: "center" };
    c.border = kenar;
  });

  liste.forEach((k, i) => {
    const r = ws.getRow(4 + i);
    const [y, a, g] = k.tarih.split("-").map(Number);
    r.values = [k.sira, new Date(Date.UTC(y, a - 1, g)), k.tur, k.aciklama, Number(k.tutar)];
    for (let c = 1; c <= 5; c++) { r.getCell(c).font = font; r.getCell(c).border = kenar; }
    r.getCell(1).alignment = { horizontal: "center" };
    r.getCell(2).alignment = { horizontal: "center" };
    r.getCell(3).alignment = { horizontal: "center" };
    r.getCell(2).numFmt = "dd.mm.yyyy";
    r.getCell(5).numFmt = "#,##0.00";
  });

  const son = 3 + liste.length;
  const tr = ws.getRow(son + 1);
  const toplam = Math.round(liste.reduce((t, k) => t + Number(k.tutar), 0) * 100) / 100;
  tr.getCell(4).value = `${yil} YILI TOPLAM GİDER`;
  tr.getCell(4).alignment = { horizontal: "right" };
  tr.getCell(5).value = { formula: `SUM(E4:E${son})`, result: toplam };
  tr.getCell(5).numFmt = "#,##0.00";
  const cift = { style: "double", color: { argb: "FF000000" } };
  for (let c = 1; c <= 5; c++) {
    const h = tr.getCell(c);
    h.font = { name: "Arial", size: 10, bold: true };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
    h.border = { top: cift, bottom: cift };
  }
  return wb.xlsx.writeBuffer();
}
