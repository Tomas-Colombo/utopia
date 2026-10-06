<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Don't call it done if you didn't run it

Before reporting a change as finished, run the project's gates:

```bash
npx tsc --noEmit && npx eslint && npx vitest run --exclude 'tests/db/**' && pnpm build
```

If one of them fails, it is not finished.

`tests/db/*` talks to a real Postgres and needs the local Supabase stack
(`supabase start`, which needs Docker running). When it is down those suites
fail with `ECONNREFUSED 127.0.0.1:54321` — report that as not verified, never as
passing.

In whatever you write — commit message, PR body, summary — keep what you
verified separate from what you assume. If you never printed the page, write
"not verified"; do not write "check that it comes out clean". A report that
claims a check which never ran is worse than no report, because the reader stops
reviewing.

# Design for N, not for 1

Before writing a screen that processes a list, answer three questions: how many
queries per element, what happens at two hundred, and who controls that number.
If the number comes from a URL or from user input, it needs a cap and a dedupe.

An `await` inside a `for` is the tell: there is almost always a missing domain
function that resolves the whole batch in one query. Ad-hoc Supabase queries
outside `lib/dal/**` are forbidden, but satisfying that rule by calling another
use case's loader drags that use case's cost along with it — a loader that joins
movements, supplier and category is the right choice for the detail page that
displays them, and the wrong one for a label that prints a name. When nothing
existing fits, add the domain function that is missing.
