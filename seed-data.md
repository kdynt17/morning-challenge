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
| `quiz/questions/{문제 ID}` | 문제(제목·출제자·내용·사진·유형·보기·1등 포인트·기회·공개 여부) |
| `quiz/answers/{문제 ID}` | 정답 키와 보여 줄 정답 (선생님만 읽기) |
| `quiz/attempts/{문제 ID}/{uid}` | 학생이 낸 횟수와 마지막 답 |
| `quiz/correct/{문제 ID}/{uid}` | 맞힌 시각(서버 시각) — 맞힌 순서 |
| `quiz/awards/{문제 ID}/{uid}` | 등수·받은 포인트·지급 여부 |
| `settings/gamesLocked` | 문제 풀이 잠금 |
| `academy/…`, `records/…` 등 | 예전 게임 기록(읽기 전용) |
