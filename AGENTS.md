# Deployment identity

This is the user's canonical app: https://kdynt17.github.io/morning-challenge/.
Deploy this repository's database.rules.json to Firebase project morning-quest.
The sibling morning-quest-app shares that Firebase project but has incompatible rules.
Never replace this repository or its rules with the sibling's files wholesale.
Keep the original users/{uid}/points balance, leaderboardUsers, attendance, shop,
student approvals and the lock switch (settings/gamesLocked, now the quiz answer lock).
As of 2026-11 the brain-academy games are removed (the teacher will rebuild games later).
The app is the original one-question-per-day design (quiz/questions/{YYYY-MM-DD} KST,
first correct 150 points minus 5 per rank, wrong answer -10 and retry; quiz.mjs, quiz/ namespace):
answers live in quiz/answers (teacher-only) and the database rules grade submissions;
first correct answer ranks 1st. academy/ keeps only the shared stylesheet, assets and a
redirect page; the old academy/ and records/ database paths are read-only history.
Existing students keep ID/password login (student number expands to @junghwa.sen.ms.kr);
only students who cannot get in use a school Google account (@junghwa.sen.ms.kr; checked in
the app and in the users/{uid} create rule). Data stays on the old uid: developer/ links a new Google
login onto the old account with the project owner's Google token (Identity Toolkit
accounts:lookup/delete/update linkProviderUserInfo);
Teachers can also reset passwords for not-yet-linked students the same way, or with
tools/reset-password.mjs and a service account.
