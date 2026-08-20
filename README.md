# 쪽GO — LIVE 독서방 v1

한 쪽씩, 함께 GO.

## 현재 구현
- Supabase 실제 이메일 회원가입
- 이메일 인증 후 로그인
- 로그인 상태 유지
- 가입 시 닉네임 저장(user metadata)
- MY 쪽GO에서 닉네임/이메일 표시
- 로그아웃
- 비로그인 사용자가 함께 읽기 기능을 누르면 로그인으로 이동
- Supabase DB 기반 읽기방 생성 및 소유한 방 조회
- Supabase Realtime Presence 기반 참여자 입장/퇴장 및 LIVE/음소거 상태
- LiveKit Cloud 또는 WebRTC mesh fallback 기반 참여자 간 실시간 음성
- 늦은 입장과 마이크 후활성화를 위한 WebRTC 재협상
- 같은 방 참여자 간 현재 페이지 동기화
- 모바일 Safari/Chrome 오디오 재생 정책 대응
- 읽기방별 고유 초대 코드와 참여자 멤버십
- 닉네임만 입력하는 익명 게스트 초대 링크 (`?invite=초대코드`)
- 참여 중인 방/내가 만든 방 분리
- Open Library 기반 도서 카탈로그 검색
- Google Books API 키 설정 시 통합 도서 검색
- 검색 결과가 없는 책의 제목·저자 임시 등록
- 방 소유자의 표지·출판사·ISBN 등 책 정보 보완

## 데이터베이스 마이그레이션

초대 코드와 멤버십 기능을 사용하려면 아래 SQL 마이그레이션을 Supabase에 먼저 적용해야 합니다.

```text
supabase/migrations/20260820030000_room_invites_v1.sql
```

Supabase Dashboard의 SQL Editor에 파일 내용을 붙여 넣고 실행하거나, Supabase CLI가 연결된 환경에서 migration을 적용하세요. 마이그레이션은 다음을 생성합니다.

- `reading_rooms.invite_code`
- `reading_room_members` 테이블
- 기존 방 소유자의 owner 멤버십
- 신규 방 owner 멤버십 자동 생성 trigger
- 초대 코드 입장용 `join_reading_room_by_code` RPC
- 읽기방과 멤버십 조회 RLS 정책

도서 검색, 임시 등록, 상세정보 보완 기능에는 다음 마이그레이션도 적용해야 합니다.

```text
supabase/migrations/20260820060000_book_catalog_v1.sql
```

이 마이그레이션은 기존 `books` 데이터를 삭제하지 않고 저자, 출판사, 출간일, ISBN, 표지, 데이터 출처와 작성자 필드를 추가합니다. 또한 검색 결과나 수동 입력을 중복 확인 후 저장하는 `save_catalog_book` RPC와 방 소유자의 책 정보 보완 정책을 만듭니다.

기존 책 ID와 자동 증가 시퀀스의 충돌을 방지하려면 다음 보완 마이그레이션도 적용하세요.

```text
supabase/migrations/20260820120000_realign_books_id_sequence.sql
```

게스트 입장을 운영 환경에서 안전하게 사용하려면 다음 보안 마이그레이션을 마지막으로 적용하세요.

```text
supabase/migrations/20260821010000_security_hardening_v1.sql
```

이 마이그레이션은 기존 초대 링크를 유지하면서 신규 초대 코드의 엔트로피를 높이고, 익명 게스트의 방·도서 생성 우회를 차단하며, `security definer` 함수의 검색 경로와 실행 권한을 제한합니다. 또한 도서 생성·수정을 검증된 RPC로 일원화하여 입력 길이·ISBN·표지 URL·출처를 서버에서 확인하고 다른 사용자가 만든 도서의 메타데이터를 권한 없이 변경하지 못하게 합니다. 페이지 동기화와 WebRTC fallback 신호 채널도 방 멤버만 접근 가능한 Supabase Realtime private channel로 보호합니다.

기본 도서 검색은 인증키가 필요 없는 Open Library를 사용합니다. 더 폭넓은 결과를 함께 표시하려면 Google Books API에서 발급하고 웹사이트 제한을 설정한 키를 아래 환경변수로 추가하세요. 키가 없어도 기본 검색과 직접 등록은 정상 동작합니다.

```text
VITE_GOOGLE_BOOKS_API_KEY
```

## LIVE 음성 네트워크

## 게스트 초대 링크

방 소유자가 방 목록의 초대 코드를 누르면 아래 형태의 링크가 복사됩니다.

```text
https://YOUR_PREVIEW_URL/?invite=ROOM_INVITE_CODE
```

비로그인 방문자는 닉네임만 입력하고 Supabase 익명 인증으로 임시 세션을 만든 뒤 기존 `join_reading_room_by_code` RPC를 통해 방 멤버가 됩니다. 이를 사용하려면 Supabase Dashboard의 Authentication 설정에서 Anonymous Sign-Ins를 활성화해야 합니다. 익명 사용자도 `authenticated` 역할을 사용하므로 기존 방 RLS와 LiveKit 토큰 검증을 그대로 거칩니다.

공개 링크의 남용 방지를 위해 정식 공개 전에는 CAPTCHA와 게스트 계정 정리 정책을 추가하세요. 게스트 세션은 정식 회원의 서재·기록으로 자동 승계되지 않습니다.

### LiveKit Cloud (권장)

LiveKit을 사용하면 미디어 연결, TURN fallback, 네트워크 전환 재연결을 관리형 RTC 인프라에 맡기면서 쪽GO의 기존 방·책·페이지 UI를 유지할 수 있습니다.

1. LiveKit Cloud에서 프로젝트를 만듭니다.
2. Vercel의 Preview 환경에 아래 서버 환경변수를 등록합니다.
3. 세 값 등록 후 `VITE_LIVEKIT_ENABLED=true`로 전환합니다.

```text
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
VITE_LIVEKIT_ENABLED=true
```

`LIVEKIT_API_SECRET`은 서버 전용입니다. `VITE_` 접두사를 붙이거나 브라우저 코드, GitHub, `.env.example`의 실제 값으로 저장하면 안 됩니다.

`api/livekit-token.js`는 Supabase access token을 검증하고 `reading_room_members` 멤버십이 확인된 사용자에게만 1시간짜리 LiveKit room token을 발급합니다. 토큰은 마이크 오디오 발행과 구독만 허용하며 카메라·화면 공유·데이터 발행 권한은 주지 않습니다. 로컬에서 이 API까지 테스트하려면 Vite 단독 실행 대신 Vercel 개발 서버 또는 별도 토큰 API 주소가 필요합니다.

### WebRTC mesh fallback

`VITE_LIVEKIT_ENABLED`가 `false`이거나 없으면 기존 WebRTC mesh가 동작합니다. 이 fallback의 ICE 설정은 공개 STUN 서버만 사용합니다.

```js
[{ urls: "stun:stun.l.google.com:19302" }]
```

STUN만으로 연결되지 않는 회사망, 일부 이동통신망, 대칭형 NAT 환경에서는 TURN 서버가 필요합니다. 실제 서비스 배포 전에는 운영용 TURN 제공자를 정하고 `src/hooks/useLiveRoom.js`의 `ICE_SERVERS`에 인증 정보가 포함된 TURN 항목을 환경변수 기반으로 추가해야 합니다. 이 저장소에는 임의의 TURN 주소나 credentials를 넣지 않습니다.

LIVE 음성은 브라우저의 마이크와 WebRTC를 사용하므로 로컬 개발에서는 `localhost`, 모바일 실기기에서는 HTTPS 주소로 테스트해야 합니다.

## 로컬 실행
기존 로컬 `.env`를 이 폴더에 복사하거나 `.env.example`을 참고해 `.env`를 만드세요.

```bash
npm install
npm run dev
```

## Vercel
`.env`는 GitHub에 올리지 마세요. Vercel Project Settings > Environment Variables에 아래 두 값을 등록해야 합니다.
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

LiveKit 전환 시에는 위의 LiveKit 환경변수 네 개도 Preview에 등록해야 합니다. 먼저 Preview에서 모바일 음성 테스트를 완료한 다음 Production에 같은 구성을 적용하세요.

홈과 MY 쪽GO의 독서 통계/달력은 아직 데모 데이터입니다. 녹음 파일 저장은 LIVE 독서방과 별도의 다음 단계 기능입니다.
