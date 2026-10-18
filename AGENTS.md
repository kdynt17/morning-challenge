# Deployment identity

This is the user's canonical app: https://kdynt17.github.io/morning-challenge/.
Deploy this repository's database.rules.json to Firebase project morning-quest.
The sibling morning-quest-app shares that Firebase project but has incompatible rules.
Never replace this repository or its rules with the sibling's files wholesale.
Keep the original users/{uid}/points balance, leaderboardUsers, attendance, shop,
student approvals and existing four games. The restored 13-game module lives in
academy/ and stores records under the academy database namespace.
