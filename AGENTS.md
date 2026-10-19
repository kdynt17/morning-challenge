# Deployment identity

This is the user's canonical app: https://kdynt17.github.io/morning-challenge/.
Deploy this repository's database.rules.json to Firebase project morning-quest.
The sibling morning-quest-app shares that Firebase project but has incompatible rules.
Never replace this repository or its rules with the sibling's files wholesale.
Keep the original users/{uid}/points balance, leaderboardUsers, attendance, shop,
student approvals and the game lock. Minesweeper is retired. All games (15, including the
rebuilt 색깔 판단 and 계산 20, and 순간기억 merged with the old step memory game) live in
academy/ inside the main app's 두뇌교실 page and store records under the academy database namespace.
The old records/ path is kept read-only history.
