-- =====================================================================
-- Dernek Gider Defteri - Supabase kurulumu
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını
-- yapıştırın > Run. (Bir kez çalıştırmanız yeterli.)
-- =====================================================================

create table if not exists public.giderler (
  id          bigint generated always as identity primary key,
  yil         int           not null,
  sira        int           not null,
  tarih       date          not null,
  tur         text          not null,
  aciklama    text          not null,
  tutar       numeric(14,2) not null check (tutar >= 0),
  olusturan   uuid          default auth.uid(),
  olusturma   timestamptz   not null default now(),
  guncelleme  timestamptz   not null default now(),
  constraint giderler_yil_tarih check (yil = extract(year from tarih)::int),
  constraint giderler_yil_sira unique (yil, sira) deferrable initially deferred
);

create index if not exists giderler_yil_tarih_idx on public.giderler (yil, tarih);

-- Sadece giriş yapmış kullanıcılar okuyup yazabilir
alter table public.giderler enable row level security;

drop policy if exists "giris_yapan_okur"   on public.giderler;
drop policy if exists "giris_yapan_yazar"  on public.giderler;
create policy "giris_yapan_okur"  on public.giderler for select to authenticated using (true);
create policy "giris_yapan_yazar" on public.giderler for all    to authenticated using (true) with check (true);

revoke all on public.giderler from anon;
grant select, insert, update, delete on public.giderler to authenticated;

-- ---------------------------------------------------------------------
-- Yeni kaydın sırası: aynı yılda tarihi kendisinden küçük veya eşit olan
-- son kaydın hemen arkası. Sonrakiler birer kayar.
-- ---------------------------------------------------------------------
create or replace function public._gider_yeni_sira(p_yil int, p_tarih date, p_haric bigint)
returns int language sql stable as $$
  select coalesce(max(sira), 0) + 1
  from public.giderler
  where yil = p_yil and tarih <= p_tarih and id is distinct from p_haric;
$$;

create or replace function public.gider_ekle(p_tarih date, p_tur text, p_aciklama text, p_tutar numeric)
returns json language plpgsql security invoker as $$
declare
  v_yil int := extract(year from p_tarih)::int;
  v_sira int;
  v_kayan int;
begin
  if coalesce(trim(p_tur),'') = '' or coalesce(trim(p_aciklama),'') = '' or p_tutar is null then
    raise exception 'Tüm alanlar doldurulmalı';
  end if;
  perform pg_advisory_xact_lock(v_yil);
  v_sira := public._gider_yeni_sira(v_yil, p_tarih, null);
  update public.giderler set sira = sira + 1 where yil = v_yil and sira >= v_sira;
  get diagnostics v_kayan = row_count;
  insert into public.giderler (yil, sira, tarih, tur, aciklama, tutar)
  values (v_yil, v_sira, p_tarih, trim(p_tur), trim(p_aciklama), round(p_tutar, 2));
  return json_build_object('yil', v_yil, 'sira', v_sira, 'kayan', v_kayan);
end $$;

create or replace function public.gider_guncelle(p_id bigint, p_tarih date, p_tur text, p_aciklama text, p_tutar numeric)
returns json language plpgsql security invoker as $$
declare
  v_eski record;
  v_yil int := extract(year from p_tarih)::int;
  v_sira int;
  v_kayan int := 0;
  n int;
begin
  if coalesce(trim(p_tur),'') = '' or coalesce(trim(p_aciklama),'') = '' or p_tutar is null then
    raise exception 'Tüm alanlar doldurulmalı';
  end if;
  select * into v_eski from public.giderler where id = p_id for update;
  if not found then raise exception 'Kayıt bulunamadı'; end if;

  -- Tarih değişmediyse yeri de değişmez
  if v_eski.tarih = p_tarih then
    update public.giderler
       set tur = trim(p_tur), aciklama = trim(p_aciklama), tutar = round(p_tutar, 2), guncelleme = now()
     where id = p_id;
    return json_build_object('yil', v_yil, 'sira', v_eski.sira, 'kayan', 0);
  end if;

  perform pg_advisory_xact_lock(least(v_eski.yil, v_yil));
  perform pg_advisory_xact_lock(greatest(v_eski.yil, v_yil));

  -- Eski yerinden çıkar
  update public.giderler set sira = sira - 1
   where yil = v_eski.yil and sira > v_eski.sira and id <> p_id;
  get diagnostics n = row_count; v_kayan := v_kayan + n;

  -- Yeni yerine koy
  v_sira := public._gider_yeni_sira(v_yil, p_tarih, p_id);
  update public.giderler set sira = sira + 1
   where yil = v_yil and sira >= v_sira and id <> p_id;
  get diagnostics n = row_count; v_kayan := v_kayan + n;

  update public.giderler
     set yil = v_yil, sira = v_sira, tarih = p_tarih, tur = trim(p_tur),
         aciklama = trim(p_aciklama), tutar = round(p_tutar, 2), guncelleme = now()
   where id = p_id;
  return json_build_object('yil', v_yil, 'sira', v_sira, 'kayan', v_kayan);
end $$;

create or replace function public.gider_sil(p_id bigint)
returns json language plpgsql security invoker as $$
declare
  v_eski record;
  v_kayan int;
begin
  select * into v_eski from public.giderler where id = p_id for update;
  if not found then raise exception 'Kayıt bulunamadı'; end if;
  perform pg_advisory_xact_lock(v_eski.yil);
  delete from public.giderler where id = p_id;
  update public.giderler set sira = sira - 1 where yil = v_eski.yil and sira > v_eski.sira;
  get diagnostics v_kayan = row_count;
  return json_build_object('yil', v_eski.yil, 'sira', v_eski.sira, 'kayan', v_kayan);
end $$;

create or replace function public.gider_yillar()
returns setof int language sql stable security invoker as $$
  select distinct yil from public.giderler order by yil;
$$;

revoke execute on function public.gider_ekle(date,text,text,numeric) from anon, public;
revoke execute on function public.gider_guncelle(bigint,date,text,text,numeric) from anon, public;
revoke execute on function public.gider_sil(bigint) from anon, public;
revoke execute on function public.gider_yillar() from anon, public;
revoke execute on function public._gider_yeni_sira(int,date,bigint) from anon, public;
grant execute on function public.gider_ekle(date,text,text,numeric) to authenticated;
grant execute on function public.gider_guncelle(bigint,date,text,text,numeric) to authenticated;
grant execute on function public.gider_sil(bigint) to authenticated;
grant execute on function public.gider_yillar() to authenticated;
grant execute on function public._gider_yeni_sira(int,date,bigint) to authenticated;
