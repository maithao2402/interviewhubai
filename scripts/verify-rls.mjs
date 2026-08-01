/**
 * Verifies Row Level Security and the schema constraints on the live Supabase
 * project.
 *
 *   npm run verify:rls
 *
 * Why this exists: RLS is the only thing keeping one user's interview data away
 * from another's, and the rules live in Postgres rather than in application
 * code. This script talks to the real REST API exactly the way the browser
 * does -- anon key only, one bearer token per user -- so a broken policy fails
 * here instead of in production.
 *
 * Design rules this file follows, each of them the fix for a real defect found
 * in review:
 *
 *  1. NEVER issue an unbounded DELETE. Every delete is filtered by user_id on
 *     the client. Relying on RLS to bound a delete would mean the cleanup step
 *     is only safe while the thing under test is working -- so a broken policy
 *     would cause this script to destroy data before reporting the breakage.
 *  2. Assert the Postgres SQLSTATE, never a bare `status >= 400`. Any request
 *     can fail with some 400; only the specific code proves which mechanism
 *     rejected it. A missing column returns 400 too, and would otherwise score
 *     as a passing constraint check.
 *  3. A negative assertion must confirm the request succeeded first. An error
 *     body parses to null, and "x is not in null" is trivially true -- so an
 *     absence check that does not verify HTTP 200 passes against a dead API.
 *  4. Tag every row with a per-run id and filter reads by it, so exact-count
 *     assertions stay correct if two runs overlap or a previous run left rows.
 *  5. Read secrets from the environment, never from literals in this file.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const ENV_FILE = '.env.local';
const REQUEST_TIMEOUT_MS = 15_000;

// --- configuration ---------------------------------------------------------

/** Parses .env.local well enough for real files: `export`, quotes, `#`. */
function parseEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const withoutExport = trimmed.replace(/^export\s+/, '');
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    // Strip one matching pair of surrounding quotes -- standard dotenv syntax,
    // and what you get by copy-pasting from the Supabase dashboard.
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// process.env wins, so CI can supply values without a file on disk.
const fileEnv = parseEnvFile(ENV_FILE);
const env = { ...fileEnv, ...process.env };

const SUPABASE_URL = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(
    `Missing configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY\n` +
      `in ${ENV_FILE} or in the environment, then run this from the project root.`
  );
  process.exitCode = 1;
  process.exit();
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
  console.error(
    `Refusing to run: NEXT_PUBLIC_SUPABASE_URL does not look like a Supabase project URL.\n` +
      `  got: ${SUPABASE_URL}\n` +
      `This script creates and deletes rows, so it will not point at an unexpected host.`
  );
  process.exitCode = 1;
  process.exit();
}

// Throwaway verification accounts. The emails are fixed so repeated runs reuse
// the same two accounts instead of accumulating new ones; the passwords come
// from the environment and are deliberately NOT defaulted. A committed default
// would be a working credential on a project whose anon key ships to every
// browser -- and this repo's rule is that secrets always come from process.env.
const ACCOUNTS = {
  a: {
    email: env.RLS_VERIFY_EMAIL_A ?? 'rls-verify-a@example.com',
    password: env.RLS_VERIFY_PASSWORD_A ?? env.RLS_VERIFY_PASSWORD,
  },
  b: {
    email: env.RLS_VERIFY_EMAIL_B ?? 'rls-verify-b@example.com',
    password: env.RLS_VERIFY_PASSWORD_B ?? env.RLS_VERIFY_PASSWORD,
  },
};

if (!ACCOUNTS.a.password || !ACCOUNTS.b.password) {
  console.error(
    `Missing verification-account passwords.\n\n` +
      `Add to ${ENV_FILE} (which is gitignored):\n` +
      `  RLS_VERIFY_PASSWORD=<any password you choose, min 8 chars>\n\n` +
      `The accounts are created on first run if they do not exist. Use separate\n` +
      `RLS_VERIFY_PASSWORD_A / _B if you want a different password per account.`
  );
  process.exitCode = 1;
  process.exit();
}

/**
 * Every row this run creates carries this id in job_description, and every read
 * filters on it. Without the tag, an overlapping run or a leftover row from a
 * crashed run makes the exact-count assertions report a false isolation
 * failure.
 */
const RUN_ID = `verify-rls-${randomUUID()}`;

// --- plumbing --------------------------------------------------------------

let failed = 0;
let checksRun = 0;

const check = (label, ok, detail = '') => {
  checksRun++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const skip = (label, why) => {
  console.log(`  SKIP  ${label} — ${why}`);
};

async function api(path, { token, method = 'GET', body, prefer } = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token ?? ANON_KEY}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // A paused free-tier project accepts the connection and never answers.
    // Without this, the script hangs with no output and no exit code.
    return { status: 0, json: null, text: '', code: null, networkError: String(err) };
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* error bodies are not always JSON */
  }
  return { status: res.status, json, text, code: json?.code ?? null, networkError: null };
}

/** True only when the request succeeded AND returned an array. */
const rows = (r) => (r.status === 200 && Array.isArray(r.json) ? r.json : null);
const ids = (r) => (rows(r) ?? []).map((x) => x.id);

/** Asserts a write was rejected by a specific Postgres mechanism. */
const rejectedWith = (label, r, expectedCode) =>
  check(
    label,
    r.status >= 400 && r.code === expectedCode,
    `HTTP ${r.status} code=${r.code ?? '-'} (expected ${expectedCode})`
  );

const subOf = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).sub;

async function signInOrSignUp({ email, password }) {
  const signIn = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  if (signIn.json?.access_token) return finish(signIn.json.access_token);

  const signUp = await api('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (signUp.json?.access_token) return finish(signUp.json.access_token);

  // Report the actual cause rather than guessing at one.
  const alreadyRegistered = /already registered/i.test(signUp.text);
  const needsConfirmation = signUp.status === 200 && !signUp.json?.access_token;
  let hint;
  if (alreadyRegistered) {
    hint =
      `The account exists but the password did not match. Either set RLS_VERIFY_PASSWORD_* ` +
      `to the real password, or delete ${email} in Supabase Dashboard → Authentication → Users.`;
  } else if (needsConfirmation) {
    hint =
      `Signup succeeded but returned no session, which means "Confirm email" is ON. ` +
      `Turn it OFF in Supabase Dashboard → Authentication → Providers → Email.`;
  } else {
    hint = `sign-in HTTP ${signIn.status}, signup HTTP ${signUp.status}: ${signUp.text.slice(0, 200)}`;
  }
  throw new Error(`Could not authenticate ${email}. ${hint}`);

  function finish(token) {
    return { email, token, id: subOf(token) };
  }
}

/**
 * Deletes only this user's rows, filtered client-side by user_id.
 * The filter is the point: it must not depend on RLS, which is under test.
 */
async function wipe(user) {
  const r = await api(`/rest/v1/interviews?user_id=eq.${user.id}`, {
    token: user.token,
    method: 'DELETE',
  });
  if (r.status >= 300) {
    throw new Error(
      `Could not reset state for ${user.email}: HTTP ${r.status} ${r.text.slice(0, 200)}. ` +
        `Aborting rather than running assertions against unknown state.`
    );
  }
}

const interviewBody = (user, over = {}) => ({
  user_id: user.id,
  role: 'Frontend',
  level: 'Junior',
  interview_type: 'Technical',
  difficulty: 'Medium',
  duration_minutes: 15,
  max_questions: 3, // FR10 pairing: 15 -> 3
  job_description: RUN_ID, // run tag
  ...over,
});

async function seed(user) {
  const iv = await api('/rest/v1/interviews', {
    token: user.token,
    method: 'POST',
    prefer: 'return=representation',
    body: interviewBody(user),
  });
  if (iv.status !== 201) throw new Error(`seed interviews (${user.email}): HTTP ${iv.status} ${iv.text}`);

  const q = await api('/rest/v1/questions', {
    token: user.token,
    method: 'POST',
    prefer: 'return=representation',
    body: { interview_id: iv.json[0].id, content: 'verification question', topic: 'React', order_index: 1 },
  });
  if (q.status !== 201) throw new Error(`seed questions (${user.email}): HTTP ${q.status} ${q.text}`);

  const a = await api('/rest/v1/answers', {
    token: user.token,
    method: 'POST',
    prefer: 'return=representation',
    body: { question_id: q.json[0].id, answer_text: 'verification answer' },
  });
  if (a.status !== 201) throw new Error(`seed answers (${user.email}): HTTP ${a.status} ${a.text}`);

  return { interviewId: iv.json[0].id, questionId: q.json[0].id, answerId: a.json[0].id };
}

// --- checks ----------------------------------------------------------------

async function isolation(A, B, dA, dB) {
  console.log('Isolation between users (AC2, AC3)');
  const tag = `job_description=eq.${RUN_ID}`;

  const a = await api(`/rest/v1/interviews?${tag}&select=id`, { token: A.token });
  check('A sees exactly one interview, its own',
    rows(a)?.length === 1 && a.json[0].id === dA.interviewId,
    `HTTP ${a.status}, ids=${JSON.stringify(ids(a))}`);
  check("A does not see B's interview",
    rows(a) !== null && !ids(a).includes(dB.interviewId),
    `HTTP ${a.status}`);

  // questions/answers carry no run tag of their own; they are reachable only
  // through an interview, so the parent filter already scopes them.
  const q = await api('/rest/v1/questions?select=id,interview_id', { token: A.token });
  check('A sees only questions under its own interview',
    rows(q) !== null && rows(q).every((x) => x.interview_id === dA.interviewId),
    `HTTP ${q.status}, count=${rows(q)?.length}`);
  check("A does not see B's question",
    rows(q) !== null && !ids(q).includes(dB.questionId), `HTTP ${q.status}`);

  const an = await api('/rest/v1/answers?select=id,question_id', { token: A.token });
  check('A sees only answers under its own question',
    rows(an) !== null && rows(an).every((x) => x.question_id === dA.questionId),
    `HTTP ${an.status}, count=${rows(an)?.length}`);
  check("A does not see B's answer",
    rows(an) !== null && !ids(an).includes(dB.answerId), `HTTP ${an.status}`);

  const b = await api(`/rest/v1/interviews?${tag}&select=id`, { token: B.token });
  check('B sees exactly one interview, its own',
    rows(b)?.length === 1 && b.json[0].id === dB.interviewId,
    `HTTP ${b.status}, ids=${JSON.stringify(ids(b))}`);
}

async function crossUserWrites(A, B, dA, dB) {
  console.log('\nCross-user writes are rejected');

  rejectedWith("A cannot insert a question under B's interview",
    await api('/rest/v1/questions', {
      token: A.token, method: 'POST',
      body: { interview_id: dB.interviewId, content: 'smuggled', order_index: 2 },
    }), '42501');

  rejectedWith("A cannot insert an answer under B's question",
    await api('/rest/v1/answers', {
      token: A.token, method: 'POST',
      body: { question_id: dB.questionId, answer_text: 'smuggled' },
    }), '42501');

  // A denied UPDATE/DELETE is a successful no-op, not a 403: `using` filters
  // the row out before the statement reaches it. Verify by re-reading as B.
  await api(`/rest/v1/interviews?id=eq.${dB.interviewId}`, {
    token: A.token, method: 'PATCH', body: { role: 'Backend' },
  });
  const bRole = await api(`/rest/v1/interviews?id=eq.${dB.interviewId}&select=role`, { token: B.token });
  check("A cannot update B's interview",
    rows(bRole)?.[0]?.role === 'Frontend', `B's role is "${rows(bRole)?.[0]?.role}"`);

  await api(`/rest/v1/interviews?id=eq.${dB.interviewId}`, { token: A.token, method: 'DELETE' });
  const bAlive = await api(`/rest/v1/interviews?id=eq.${dB.interviewId}&select=id`, { token: B.token });
  check("A cannot delete B's interview", rows(bAlive)?.length === 1, `HTTP ${bAlive.status}`);

  await api(`/rest/v1/questions?id=eq.${dB.questionId}`, { token: A.token, method: 'DELETE' });
  const bQ = await api(`/rest/v1/questions?id=eq.${dB.questionId}&select=id`, { token: B.token });
  check("A cannot delete B's question", rows(bQ)?.length === 1, `HTTP ${bQ.status}`);

  await api(`/rest/v1/answers?id=eq.${dB.answerId}`, { token: A.token, method: 'DELETE' });
  const bA = await api(`/rest/v1/answers?id=eq.${dB.answerId}&select=id`, { token: B.token });
  check("A cannot delete B's answer", rows(bA)?.length === 1, `HTTP ${bA.status}`);

  // `with check` on each table: nothing may leave behind a row owned by someone else.
  rejectedWith('A cannot hand its own interview to B',
    await api(`/rest/v1/interviews?id=eq.${dA.interviewId}`, {
      token: A.token, method: 'PATCH', body: { user_id: B.id },
    }), '42501');

  rejectedWith("A cannot move its question under B's interview",
    await api(`/rest/v1/questions?id=eq.${dA.questionId}`, {
      token: A.token, method: 'PATCH', body: { interview_id: dB.interviewId },
    }), '42501');

  rejectedWith("A cannot move its answer under B's question",
    await api(`/rest/v1/answers?id=eq.${dA.answerId}`, {
      token: A.token, method: 'PATCH', body: { question_id: dB.questionId },
    }), '42501');

  const stillOwned = await api(`/rest/v1/interviews?id=eq.${dA.interviewId}&select=user_id`, { token: A.token });
  check('A still owns its own interview after those attempts',
    rows(stillOwned)?.[0]?.user_id === A.id);
}

async function anonymous(A, dA) {
  console.log('\nAnonymous access (AC4) — checked while both users own rows');

  for (const table of ['interviews', 'questions', 'answers']) {
    const r = await api(`/rest/v1/${table}?select=id`, { token: ANON_KEY });
    check(`anon GET /${table} returns []`,
      r.status === 200 && Array.isArray(r.json) && r.json.length === 0,
      `HTTP ${r.status} body=${r.text.slice(0, 60)}`);
  }

  rejectedWith('anon cannot insert into interviews',
    await api('/rest/v1/interviews', { token: ANON_KEY, method: 'POST', body: interviewBody(A) }), '42501');
  rejectedWith('anon cannot insert into questions',
    await api('/rest/v1/questions', {
      token: ANON_KEY, method: 'POST',
      body: { interview_id: dA.interviewId, content: 'anon', order_index: 5 },
    }), '42501');
  rejectedWith('anon cannot insert into answers',
    await api('/rest/v1/answers', {
      token: ANON_KEY, method: 'POST',
      body: { question_id: dA.questionId, answer_text: 'anon' },
    }), '42501');

  await api(`/rest/v1/interviews?id=eq.${dA.interviewId}`, {
    token: ANON_KEY, method: 'PATCH', body: { role: 'Backend' },
  });
  const intact = await api(`/rest/v1/interviews?id=eq.${dA.interviewId}&select=role`, { token: A.token });
  check('anon update changes nothing', rows(intact)?.[0]?.role === 'Frontend');

  await api(`/rest/v1/interviews?id=eq.${dA.interviewId}`, { token: ANON_KEY, method: 'DELETE' });
  await api(`/rest/v1/questions?id=eq.${dA.questionId}`, { token: ANON_KEY, method: 'DELETE' });
  await api(`/rest/v1/answers?id=eq.${dA.answerId}`, { token: ANON_KEY, method: 'DELETE' });
  const alive = await api(`/rest/v1/interviews?id=eq.${dA.interviewId}&select=id`, { token: A.token });
  const aliveQ = await api(`/rest/v1/questions?id=eq.${dA.questionId}&select=id`, { token: A.token });
  const aliveA = await api(`/rest/v1/answers?id=eq.${dA.answerId}&select=id`, { token: A.token });
  check('anon delete removes nothing from any table',
    rows(alive)?.length === 1 && rows(aliveQ)?.length === 1 && rows(aliveA)?.length === 1);
}

async function constraints(A, dA) {
  console.log('\nSchema constraints (docs/architecture.md §4)');

  // Enumerations that FR2 fixes.
  for (const [col, bad] of [['role', 'Astronaut'], ['level', 'Wizard'], ['interview_type', 'Interpretive dance']]) {
    rejectedWith(`${col} outside the allowed set is rejected`,
      await api('/rest/v1/interviews', {
        token: A.token, method: 'POST', body: interviewBody(A, { [col]: bad }),
      }), '23514');
  }

  // FR10 pairing.
  rejectedWith('duration/max_questions pair outside FR10 is rejected (15 + 9999)',
    await api('/rest/v1/interviews', {
      token: A.token, method: 'POST', body: interviewBody(A, { max_questions: 9999 }),
    }), '23514');
  rejectedWith('a valid duration with the wrong question count is rejected (30 + 3)',
    await api('/rest/v1/interviews', {
      token: A.token, method: 'POST', body: interviewBody(A, { duration_minutes: 30 }),
    }), '23514');
  const goodPair = await api('/rest/v1/interviews', {
    token: A.token, method: 'POST', prefer: 'return=representation',
    body: interviewBody(A, { duration_minutes: 60, max_questions: 9 }),
  });
  check('a documented FR10 pair is accepted (60 + 9)', goodPair.status === 201,
    `HTTP ${goodPair.status} ${goodPair.text.slice(0, 80)}`);
  if (goodPair.status === 201) {
    await api(`/rest/v1/interviews?id=eq.${goodPair.json[0].id}&user_id=eq.${A.id}`,
      { token: A.token, method: 'DELETE' });
  }

  // Score ranges on answers, including both inclusive boundaries.
  for (const [label, value] of [['-1', -1], ['above 10', 11], ['NaN', 'NaN']]) {
    rejectedWith(`answers.technical_score ${label} is rejected`,
      await api(`/rest/v1/answers?id=eq.${dA.answerId}`, {
        token: A.token, method: 'PATCH', body: { technical_score: value },
      }), '23514');
  }
  for (const bound of [0, 10]) {
    const r = await api(`/rest/v1/answers?id=eq.${dA.answerId}`, {
      token: A.token, method: 'PATCH', prefer: 'return=representation',
      body: { technical_score: bound, problem_solving_score: bound, communication_score: bound, overall_score: bound },
    });
    check(`answers scores accept the inclusive boundary ${bound}`,
      r.status === 200 && Number(rows(r)?.[0]?.overall_score) === bound,
      `HTTP ${r.status}, stored=${rows(r)?.[0]?.overall_score}`);
  }

  // order_index is 1-based per Story 3.1 AC3.
  rejectedWith('order_index 0 is rejected (sequence is 1-based)',
    await api('/rest/v1/questions', {
      token: A.token, method: 'POST',
      body: { interview_id: dA.interviewId, content: 'zero index', order_index: 0 },
    }), '23514');

  // Uniqueness.
  rejectedWith('a second answer for the same question is rejected',
    await api('/rest/v1/answers', {
      token: A.token, method: 'POST', body: { question_id: dA.questionId, answer_text: 'second' },
    }), '23505');
  rejectedWith('a duplicate order_index within one interview is rejected',
    await api('/rest/v1/questions', {
      token: A.token, method: 'POST',
      body: { interview_id: dA.interviewId, content: 'duplicate index', order_index: 1 },
    }), '23505');

  // not null on created_at -- a default only applies when the column is omitted.
  for (const [table, body] of [
    ['questions', { interview_id: dA.interviewId, content: 'null ts', order_index: 2, created_at: null }],
    ['interviews', interviewBody(A, { created_at: null })],
  ]) {
    rejectedWith(`${table}: an explicit null created_at is rejected`,
      await api(`/rest/v1/${table}`, { token: A.token, method: 'POST', body }), '23502');
  }

  // Types, probed behaviourally -- a JSON response cannot reveal a column type.
  rejectedWith('duration_minutes is int (rejects 1.5)',
    await api('/rest/v1/interviews', {
      token: A.token, method: 'POST', body: interviewBody(A, { duration_minutes: 1.5 }),
    }), '22P02');
  rejectedWith('interview_id is uuid (rejects a non-uuid)',
    await api('/rest/v1/questions', {
      token: A.token, method: 'POST',
      body: { interview_id: 'not-a-uuid', content: 'x', order_index: 3 },
    }), '22P02');

  const jb = await api(`/rest/v1/interviews?id=eq.${dA.interviewId}`, {
    token: A.token, method: 'PATCH', prefer: 'return=representation',
    body: { strengths: JSON.parse('{"b":1,"a":2,"a":3}') },
  });
  check('strengths is jsonb (normalises duplicate keys)',
    JSON.stringify(rows(jb)?.[0]?.strengths) === '{"a":3,"b":1}',
    `stored=${JSON.stringify(rows(jb)?.[0]?.strengths)}`);

  const ts = await api(`/rest/v1/interviews?id=eq.${dA.interviewId}&select=created_at`, { token: A.token });
  check('created_at is timestamptz (carries an offset)',
    /[+-]\d{2}:\d{2}$/.test(rows(ts)?.[0]?.created_at ?? ''), `${rows(ts)?.[0]?.created_at}`);

  // Deliberate non-constraints (§4 v0.3). These assert a decision, so that
  // silently re-adding a constraint shows up as a failure here.
  const freeStatus = await api(`/rest/v1/interviews?id=eq.${dA.interviewId}`, {
    token: A.token, method: 'PATCH', prefer: 'return=representation',
    body: { status: 'awaiting_report' },
  });
  check('status is intentionally unconstrained (Epic 4 owns the state set)',
    freeStatus.status === 200 && rows(freeStatus)?.[0]?.status === 'awaiting_report',
    `HTTP ${freeStatus.status} code=${freeStatus.code ?? '-'}`);

  const freeScore = await api(`/rest/v1/interviews?id=eq.${dA.interviewId}`, {
    token: A.token, method: 'PATCH', prefer: 'return=representation',
    body: { overall_score: 87 },
  });
  check('interviews.overall_score is intentionally unconstrained (scale undefined)',
    freeScore.status === 200 && Number(rows(freeScore)?.[0]?.overall_score) === 87,
    `HTTP ${freeScore.status} code=${freeScore.code ?? '-'}`);

  // Restore the row so later checks see a known state.
  await api(`/rest/v1/interviews?id=eq.${dA.interviewId}`, {
    token: A.token, method: 'PATCH', body: { status: 'in_progress', overall_score: null },
  });

  // Not reachable through this API surface -- say so rather than implying coverage.
  skip('not null on user_id / interview_id / question_id',
    'RLS rejects a missing or null FK with 42501 before the not-null constraint is reached, ' +
      'so the anon key cannot distinguish the two');
  skip('on delete cascade on interviews.user_id',
    'deleting an auth.users row needs the dashboard or a service_role key; verify by hand ' +
      'after any change to that foreign key');
}

async function cascade(A, dA) {
  console.log('\nCascade delete');
  // return=representation proves a row was actually deleted; a DELETE matching
  // nothing also returns a success status.
  const del = await api(`/rest/v1/interviews?id=eq.${dA.interviewId}&user_id=eq.${A.id}`, {
    token: A.token, method: 'DELETE', prefer: 'return=representation',
  });
  const deleted = Array.isArray(del.json) ? del.json.length : 0;
  const q = await api(`/rest/v1/questions?id=eq.${dA.questionId}&select=id`, { token: A.token });
  const an = await api(`/rest/v1/answers?id=eq.${dA.answerId}&select=id`, { token: A.token });
  check('deleting an interview removes its questions and answers',
    deleted === 1 && rows(q)?.length === 0 && rows(an)?.length === 0,
    `deleted=${deleted}, questions left=${rows(q)?.length}, answers left=${rows(an)?.length}`);
}

// --- run -------------------------------------------------------------------

async function main() {
  console.log(`Verifying RLS against ${SUPABASE_URL}`);
  console.log(`Run id: ${RUN_ID}\n`);

  const A = await signInOrSignUp(ACCOUNTS.a);
  const B = await signInOrSignUp(ACCOUNTS.b);

  await wipe(A);
  await wipe(B);

  let dA, dB;
  try {
    dA = await seed(A);
    dB = await seed(B);

    await isolation(A, B, dA, dB);
    await crossUserWrites(A, B, dA, dB);
    await anonymous(A, dA);
    await constraints(A, dA);
    await cascade(A, dA);
  } finally {
    // Runs even if an assertion block throws, so a crashed run does not leave
    // rows behind for the next one to trip over.
    console.log('\nCleanup');
    try {
      await wipe(A);
      await wipe(B);
      const a = await api(`/rest/v1/interviews?job_description=eq.${RUN_ID}&select=id`, { token: A.token });
      const b = await api(`/rest/v1/interviews?job_description=eq.${RUN_ID}&select=id`, { token: B.token });
      check('this run\'s rows are gone', rows(a)?.length === 0 && rows(b)?.length === 0,
        `A=${rows(a)?.length}, B=${rows(b)?.length}`);
    } catch (err) {
      console.log(`  FAIL  cleanup — ${err.message}`);
      failed++;
    }
    console.log('  note: the two throwaway auth accounts remain — deleting users needs the dashboard');
  }

  console.log(
    `\n${failed === 0 ? `RLS VERIFIED — ${checksRun}/${checksRun} checks passed` : `${failed} of ${checksRun} CHECKS FAILED`}`
  );
  // exitCode rather than exit(): lets stdout flush, which process.exit() can cut
  // off when output is redirected to a file on Windows.
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`\nVerification could not run: ${err.message}`);
  process.exitCode = 1;
});
