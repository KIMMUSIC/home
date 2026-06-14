# My DIY Home Dashboard

Notion/Linear 감성의 개인용 DIY 대시보드입니다. 기본 상태에서는 브라우저 `localStorage`에 저장되고, Supabase 환경변수와 Auth를 연결하면 계정 기반 멀티 디바이스 동기화가 켜집니다.

## Getting Started

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

## Supabase account sync

이 앱은 두 가지 저장 모드를 지원합니다.

1. **Local mode**: Supabase 환경변수가 없거나 로그인하지 않은 경우, 이 기기의 브라우저 `localStorage`에 저장합니다.
2. **Cloud sync mode**: Supabase Auth로 로그인하면 `dashboard_states` 테이블에 사용자별 대시보드 JSON을 저장합니다. RLS 정책은 `auth.uid() = user_id`만 허용합니다.

### 1. Supabase project 생성

Supabase Dashboard에서 프로젝트를 만든 뒤 SQL editor에서 아래 파일을 실행합니다.

```txt
supabase/schema.sql
```

핵심 테이블:

- `dashboard_states`: 전체 대시보드 상태 JSONB 저장
- `profiles`, `projects`, `todos`, `calendar_events`, `bookmarks`, `kanban_cards`: 향후 정규화 확장을 위한 테이블 초안

### 2. 환경변수 설정

`.env.local` 또는 Vercel Environment Variables에 추가합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

기존 Supabase 프로젝트가 legacy anon key를 쓰면 아래 변수도 fallback으로 지원합니다.

```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-legacy-anon-key
```

### 3. Auth 설정

현재 UI는 이메일 매직링크 로그인을 사용합니다.

Supabase Dashboard에서:

- Authentication → Providers → Email 활성화
- Authentication → URL Configuration에 로컬/배포 URL 추가
  - `http://localhost:3000`
  - Vercel 배포 도메인

로그인 후 첫 접속 시 이 기기의 로컬 데이터를 Supabase 계정에 seed하고, 이후 변경사항은 debounce 후 `dashboard_states`에 upsert합니다.

## Scripts

```bash
npm run dev
npm run lint
npm test
npm run build
```
