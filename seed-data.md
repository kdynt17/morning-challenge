# 처음 넣을 예시 데이터

Firebase Console → Realtime Database → Data 탭에서 만들 수 있습니다. 대부분의 데이터는 앱이 알아서 만듭니다.

## `/users/{학생 UID}`

학생은 회원가입하면 자동으로 만들어지고, 선생님이 `developer/`에서 승인합니다.
선생님 계정은 `role`을 `"teacher"`로 넣어주세요. 첫 선생님 계정은 Firebase Console에서 직접 만들어야 합니다.

```json
{
  "name": "김민준",
  "email": "202620501@junghwa.sen.ms.kr",
  "authEmail": "202620501@junghwa.sen.ms.kr",
  "role": "student",
  "status": "approved",
  "points": 0,
  "todayResult": "-"
}
```

## `/storeProducts/{상품 ID}`

선생님 관리 화면에서 추가하는 것이 편합니다.

```json
{
  "title": "매점 간식 교환권",
  "description": "선생님께 보여주고 간식 하나 받기",
  "price": 300,
  "pinned": true,
  "visible": true
}
```

## 앱이 만드는 데이터

| 경로 | 내용 |
|---|---|
| `attendance/{uid}` | 마지막 출석일(한국 날짜 번호), 연속·누적 출석 |
| `attendanceDays/{날짜 번호}/{uid}` | 그날 출석한 학생 (선생님 화면) |
| `gameDaily/{uid}` | 오늘 받은 게임 포인트 (하루 30P 상한) |
| `msRecords/{YYYY-MM}/{난이도}/{uid}` | 이번 달 최고 기록 (순위표) |
| `msBest/{uid}/{난이도}` | 역대 최고 기록 |
| `gameStats/{uid}/{난이도}` | 플레이·성공 횟수 |
| `monthlyRewards/{YYYY-MM}` | 월말 보상 지급 기록 (중복 지급 방지) |
| `records/{YYYY-MM}/{calc·stroop·memory}/{uid}` | 두뇌 게임 이번 달 최고 기록 |
| `brain/{uid}` | 영역별 최근 10판 점수, XP, 두뇌 지수(BQ) |
