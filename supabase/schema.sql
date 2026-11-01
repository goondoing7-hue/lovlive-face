-- 공용 임시저장: 기존 Google 로그인으로 인증한 Vercel 서버만 접근한다.
-- 브라우저에는 Supabase 관리자 키를 제공하지 않는다.
create table if not exists public.lovlive_face_projects (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 100),
  client_date date not null,
  step smallint not null check (step between 1 and 9),
  version integer not null default 1 check (version > 0),
  snapshot_path text not null,
  created_by text not null check (char_length(created_by) between 1 and 254),
  updated_by text not null check (char_length(updated_by) between 1 and 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lovlive_face_projects_snapshot_path_check
    check (snapshot_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.json$'))
);

create index if not exists lovlive_face_projects_updated_at_idx
  on public.lovlive_face_projects (updated_at desc, id);

alter table public.lovlive_face_projects enable row level security;
revoke all on table public.lovlive_face_projects from public, anon, authenticated;
grant select, insert, update on table public.lovlive_face_projects to service_role;

-- 버전별 불변 JSON 스냅샷. 클라이언트는 서버가 발급한 파일별 임시 URL만 사용한다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lovlive-face-drafts', 'lovlive-face-drafts', false, 26214400, array['application/json'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.lovlive_face_projects is
  'Shared face-report drafts; accessible only by the Vercel server after the existing Google allowlist check.';
