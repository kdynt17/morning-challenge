# 아침 창의력 챌린지

학생들이 매일 아침 창의력 문제를 풀고 포인트를 모아 경매에 참여하는 학급 페이지 시안입니다.

## GitHub Pages 배포

1. 이 폴더를 GitHub 저장소에 올립니다.
2. GitHub 저장소의 `Settings` → `Pages`로 이동합니다.
3. `Build and deployment`에서 `Deploy from a branch`를 선택합니다.
4. Branch를 `main`, 폴더를 `/root`로 선택한 뒤 저장합니다.

## Firebase 연결 예정 기능

- 학생 로그인
- 매일 문제 공개
- 정답 제출 및 선착순 포인트 지급
- 누적 포인트 순위표
- 선생님 상품 등록
- 포인트 경매 입찰 및 낙찰 처리


## 가입 승인

- 새로 가입한 학생은 `status: "pending"` 상태로 시작하며, 선생님이 승인하기 전까지 대기 화면만 보입니다.
- 선생님은 `developer/` 페이지(관리 화면의 "가입자 관리 페이지 열기")에서 승인·거절·승인 취소를 합니다.
- 승인 기능 이전에 가입한 학생은 `status`가 없으며 승인된 것으로 처리됩니다.
- 학생 계정으로 `developer/`에 로그인하면 바로 로그아웃되고, 데이터베이스 규칙상 가입자 목록도 읽을 수 없습니다.

## 비밀번호 재설정

로그인 화면의 "비밀번호를 잊었어요"를 누르면 입력한 이메일로 Firebase 재설정 메일이 발송됩니다.
메일 문구는 Firebase Console → Authentication → 템플릿에서 바꿀 수 있습니다.

## 데이터베이스 규칙 게시

`database.rules.json`을 바꾼 뒤에는 Firebase Console → Realtime Database → 규칙 탭에 내용을 붙여넣고 게시해야 적용됩니다.
