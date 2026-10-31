# 럽리브 페이스 분석결과지 제작 프로그램

김보라님 결과지(250108)와 같은 6쪽 양식을 만드는 웹 프로그램입니다.
정면·측면 사진 2장과 비율 앱 캡처를 넣으면, 기존 보고서와 하영님 분석 초안을 참고한 AI가 내용을 작성하고, 사람이 확인·수정한 뒤 PDF와 구글 드라이브로 저장합니다.

## 무엇이 자동인가
| 쪽 | 자동 | 사람이 하는 것 |
|---|---|---|
| 1 표지 | 이름 | – |
| 2 사진·얼굴형·측면 | 정면 타원·기준선, 측면 기준선·E-line 그림 / 얼굴형·측면 판정 / 요약 2줄 | 판정 확인, 측면 점 위치 미세조정 |
| 3·4 비율 해석 | 비율 숫자(앱 캡처 자동 읽기), 해석 문장 | 숫자·문장 확인 |
| 4 안경·귀걸이 | 얼굴형 기반 추천 체크 | 추가·해제 선택 |
| 5 메이크업 | 하이라이터·쉐딩·블러셔 등 손글씨 표시 사진, 전략 6항목 | 표시 항목 켜고 끄기, 문구 수정 |
| 6 헤어 | 기존 보고서 헤어 사진 68장 중 3장 선택(얼굴 회색 원 자동), 스타일·포인트 문장 | 사진 교체, 문장 수정 |

## 배포 (GitHub + Vercel) — 처음 한 번만
1. **구글 로그인 키 만들기** (Google Cloud Console)
   - console.cloud.google.com → 새 프로젝트 → "API 및 서비스" → "OAuth 동의 화면": 외부, 테스트 사용자에 `goondoing7@gmail.com`, `chayoung9310@gmail.com` 추가
   - "라이브러리"에서 **Google Drive API** 사용 설정
   - "사용자 인증 정보" → OAuth 클라이언트 ID → 웹 애플리케이션 → 승인된 자바스크립트 원본에 `https://(vercel 주소)` 입력 → 클라이언트 ID 복사
2. **Anthropic API 키**: console.anthropic.com → API Keys
3. **GitHub**: 새 저장소(비공개 권장)를 만들고 이 폴더 전체를 올립니다 (웹에서 "Upload files"로 드래그해도 됩니다).
4. **Vercel**: vercel.com → Add New Project → 그 저장소 선택 → Environment Variables에 아래 입력 → Deploy
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   GOOGLE_CLIENT_ID  = ....apps.googleusercontent.com
   ALLOWED_EMAILS    = goondoing7@gmail.com,chayoung9310@gmail.com
   ```
   (선택) `CLAUDE_MODEL`, `DRIVE_FOLDER_NAME`
5. 배포 주소를 1번의 "승인된 자바스크립트 원본"에 넣었는지 다시 확인합니다.

> 로그인은 서버에서도 한 번 더 검사합니다. 허용된 두 계정이 아니면 AI 기능이 동작하지 않습니다.
> Vercel 무료(Hobby) 플랜은 함수 실행 시간이 짧을 수 있습니다. 분석이 60초를 넘겨 실패하면 Pro 플랜을 쓰거나 `CLAUDE_MODEL`을 더 빠른 모델로 바꾸세요.

## 사용 순서
1. 사진·비율 입력 → 2. AI 분석 → 3~7 단계별 확인·수정 → 8. PDF 다운로드 / 드라이브 저장
- 드라이브: `럽리브_페이스분석결과지/날짜_페이스_이름/` 안에 PDF·project.json·사진이 저장됩니다. 다음 분석 때 최근 3건이 문체 참고로 쓰입니다.
- 작업 중 내용은 브라우저에 자동 저장됩니다.

## 학습 자료 바꾸기
- `kb/knowledge.md` 작성 지침(판정 기준·추천 규칙) — 하영님 기준이 바뀌면 여기를 고치세요.
- `kb/gold_example.md` 기준 보고서 문장 — 마음에 드는 새 보고서로 바꿔도 됩니다.
- `kb/drafts/` 하영님 분석 초안(docx에서 추출)
- `public/hair/` 헤어 사진과 `library.json`(이름·길이·얼굴형). 사진을 추가하면 `library.json`에 한 줄 추가하세요.

## 로컬 점검
```
npm install
DEV_NO_AUTH=1 MOCK_AI=1 node dev/server.mjs   # http://localhost:3000 (예시 응답, 로그인 없음)
```
