# Deployment identity

This is the user's canonical app: https://kdynt17.github.io/morning-challenge/.
Deploy this repository's database.rules.json to Firebase project morning-quest.
The sibling morning-quest-app shares that Firebase project but has incompatible rules.
Never replace this repository or its rules with the sibling's files wholesale.
Keep the original users/{uid}/points balance, leaderboardUsers, attendance, shop,
student approvals and the lock switch (settings/gamesLocked, now the quiz answer lock).
As of 2026-11 the brain-academy games are removed (the teacher will rebuild games later).
The app is a teacher-posted question/answer quiz (quiz.mjs, quiz/ database namespace):
answers live in quiz/answers (teacher-only) and the database rules grade submissions;
first correct answer ranks 1st. academy/ keeps only the shared stylesheet, assets and a
redirect page; the old academy/ and records/ database paths are read-only history.
Students sign in only with school Google accounts (@junghwa.sen.ms.kr; checked in the app
and in the users/{uid} create rule). Data stays on the old uid: developer/ links a new Google
login onto the old account with the project owner's Google token (Identity Toolkit
accounts:lookup/delete/update linkProviderUserInfo); students still signed in can self-link.
Teachers can also reset passwords for not-yet-linked students the same way, or with
tools/reset-password.mjs and a service account.
