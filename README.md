# 럽리브 페이스 분석결과지 v3 (최신 8쪽 양식 · Claude 분석 + GPT 이미지)

## 흐름
1. 정면·측면 사진 + 비율 앱 캡처 → **AI 분석**(Claude): 얼굴형·측면 판정, 8쪽 전체 문장, 이미지용 설명 작성
2. 단계별 확인·수정
3. **GPT 이미지**: 헤어 3 · 메이크업 가이드 1장 · 안경 3 · 귀걸이 3 (고객 사진 기반, 여러 번 만들어 고르기)
4. PDF 다운로드 / 구글 드라이브 저장

## 환경변수 (Vercel)
`.env.example` 참고. 기존 3개에 **OPENAI_API_KEY** 1개 추가가 필수입니다.

## 파일
- `api/analyze.js` 분석(Claude 또는 GPT) · `api/image.js` GPT 이미지 · `api/config.js`
- `kb/` 학습 자료 (gold_example = 김희주님 최신 양식)
- `public/js/` 화면·보고서 렌더링, `public/hair/` 헤어 참고 사진 68장
