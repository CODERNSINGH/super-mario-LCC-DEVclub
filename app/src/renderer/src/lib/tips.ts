import type { Profile } from '../store'

export type Anim = 'dino' | 'pigeon' | 'robot' | 'bug' | 'rocket' | 'brain'
export interface Quiz { q: string; options: [string, string, string]; answer: 0 | 1 | 2; why: string }
export interface Tip { id: string; anim: Anim; title: string; body: string; quiz?: Quiz }

const t = (id: string, anim: Anim, title: string, body: string, quiz?: Quiz): Tip => ({ id, anim, title, body, quiz })
const qz = (q: string, options: [string, string, string], answer: 0 | 1 | 2, why: string): Quiz => ({ q, options, answer, why })

export const TIPS: Record<Profile, Tip[]> = {
  swe: [
    t('swe-regress', 'bug', 'Every bug deserves a tombstone', 'Fix it, then write the regression test. Otherwise it returns in six weeks wearing a fake mustache.'),
    t('swe-idem', 'robot', 'Idempotency: press it twice, get it once', 'If a retry can double-charge a customer, it is not a retry, it is a plot twist.'),
    t('swe-off1', 'bug', 'Off-by-one, the eternal classic', 'Check the loop bounds first: < vs <=, 0-based vs 1-based. Half of all bugs live there.'),
    t('swe-race', 'brain', 'Race conditions hate being watched', 'If it only fails in prod and never in the debugger, suspect timing before suspecting ghosts.'),
    t('swe-cplx', 'rocket', 'O(n²) is fine until n is real', '100 items: shrug. 100,000 items: your laptop files for divorce. Check the size before optimising.'),
    t('swe-pr', 'pigeon', 'Small PRs get reviewed. Big PRs get "LGTM".', 'Under 400 lines and one idea per PR. Reviewers are humans with lunch plans.'),
    t('swe-flag', 'rocket', 'Feature flags: ship the code, delay the drama', 'Deploy dark, enable gradually, kill it instantly. Rollback in one click beats a hotfix at 2am.'),
    t('swe-stack', 'dino', 'Read the stack trace bottom-up... then top-down', 'The top frame is where it blew up, the first frame of YOUR code is usually where it went wrong.'),
    t('swe-bisect', 'bug', 'git bisect: binary search for blame', 'Good commit, bad commit, and 10 steps later you have the culprit out of 1000. Automate it with a test script.'),
    t('swe-names', 'robot', 'Naming is the real hard problem', 'If you need a comment to explain a variable, rename the variable instead.'),
    t('swe-log', 'brain', 'Log the why, not the what', 'The code already says what happened. Logs should say what it knew at that moment: ids, inputs, decisions.'),
    t('swe-cache', 'rocket', 'Cache invalidation is still hard', 'Before adding a cache, define exactly who is allowed to see stale data and for how long.'),
    t('swe-null', 'bug', 'Null is the billion-dollar shrug', 'Make illegal states unrepresentable: types, defaults, early returns. Fewer "if (x)" = fewer 3am pages.'),
    t('swe-test', 'robot', 'Test behaviour, not implementation', 'Tests that break on every refactor are just expensive mirrors. Assert on outcomes.'),
    t('swe-timeout', 'dino', 'Every network call needs a timeout', 'The default is often "wait forever", which is a fun way to hold a thread hostage.'),
    t('swe-repro', 'brain', 'No repro, no fix', 'Make it fail on demand first. A fix you cannot verify is a wish.'),
    t('swe-dry', 'pigeon', 'Duplication is cheaper than the wrong abstraction', 'Wait for the third copy. Two similar things are often just coincidence.'),
    t('swe-fail', 'rocket', 'Fail loudly, early, and with context', 'A swallowed exception is a bug with a head start. Throw with the offending value in the message.'),
    t('swe-diff', 'robot', 'Review your own diff first', 'You will spot the stray console.log in 10 seconds. Your reviewer will spot it in 10 seconds too, and remember.'),
    t('swe-mig', 'dino', 'Migrations: expand, migrate, contract', 'Add the new thing, move traffic, then remove the old thing. Never rename a column in one deploy.'),
  ],
  student: [
    t('stu-off1', 'bug', 'Off-by-one: the classic squish', 'An array of length 5 has indexes 0 to 4. Index 5 is the void. Wave at it, do not visit.',
      qz('arr = [10, 20, 30]. What is arr[3] in most languages?', ['30', 'undefined / error', '0'], 1, 'Indexes start at 0, so the last valid one is length - 1 = 2.')),
    t('stu-prec', 'brain', 'Operators have a pecking order', '2 + 3 * 4 is 14, not 20. Multiplication goes first. When unsure, use parentheses, nobody is judging.'),
    t('stu-float', 'robot', '0.1 + 0.2 is not 0.3', 'Floats store approximations in binary. Compare with a tolerance, not with ===.',
      qz('Why is 0.1 + 0.2 !== 0.3 in most languages?', ['Floats are approximate in binary', 'The compiler is buggy', 'Addition is random'], 0, 'Many decimals have no exact binary form, so tiny rounding errors sneak in.')),
    t('stu-null', 'bug', 'null vs undefined', 'undefined means "nobody set this yet", null means "someone set it to nothing on purpose". Subtle, but it bites.'),
    t('stu-rec', 'dino', 'Recursion needs a base case', 'No base case, no exit: your function calls itself until the stack cries. Always write the stopping rule first.',
      qz('What happens if a recursive function has no base case?', ['It returns 0', 'Stack overflow', 'It runs once'], 1, 'Each call adds a frame to the call stack, and the stack has a limit.')),
    t('stu-bigo', 'rocket', 'Big-O is about how it grows', 'Not how fast it is today, but what happens when the input gets 1000x bigger. Loop in a loop? Brace yourself.'),
    t('stu-ref', 'brain', 'Pass by value vs reference', 'Numbers get copied. Objects and arrays share the same thing, so changing it in a function changes it for everyone.',
      qz('You pass an array to a function that pushes an item. What does the caller see?', ['The original, unchanged', 'The item added', 'A crash'], 1, 'Arrays are passed as references to the same object.')),
    t('stu-short', 'robot', 'Short-circuit evaluation', 'In a && b, if a is false, b never runs. That is why user && user.name does not explode.'),
    t('stu-mut', 'bug', 'Mutability: who else is holding this?', 'Mutating shared data is how spooky action at a distance happens. Copy first if others may be looking.'),
    t('stu-hash', 'rocket', 'Hash maps: the cheat code', 'Looking something up by key takes about one step, not a scan of everything. Reach for one when you catch yourself searching a list twice.',
      qz('Average time to look up a key in a hash map?', ['O(1)', 'O(n)', 'O(n²)'], 0, 'The hash tells you where to look directly, no scanning needed.')),
    t('stu-eq', 'brain', '== vs ===', 'Double equals converts types first ("5" == 5 is true). Triple equals does not. Default to triple.',
      qz('In JavaScript, what is "5" === 5?', ['true', 'false', 'error'], 1, 'Strict equality also compares types, and string is not number.')),
    t('stu-loop', 'dino', 'Loop invariants: your loop\'s promise', 'Say what is always true at the top of each iteration. If you cannot, the bug is already hiding there.'),
    t('stu-stack', 'robot', 'Stack vs queue', 'Stack: last in, first out, like plates. Queue: first in, first out, like a line for coffee.',
      qz('Which structure is first in, first out?', ['Stack', 'Queue', 'Both'], 1, 'A queue serves whoever arrived first, just like a real line.')),
    t('stu-sort', 'rocket', 'Sorting is usually O(n log n)', 'Do not hand-roll it. Use the built-in, and spend your brainpower on what to sort by.'),
    t('stu-int', 'bug', 'Integer division surprises', '7 / 2 is 3 in some languages and 3.5 in others. Know which one you are in before it eats your average.',
      qz('In Python 3, what is 7 // 2?', ['3', '3.5', '4'], 0, '// is floor division: it drops the fractional part.')),
    t('stu-scope', 'brain', 'Scope: where a name lives', 'A variable declared inside a block stays inside it (with let/const). Outside, it does not exist, it is a rumour.'),
    t('stu-test', 'robot', 'Edge cases: empty, one, many', 'Test with nothing, exactly one thing, and lots. That trio catches a shocking amount of bugs.'),
    t('stu-debug', 'dino', 'Rubber duck debugging is real', 'Explain your code line by line to a duck. Somewhere around line 4 you will say "oh".'),
    t('stu-pure', 'rocket', 'Pure functions: same input, same output', 'No hidden state, no surprises, trivial to test. Your future self sends thanks.',
      qz('Which is a pure function?', ['Returns Math.random()', 'Returns a + b', 'Reads today\'s date'], 1, 'Only a + b depends purely on its inputs and touches nothing else.')),
  ],
  vibe: [
    t('vibe-key', 'dino', 'API keys are passwords with a credit card', 'Never paste one into code you share or commit. Bots scan GitHub within minutes. Keep them in a secret file.'),
    t('vibe-tests', 'robot', 'Tests are little robots that double-check your work', 'When the AI changes one thing, tests catch it quietly breaking another. Cheap insurance.'),
    t('vibe-sqli', 'bug', 'SQL injection, in plain words', 'If a form lets someone type database commands instead of a name, they can read or wipe your data. Good code treats typed text as text only.'),
    t('vibe-dep', 'pigeon', 'A dependency is code someone else wrote', 'Handy, like borrowing a ladder. But if they change it or it has a hole, your app inherits the problem.'),
    t('vibe-git', 'rocket', 'Git is your giant undo button', 'Commit before big changes. When the AI goes off-road you can go back to the last good moment in one step.'),
    t('vibe-trust', 'bug', 'Never trust what users type', 'Someone will paste a novel, an emoji storm, or an attack. Always check inputs before using them.'),
    t('vibe-https', 'brain', 'HTTPS is the padlock', 'It scrambles data on the way so Wi-Fi snoopers see gibberish. If a login page lacks it, run.'),
    t('vibe-rate', 'robot', 'Rate limits: the bouncer at the door', 'They stop one visitor from hammering your app 10,000 times a minute, and from running up your bill.'),
    t('vibe-back', 'dino', 'Backups: the boring hero', 'If it lives in one place, it can vanish. Keep a second copy somewhere else, and test that it restores.'),
    t('vibe-env', 'pigeon', 'What is a .env file?', 'A private sticky note for secrets. Your app reads it, but it should never be uploaded or shared.'),
    t('vibe-log', 'brain', 'Error messages are clues, not insults', 'Copy the whole message to the AI. It contains the file, the line, and often the answer.'),
    t('vibe-small', 'rocket', 'Ask for small changes', 'One thing at a time is easier to check, and easier to undo, than "rebuild everything".'),
    t('vibe-review', 'robot', 'Read what the AI changed', 'You do not need to understand every line. Just check that it touched what you expected, and nothing else.'),
    t('vibe-pass', 'bug', 'Passwords should never be stored as-is', 'Good apps store a scrambled version (a hash). If yours saves the real password, ask the AI to fix it today.'),
    t('vibe-cors', 'pigeon', 'What is an API?', 'A menu for programs: you order by name, the kitchen sends the dish. You never see the kitchen.'),
    t('vibe-update', 'dino', 'Updates are security patches in disguise', 'Old packages have known holes. Updating regularly is like changing the locks after a key is lost.'),
    t('vibe-admin', 'brain', 'Hidden is not secure', 'A page nobody links to can still be found. Real protection means checking who is asking, every time.'),
    t('vibe-prod', 'rocket', 'Test on a copy, not on the real thing', 'Try risky changes where real customers are not watching. Staging is just a rehearsal stage.'),
    t('vibe-slow', 'robot', 'Slow app? Ask what it is waiting for', 'Usually one thing: a big database question or a huge image. Describe the symptom, let the AI hunt.'),
  ],
}

/** Contextual tips keyed by what just happened in the chat. Values are tip ids (any profile prefix resolves per profile below). */
export type CtxKind = 'test-fail' | 'test-pass' | 'search' | 'edit' | 'error'
const CTX_TIPS: Record<CtxKind, Tip[]> = {
  'test-fail': [
    t('ctx-fail1', 'bug', 'Red tests are clues, not insults 🕵️', 'A failing test tells you exactly where to look. Read the first failure, ignore the pile-on.'),
    t('ctx-fail2', 'robot', 'One failure at a time', 'Fix the first red test, then rerun. Later failures are often just echoes.'),
  ],
  'test-pass': [t('ctx-pass1', 'rocket', 'Green means "probably fine"', 'Passing tests prove what they check, and nothing more. Glance at the diff too.')],
  search: [t('ctx-search1', 'dino', 'Searching first saves tokens', 'Finding the right file before reading beats reading everything. Agents (and humans) do it for the same reason.')],
  edit: [t('ctx-edit1', 'pigeon', 'The agent just edited a file', 'Peek at the live diff tab: red lines went out, green lines came in.')],
  error: [t('ctx-err1', 'brain', 'Hiccups happen', 'A rejected step just means the agent tries another route. Grab a snack.')],
}

const used: Record<string, string[]> = {}
const bag: Record<string, Tip[]> = {}
export function nextTip(profile: Profile): Tip {
  if (!bag[profile]?.length) {
    const list = [...TIPS[profile]].sort(() => Math.random() - 0.5)
    const lastId = used[profile]?.[used[profile].length - 1]
    if (list[0]?.id === lastId && list.length > 1) list.push(list.shift()!)
    bag[profile] = list
  }
  const tip = bag[profile].pop()!
  ;(used[profile] ??= []).push(tip.id)
  return tip
}
export function contextTip(kind: CtxKind): Tip {
  const l = CTX_TIPS[kind]
  return l[Math.floor(Math.random() * l.length)]
}
