-- 하의 세부 타입(긴바지/반바지/스커트/테니스스커트) 컬럼 추가.
-- 가상 피팅에서 서로 다른 실루엣·기장으로 렌더링하기 위해 사용합니다.
-- 카테고리가 "하의"가 아닐 때는 NULL.

alter table public.clothes_inventory
  add column if not exists bottom_subtype text;

alter table public.clothes_inventory
  drop constraint if exists clothes_inventory_bottom_subtype_check;

alter table public.clothes_inventory
  add constraint clothes_inventory_bottom_subtype_check
  check (
    bottom_subtype is null
    or bottom_subtype in ('pants', 'shorts', 'skirt', 'tennis_skirt')
  );

comment on column public.clothes_inventory.bottom_subtype is
  '하의 세부 타입. pants(긴바지) · shorts(반바지) · skirt(스커트) · tennis_skirt(테니스스커트). 하의가 아닐 때 NULL.';

-- 기존 하의 로우는 기본적으로 pants 로 간주해도 기존 렌더링과 동일하기 때문에
-- 여기서 일괄 업데이트는 하지 않고, 필요 시 관리자가 다음과 같이 수동 보정:
--   update public.clothes_inventory set bottom_subtype = 'pants' where category = '하의' and bottom_subtype is null;
