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
- WebRTC mesh 기반 참여자 간 실시간 음성
- 늦은 입장과 마이크 후활성화를 위한 WebRTC 재협상
- 같은 방 참여자 간 현재 페이지 동기화
- 모바일 Safari/Chrome 오디오 재생 정책 대응
- 읽기방별 고유 초대 코드와 참여자 멤버십
- 참여 중인 방/내가 만든 방 분리

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

## LIVE 음성 네트워크

현재 WebRTC ICE 설정은 공개 STUN 서버만 사용합니다.

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

홈과 MY 쪽GO의 독서 통계/달력은 아직 데모 데이터입니다. 녹음 파일 저장은 LIVE 독서방과 별도의 다음 단계 기능입니다.
