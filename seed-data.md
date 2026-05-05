# Realtime Database 처음 넣을 예시 데이터

Firebase Console → Realtime Database → Data 탭에서 아래 경로와 값을 만들면 페이지에 바로 표시됩니다.

날짜 키는 한국 날짜 기준 `YYYY-MM-DD` 형식입니다.

## `/dailyChallenges/2026-05-05`

```json
{
  "title": "종이컵 10개로 가장 높은 탑을 만들려면 어떤 구조가 좋을까요?",
  "description": "이유를 한 문장으로 적어보세요.",
  "status": "open"
}
```

## `/challengeAnswers/2026-05-05`

학생에게 읽히면 안 되는 정답 기준입니다. Realtime Database Rules에서 선생님만 읽고 쓰게 막습니다.

```json
{
  "exactAnswers": ["삼각형 구조"],
  "keywords": ["삼각형", "안정"]
}
```

## `/auctions/snack-ticket`

`endsAt`은 마감 시간의 Unix 밀리초 값입니다. 예: `1780498800000`

```json
{
  "title": "매점 간식 교환권",
  "category": "간식",
  "visible": true,
  "status": "open",
  "startPrice": 60,
  "currentPrice": 120,
  "endsAt": 1780498800000
}
```

## `/users/{학생 UID}`

Firebase Authentication에서 학생 계정을 만든 뒤, 해당 사용자의 UID를 복사해서 경로에 넣습니다.

```json
{
  "name": "김민준",
  "email": "202620501@junghwa.sen.ms.kr",
  "role": "student",
  "points": 0,
  "todayResult": "-"
}
```

선생님 계정은 `role`을 `"teacher"`로 넣어주세요. 첫 선생님 계정은 Firebase Console에서 직접 만들어야 합니다.
