# Open Limits 1.3 (Android) / 1.1 (iOS): Solve to unlock + weekly budget

Both platforms implement the same rules.

## Solve to unlock (maths)

Settings (global, in Settings / Prefs):
- `mathMode`: 0 = off, 1 = **when locked** (default): after the limit is used up, solve problems to earn 1 more open,
  2 = **every open**: solve before every open (and when locked, same as 1).
- `mathLevel` 1-5 (default 2):
  1 Easy: a + b or a - b, numbers to 20 (answer >= 0)
  2 Times tables: a x b, 2-12
  3 Two-digit: a + b, a - b (a,b 10-99, answer >= 0) or a x b (a 11-25, b 2-9)
  4 Percent & fractions: "25% of 80" (p in 10,20,25,50,75; base a multiple that gives a whole answer) or "3/4 of 20"
     (denominator 2-10, numerator < denominator, whole answer)
  5 Algebra: "3x + 7 = 22, x = ?" (x 1-12, a 2-9, b 1-30; also "a(x - b) = c" with whole answers)
- `mathCount` 1-5 (default 3): problems in a row for one unlock. A wrong answer shows the right one and gives a new
  problem; the count of correct answers in a row resets to 0.
- `mathMax` 0-10 (default 3): most opens one app can earn per day (0 = no limit).

Answers are whole numbers (may be 0; never negative). Number keypad input.

Earned opens: stored per day per app as `earned` (`e` in JSON). They raise that day's allowance:
left = limit + earned - used (weekly: summed over the week). **Earned opens do not break the streak**
(dayKept: used <= limit + earned and no emergency opens). Emergency "hold to open anyway" still breaks it.
Earned opens show in history/stats as their own number ("2 earned with maths").

Strict mode does not turn off maths (it's effort, not a loophole) but mathMax still applies.

UI words: "Solve to unlock", "Solve 3 problems to earn 1 more open of Instagram (2 left to earn today)",
"Correct! 2 more to go", "Not quite: 7 x 8 = 56. Try this one.", "Unlocked: 1 more open earned".

## Weekly budget

Per limit: `period` = day (default) or week. A weekly limit is N opens **per week**, week starts Monday
(ISO week, local time). left = limit + earned this week - opens this week. Shows "12 of 40 opens used this week",
"28 left this week, about 4 a day" (= ceil(left / days left in the week incl. today)). Locked = "Locked until Monday".
Streak: a day is kept for a weekly limit when the week's opens up to and including that day <= limit + week's earned
up to that day, and no emergency opens that day. History charts stay per day.
Limit range: daily 1-99, weekly 1-500.

## Store text (both stores)

Lead with: "Solve a maths problem to earn one more open". Subtitle idea: "Solve maths to earn app opens".
