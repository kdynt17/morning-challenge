# 2-5 아침 챌린지

정식 주소: https://kdynt17.github.io/morning-challenge/
Firebase 프로젝트: morning-quest (Spark). 다른 저장소의 규칙을 배포하지 마세요.

학생용 최신 규칙은 [게임·포인트 규칙](rules.html)을 참고하세요.

- 5영역 두뇌교실(메인 앱 안의 '두뇌교실' 화면)에 시간제 15게임(20~45초)을 모았습니다. 색깔 판단·계산 20도 같은 방식으로 다시 만들었고, 순간기억 단계 도전은 순간기억에 합쳤습니다. academy/ 주소는 ./?page=games 로 넘어갑니다.
- 연습 전 설명서(다시 보지 않기 지원), 게임별 최고 기록 순위가 있습니다. 영역 기록은 40초 한 판 기준으로 환산합니다(domain.mjs areaPoints).
- 지뢰찾기 UI·실행 코드·월말 보상을 제거했습니다. 과거 DB 기록은 삭제하지 않고 쓰기만 차단했습니다.
- 매일 도전은 시간제 15게임 중 5영역 각 하나입니다. 게임별 시간은 academy/functions/domain.mjs 의 ROUND_TIME 에 있습니다.
- 출석10P(월~금, 로그인하면 자동)/7일연속30P, 도전완료 순위보상 max(20, 100-5×(등수-1))P(06시 마감 후 접속 시 지급), 연습 영역당10P·하루50P. 별도30P 보상은 폐지합니다.
- 모든 잔액은 원래 users/uid/points와 leaderboardUsers를 사용합니다. 신규 게임 기록은 academy 경로이며 예전 records 경로는 읽기 기록으로만 남겨 둡니다.
- 순위 화면은 포인트 순위만 보여줍니다.
- 말랑그램은 영역별 최근7회 평균입니다. 영역 100(꽉 참) 기준점수는 academy/brain-score.js 의 AREA_REFERENCE 입니다. 실제 IQ가 아닙니다.
- 새 가입 승인, 자동로그인, 출석, 상점, 선생님 직접지급은 유지합니다.
- 학급 내부 신뢰를 전제로 하는 클라이언트 채점·보상 방식입니다. 승인된 학생의 개발자도구 조작까지 막는 서버 시스템은 아닙니다.

## 검증·배포

npm test / npm run check / npm run test:ui (Playwright 필요)
로컬 DB 에뮬레이터에서 npm run test:academy 로 포인트 중복지급·기존잔액·영역별 연습 보상 상한·게임 잠금을 검사합니다.
Firebase database.rules.json 배포 후 main 병합으로 GitHub Pages를 갱신합니다. Functions·유료서비스를 사용하지 않습니다.
