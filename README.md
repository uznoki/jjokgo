# 쪽GO v0.4 — Auth

한 쪽씩, 함께 GO.

## 이번 버전
- Supabase 실제 이메일 회원가입
- 이메일 인증 후 로그인
- 로그인 상태 유지
- 가입 시 닉네임 저장(user metadata)
- MY 쪽GO에서 닉네임/이메일 표시
- 로그아웃
- 비로그인 사용자가 함께 읽기 기능을 누르면 로그인으로 이동

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

읽기방/달력은 아직 데모 데이터이며 다음 버전에서 DB와 연결합니다.
