-- Bucket not found 방지: 버킷만 없을 때 SQL Editor에서 단독 실행해도 됨
insert into storage.buckets (id, name, public)
values ('closet-images', 'closet-images', true)
on conflict (id) do nothing;
