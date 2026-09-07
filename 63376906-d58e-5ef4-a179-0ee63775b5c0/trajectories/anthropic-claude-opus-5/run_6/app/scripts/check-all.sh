#!/bin/bash
# Every suite, each against a freshly seeded database, because the walk and the
# race checks both change the records they read.
cd /app || exit 1
fail=0

echo "=============================================================="
echo "1. The API against the seeded records"
echo "=============================================================="
bash scripts/reset.sh > /dev/null 2>&1
sleep 2
node scripts/verify.mjs || fail=1

echo
echo "=============================================================="
echo "2. The four races and the lifecycle rules"
echo "=============================================================="
bash scripts/reset.sh > /dev/null 2>&1
sleep 2
node scripts/verify-races.mjs || fail=1

echo
echo "=============================================================="
echo "3. The built stylesheet"
echo "=============================================================="
npm run build > /tmp/build.log 2>&1 || { echo "build failed"; tail -10 /tmp/build.log; fail=1; }
node scripts/check-css.mjs | tail -4 || fail=1

echo
echo "=============================================================="
echo "4. The journeys, in a browser"
echo "=============================================================="
bash scripts/reset.sh > /dev/null 2>&1
sleep 2
python3 scripts/walk.py > /tmp/walk.log 2>&1
walk=$?
echo "browser checks passed: $(grep -c '^ok' /tmp/walk.log)"
grep '^FAIL' /tmp/walk.log
tail -3 /tmp/walk.log
[ $walk -ne 0 ] && fail=1

echo
echo "=============================================================="
echo "5. Motion, forced colours, print and the keyboard"
echo "=============================================================="
python3 scripts/check-a11y.py > /tmp/a11y.log 2>&1
a11y=$?
echo "checks passed: $(grep -c '^ok' /tmp/a11y.log)"
grep '^FAIL' /tmp/a11y.log
tail -1 /tmp/a11y.log
[ $a11y -ne 0 ] && fail=1

echo
echo "=============================================================="
echo "6. The byte budget per route"
echo "=============================================================="
node scripts/check-budget.mjs || fail=1

echo
echo "=============================================================="
if [ $fail -eq 0 ]; then echo "ALL SUITES PASS"; else echo "SOME SUITES FAILED"; fi
echo "=============================================================="

# leave the app on a clean seed
bash scripts/reset.sh > /dev/null 2>&1
exit $fail
