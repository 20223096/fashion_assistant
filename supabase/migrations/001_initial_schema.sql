-- my-closet: users 프로필, 옷장, 코디 추천 기록
-- Supabase SQL Editor에서 실행하거나 CLI로 migrate

-- 1) 사용자 프로필 (auth.users 와 1:1)
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clothes_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  image_url text not null,
  category text not null,
  style_tags text[] not null default '{}',
  season text not null check (season in ('spring_summer', 'fall_winter', 'all_season')),
  colors text[] not null default '{}',
  features text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists clothes_inventory_user_id_idx on public.clothes_inventory (user_id);
create index if not exists clothes_inventory_category_idx on public.clothes_inventory (user_id, category);

create table if not exists public.outfit_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  requested_style text not null,
  outfits jsonb not null default '[]',
  purchase_suggestions jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists outfit_recommendations_user_id_idx on public.outfit_recommendations (user_id);

-- 신규 가입 시 public.users 행 생성
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'nickname'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user ();

-- 기존 유저 동기화용 (선택)
create or replace function public.sync_user_from_auth ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
    set email = new.email,
        display_name = coalesce(
          new.raw_user_meta_data ->> 'name',
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'nickname',
          public.users.display_name
        ),
        avatar_url = coalesce(
          new.raw_user_meta_data ->> 'avatar_url',
          new.raw_user_meta_data ->> 'picture',
          public.users.avatar_url
        ),
        updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_updated
  after update on auth.users
  for each row
  execute procedure public.sync_user_from_auth ();

alter table public.users enable row level security;
alter table public.clothes_inventory enable row level security;
alter table public.outfit_recommendations enable row level security;

create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

create policy "clothes_select_own" on public.clothes_inventory
  for select using (auth.uid() = user_id);

create policy "clothes_insert_own" on public.clothes_inventory
  for insert with check (auth.uid() = user_id);

create policy "clothes_update_own" on public.clothes_inventory
  for update using (auth.uid() = user_id);

create policy "clothes_delete_own" on public.clothes_inventory
  for delete using (auth.uid() = user_id);

create policy "outfits_select_own" on public.outfit_recommendations
  for select using (auth.uid() = user_id);

create policy "outfits_insert_own" on public.outfit_recommendations
  for insert with check (auth.uid() = user_id);

-- Storage: 옷 이미지 버킷
insert into storage.buckets (id, name, public)
values ('closet-images', 'closet-images', true)
on conflict (id) do nothing;

create policy "closet_images_read"
  on storage.objects for select
  using (bucket_id = 'closet-images');

create policy "closet_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'closet-images'
    and (storage.foldername (name))[1] = auth.uid()::text
  );

create policy "closet_images_update_own"
  on storage.objects for update
  using (
    bucket_id = 'closet-images'
    and (storage.foldername (name))[1] = auth.uid()::text
  );

create policy "closet_images_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'closet-images'
    and (storage.foldername (name))[1] = auth.uid()::text
  );
