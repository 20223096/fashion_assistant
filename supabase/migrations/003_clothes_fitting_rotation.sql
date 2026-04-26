-- 가상 피팅: 사진 속 옷 방향(눕혀짐 등) 보정용 회전 각도(도)
alter table public.clothes_inventory
  add column if not exists fitting_rotation_deg real not null default 0;

comment on column public.clothes_inventory.fitting_rotation_deg is
  '시계 방향 회전(도). 세로 마네킹에 맞추기 위한 값. -180~180.';
