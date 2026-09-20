# Code Review
---

## Findings Summary

| ID          | Category        | Issue                                                                 | Severity |
|-------------|-----------------|-----------------------------------------------------------------------|----------|
| BUG-001     | Bugs            | Activity routes not wrapped in `asyncHandler`                         | High     |
| BUG-002     | Bugs            | Activity service uses blocking synchronous file I/O                   | High     |
| BUG-003     | Bugs            | Concurrent writes cause silent data loss                              | High     |
| BUG-004     | Bugs            | `PATCH /tasks/:id` persists an empty string title                     | Medium   |
| BUG-005     | Bugs            | `updateTask` spreads unknown request fields onto the stored record     | Medium   |
| BUG-006     | Bugs            | Activity IDs use `Date.now()` — collisions under concurrent load      | Medium   |
| BUG-007     | Bugs            | `createTask` service re-validates input already handled by controller  | Low      |
| BUG-008     | Bugs            | `GET /activity` returns a bare array, not the `{ data }` envelope     | Low      |
| PERF-001    | Performance     | Full file read and JSON parse on every request                        | Medium   |
| PERF-002    | Performance     | Full file rewrite on every mutation                                   | Medium   |
| PERF-003    | Performance     | Two identical file-load functions in the activity service             | Low      |
| PERF-004    | Performance     | Linear O(n) scan on every by-ID operation                            | Low      |
| PERF-005    | Performance     | File paths resolved via `process.cwd()` — fragile                    | Low      |
| MAINT-001   | Maintainability | `taskValidator.js` is never imported — dead code                      | Medium   |
| MAINT-002   | Maintainability | Validation split across controller and service layers                 | Medium   |
| MAINT-003   | Maintainability | Inconsistent naming conventions in the activity module                | Low      |
| MAINT-004   | Maintainability | Data file paths hard-coded, not environment-configurable              | Low      |
| MAINT-006   | Maintainability | Activity module structure asymmetric with the tasks module            | Low      |
| SEC-001     | Security        | No input validation on `POST /activity`                               | Medium   |
| SEC-002     | Security        | Unknown request fields persisted via unchecked spread                 | Medium   |
| SEC-003     | Security        | No explicit body size limit configured                                | Medium   |
| SEC-004     | Security        | No environment distinction in error logging                           | Low      |
| QUALITY-001 | Code Quality    | Controller performs validation, normalisation, and delegation         | Medium   |
| QUALITY-002 | Code Quality    | `createTask` service mutates its input parameter                      | Low      |
| QUALITY-003 | Code Quality    | `POST /activity` response not wrapped in the `{ data }` envelope      | Low      |
| QUALITY-004 | Code Quality    | Unsupported HTTP methods on known paths return `404` not `405`        | Low      |

---

# 1. Bugs

## BUG-001 — Activity routes not wrapped in `asyncHandler`

**What is wrong?**

Both activity handlers are registered as plain function references. If either handler
throws — now or after any future refactor to async — the error bypasses the global
`errorHandler` entirely.

```js
// activity.routes.js
activityRouter.get('/', c.get_activity);  // no asyncHandler
activityRouter.post('/', c.addActivity);  // no asyncHandler
```

The tasks module wraps every handler correctly:

```js
// tasks.routes.js
tasksRouter.get('/', asyncHandler(tasksController.listTasks));
tasksRouter.post('/', asyncHandler(tasksController.createTask));
```

**Why is it a problem?**

Express will leave the request hanging indefinitely with no response. This is a
reliability gap today and a guaranteed failure the moment the activity service is
converted to async (which BUG-002 requires).

**How to improve it:**

```js
const asyncHandler = require('../../../middleware/asyncHandler');

activityRouter.get('/', asyncHandler(c.getActivity));
activityRouter.post('/', asyncHandler(c.addActivity));
```

---

## BUG-002 — Activity service uses blocking synchronous file I/O

**What is wrong?**

The activity service uses `node:fs` (synchronous) on every request. Every read and
write blocks the Node.js event loop until the I/O completes.

```js
// activity.service.js
const fs = require('node:fs');  // synchronous

function loadDataA() {
  let raw = fs.readFileSync(fp, 'utf8');  // blocks the event loop
  return JSON.parse(raw);
}

function createNewActivity(b) {
  const list = loadDataB();
  list.push({ ... });
  fs.writeFileSync(fp, JSON.stringify(list, null, 2));  // blocks the event loop
  return one;
}
```

The tasks service correctly uses async I/O via the shared `jsonStore.js`:

```js
// tasks.service.js
const { readJsonArray, writeJsonArray } = require('../../../utils/jsonStore');

async function getAllTasks() {
  return readJsonArray(TASKS_FILE_PATH);  // non-blocking
}
```

**Why is it a problem?**

While a synchronous file call executes, no other request, timer, or callback can run.
Every `GET /activity` or `POST /activity` request freezes the entire server. The
`jsonStore.js` async helpers already exist — the activity service simply does not use
them.

**How to improve it:**

```js
// activity.service.js
const { readJsonArray, writeJsonArray } = require('../../../utils/jsonStore');

async function getAllActivity() {
  return readJsonArray(ACTIVITY_FILE_PATH);
}

async function createActivity(payload) {
  const list = await readJsonArray(ACTIVITY_FILE_PATH);
  const entry = {
    id: createId(),
    action: payload.action,
    info: payload.info,
    when: new Date().toISOString(),
  };
  list.push(entry);
  await writeJsonArray(ACTIVITY_FILE_PATH, list);
  return entry;
}
```

---

## BUG-003 — Concurrent writes cause silent data loss

**What is wrong?**

Every mutation follows an unguarded read-modify-write cycle. Two simultaneous requests
both read the same state, each compute their own change, and whichever writes last
silently overwrites the other.

```js
// tasks.service.js — createTask
const tasks = await readJsonArray(TASKS_FILE_PATH);  // Request A and B both read [task1, task2]
tasks.push(newTask);
await writeJsonArray(TASKS_FILE_PATH, tasks);
// Request A writes [task1, task2, taskA]
// Request B writes [task1, task2, taskB]  ← taskA is silently lost
```

**Why is it a problem?**

Silent, undetectable data loss with no error raised to either client. This affects every
write operation — create, update, and delete — for both tasks and activity. The failure
is non-deterministic and will not appear in sequential testing.

**How to improve it:**

Serialize all writes through an in-process promise queue so no write starts until the
previous one has completed:

```js
// jsonStore.js
let writeQueue = Promise.resolve();

async function writeJsonArray(filePath, data) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
  );
  return writeQueue;
}
```

For additional durability, use an atomic write pattern: write to a `.tmp` file, then
`fs.rename` to replace the original atomically.

---

## BUG-004 — `PATCH /tasks/:id` persists an empty string title

**What is wrong?**

The controller trims the title but never checks whether the trimmed result is empty.
A payload of `{ "title": "   " }` passes all checks, gets trimmed to `""`, and is
saved to `tasks.json`.

```js
// tasks.controller.js — patchTask
if (typeof updates.title === 'string') {
  updates.title = updates.title.trim();
  // ← no check that the result is non-empty
}
```

`POST /tasks` in the same file correctly rejects empty titles:

```js
// tasks.controller.js — createTask
payload.title = payload.title.trim();
if (!payload.title) {
  return res.status(400).json({ error: { message: 'title cannot be empty' } });
}
```

**Why is it a problem?**

Tasks created via `POST` are guaranteed a non-empty title, but the same invariant can
be silently violated through `PATCH`. The stored data becomes inconsistent.

**How to improve it:**

```js
if (typeof updates.title === 'string') {
  updates.title = updates.title.trim();
  if (updates.title.length === 0) {
    return res.status(400).json({ error: { message: '"title" cannot be empty.' } });
  }
}
```

---

## BUG-005 — `updateTask` spreads unknown request fields onto the stored record

**What is wrong?**

The updated task is built by spreading the entire `updates` object. The controller
checks `title` and `completed` types but does not strip other keys. Any additional
field in the request body is merged into the record and written to `tasks.json`.

```js
// tasks.service.js — updateTask
const updatedTask = {
  ...existingTask,
  ...updates,           // all keys from the request body, unfiltered
  updatedAt: new Date().toISOString(),
};
```

For example, `PATCH /tasks/:id` with body `{ "title": "ok", "isAdmin": true }` would
write `"isAdmin": true` into the stored task.

**Why is it a problem?**

Arbitrary client-controlled keys corrupt the task schema in `tasks.json`. All future
reads of those records return unexpected fields. The `taskValidator.js` utility already
in the project rejects unknown fields — but it is never used (see MAINT-001).

**How to improve it:**

Reconstruct the updated task from only the known, permitted fields:

```js
const updatedTask = {
  ...existingTask,
  ...(updates.title !== undefined && { title: updates.title }),
  ...(updates.completed !== undefined && { completed: updates.completed }),
  updatedAt: new Date().toISOString(),
};
```

---

## BUG-006 — Activity IDs use `Date.now()` — not unique under concurrent load

**What is wrong?**

Activity record IDs are generated with millisecond resolution. Two requests arriving
within the same millisecond produce identical IDs.

```js
// activity.service.js — createNewActivity
const one = {
  id: String(Date.now()),   // millisecond precision — not unique
  action: b.action,
  info: b.info,
  when: new Date().toISOString(),
};
```

The project already has a UUID v4 generator used correctly by the tasks service:

```js
// utils/id.js
function createId() {
  return typeof randomUUID === 'function'
    ? randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}
```

**Why is it a problem?**

Duplicate IDs make reliable record lookups and deduplication impossible. If activity
entries are ever referenced by ID, collisions cause incorrect behavior.

**How to improve it:**

```js
const { createId } = require('../../../utils/id');

const entry = {
  id: createId(),
  action: payload.action,
  info: payload.info,
  when: new Date().toISOString(),
};
```

---

## BUG-007 — `createTask` service re-validates input already handled by the controller

**What is wrong?**

The controller validates `title` type and defaults `completed` before calling the
service. The service then repeats both checks with different error messages.

```js
// tasks.service.js — createTask
if (!payload.title || typeof payload.title !== 'string') {
  throw new HttpError(400, 'Invalid title.');          // duplicate
}
if (payload.completed === undefined) {
  payload.completed = false;                           // duplicate default
}
```

```js
// tasks.controller.js — createTask (runs first)
if (typeof payload.title !== 'string') {
  return res.status(400).json({ error: { message: 'title is required and must be string' } });
}
```

**Why is it a problem?**

Two independent implementations with different error messages will diverge when either
is updated. The service layer should trust that its caller has already validated input.

**How to improve it:**

Remove the validation and defaulting from the service. The service should receive a
pre-validated payload and focus exclusively on persistence logic.

---

## BUG-008 — `GET /activity` returns a bare array, not the `{ data }` envelope

**What is wrong?**

The activity GET handler returns the raw array directly, while every task endpoint
wraps its payload in `{ data: ... }`.

```js
// activity.controller.js
function get_activity(req, res) {
  const x = aSvc.getAllActivity();
  res.json(x);                          // returns: [...]
}

// tasks.controller.js
async function listTasks(req, res) {
  const tasks = await tasksService.getAllTasks();
  res.status(200).json({ data: tasks }); // returns: { "data": [...] }
}
```

**Why is it a problem?**

Clients must implement two different response-parsing strategies for conceptually
identical list endpoints. Additionally, `getAllActivity()` is called without `await`,
meaning it will return a raw `Promise` object — not data — once the service is
converted to async.

**How to improve it:**

```js
async function getActivity(req, res) {
  const activities = await aSvc.getAllActivity();
  res.status(200).json({ data: activities });
}
```

---

# 2. Performance

## PERF-001 — Full file read and JSON parse on every request

**What is wrong?**

Every incoming request — including read-only `GET` — reads the entire file from disk
and re-parses the full JSON array from scratch.

```js
// jsonStore.js
async function readJsonArray(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');  // full disk read every time
  return JSON.parse(raw);                            // full parse every time
}
```

**Why is it a problem?**

There is no in-memory representation. A hundred concurrent `GET /tasks` requests cause
a hundred disk reads and a hundred JSON parses of the same unchanged file. Latency and
CPU overhead grow linearly with file size.

**How to improve it:**

Load data into memory once at startup and serve reads from the cache. Only hit the
disk on mutations:

```js
let cache = null;

async function readJsonArray(filePath) {
  if (cache) return cache;
  const raw = await fs.readFile(filePath, 'utf-8');
  cache = JSON.parse(raw);
  return cache;
}
```

---

## PERF-002 — Full file rewrite on every mutation

**What is wrong?**

Every create, update, or delete re-serialises the entire array and overwrites the
complete file, regardless of how small the change is.

```js
// jsonStore.js
async function writeJsonArray(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}
```

**Why is it a problem?**

Write amplification grows linearly with dataset size. With 10,000 tasks, creating one
new task re-serialises all 10,000 records. The file is also left in a partially-written
state during the write, which risks corruption on a process crash.

**How to improve it:**

Keep an in-memory copy of the data (see PERF-001). Write mutations to memory
immediately and flush to disk asynchronously. Use an atomic write pattern — write to a
`.tmp` file, then `fs.rename` — to eliminate the partial-write risk.

---

## PERF-003 — Two identical file-load functions in the activity service

**What is wrong?**

`loadDataA` and `loadDataB` are character-for-character identical. `getAllActivity`
calls `loadDataA`; `createNewActivity` calls `loadDataB`. There is no functional
difference between them.

```js
// activity.service.js
function loadDataA() {
  if (!fs.existsSync(fp)) { fs.writeFileSync(fp, '[]'); }
  let raw = fs.readFileSync(fp, 'utf8');
  if (!raw) { raw = '[]'; }
  return JSON.parse(raw);
}

function loadDataB() {            // identical to loadDataA
  if (!fs.existsSync(fp)) { fs.writeFileSync(fp, '[]'); }
  let raw = fs.readFileSync(fp, 'utf8');
  if (!raw) { raw = '[]'; }
  return JSON.parse(raw);
}
```

**Why is it a problem?**

Any bug fix or enhancement applied to one function must be manually applied to the
other. The names convey no intent.

**How to improve it:**

Delete `loadDataB`. Use a single, clearly named function (or the shared `jsonStore.js`)
for both callers.

---

## PERF-004 — Linear O(n) scan on every by-ID operation

**What is wrong?**

Every operation targeting a specific task performs a full linear scan of the array.

```js
// tasks.service.js
const task = tasks.find((item) => item.id === taskId);           // O(n)
const taskIndex = tasks.findIndex((item) => item.id === taskId); // O(n)
```

**Why is it a problem?**

With n tasks, every `GET /tasks/:id`, `PATCH /tasks/:id`, and `DELETE /tasks/:id`
costs O(n). Performance degrades proportionally as the dataset grows.

**How to improve it:**

Maintain an in-memory `Map<id, task>` for O(1) lookups, populated once at startup and
updated on every write operation.

---

## PERF-005 — File paths resolved via `process.cwd()` — fragile

**What is wrong?**

Both services resolve their data file paths relative to `process.cwd()`, which is the
directory from which the Node process is launched — not the location of the source file.

```js
// tasks.service.js
const TASKS_FILE_PATH = path.join(process.cwd(), 'data', 'tasks.json');

// activity.service.js
const fp = path.join(process.cwd(), 'data', 'activity.json');
```

**Why is it a problem?**

If the server is started from any directory other than the project root, the paths
resolve to a non-existent location and the application silently creates files in the
wrong directory or fails to find them.

**How to improve it:**

Use `__dirname`-relative paths, which are always resolved relative to the source file
regardless of launch directory:

```js
const TASKS_FILE_PATH = path.join(__dirname, '../../../../data/tasks.json');
```

Or centralise path configuration in `src/config.js` with a `DATA_DIR` environment
variable:

```js
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '../data');
exports.TASKS_FILE    = path.join(DATA_DIR, 'tasks.json');
exports.ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
```

---

# 3. Maintainability

## MAINT-001 — `taskValidator.js` is never imported — dead code

**What is wrong?**

`taskValidator.js` exports two well-structured validation functions that handle shape
validation, type checking, trimming, unknown-field rejection, and defaulting. Neither
is ever imported or called anywhere.

```js
// taskValidator.js — exports that are never used
module.exports = {
  validateCreateTask,   // never imported
  validateUpdateTask,   // never imported
};
```

Meanwhile, the controller manually duplicates this logic with ad-hoc `if` chains —
and does so less completely (see BUG-004).

**Why is it a problem?**

Two parallel validation implementations that can diverge independently. The controller
is longer than it needs to be. The validator is wasted, tested-against-nothing code.

**How to improve it:**

Import and use the validator in the controller, then remove the inline validation:

```js
// tasks.controller.js
const { validateCreateTask, validateUpdateTask } = require('../utils/taskValidator');

async function createTask(req, res) {
  const payload = validateCreateTask(req.body);  // throws HttpError on invalid input
  const task = await tasksService.createTask(payload);
  res.status(201).json({ data: task });
}
```

---

## MAINT-002 — Validation split across controller and service layers

**What is wrong?**

The controller validates `title` type and defaults `completed`. The service then
re-validates both fields independently with different error messages.

```js
// tasks.controller.js — createTask
if (typeof payload.title !== 'string') {
  return res.status(400).json({ error: { message: 'title is required and must be string' } });
}

// tasks.service.js — createTask (runs after)
if (!payload.title || typeof payload.title !== 'string') {
  throw new HttpError(400, 'Invalid title.');
}
```

**Why is it a problem?**

There is no single authoritative definition of a valid task payload. Any rule change
must be made in two places. The two layers will silently diverge over time.

**How to improve it:**

Validation belongs exclusively in the controller (or a dedicated validator). The
service should receive a pre-validated payload and focus on persistence logic only.

---

## MAINT-003 — Inconsistent naming conventions in the activity module

**What is wrong?**

The codebase uses camelCase throughout, but the activity module introduces multiple
deviations:

```js
// activity.controller.js
function get_activity(req, res) { ... }      // snake_case function name
const aSvc = require('../services/...');     // opaque single-letter alias
const c    = require('../controllers/...');  // opaque single-letter alias

// activity.service.js
const fp = path.join(...);                   // single-letter variable
function loadDataA() { ... }                 // non-descriptive name
function loadDataB() { ... }                 // non-descriptive name
function createNewActivity(b) { ... }        // `b` parameter name — no intent
const one = { ... };                         // meaningless local variable
const made = aSvc.createNewActivity(bodyData); // meaningless local variable
```

**Why is it a problem?**

Inconsistency signals different code ownership and slows onboarding. `fp`, `loadDataA`,
`loadDataB`, and `one` convey no intent to a reader unfamiliar with the code.

**How to improve it:**

Apply camelCase and descriptive names throughout: `getActivity`, `activityFilePath`,
`loadActivityData`, `activityService`, `payload`, `newActivity`.

---

## MAINT-004 — Data file paths hard-coded, not environment-configurable

**What is wrong?**

Data file paths are baked directly into each service file with no way to override them.

```js
// tasks.service.js
const TASKS_FILE_PATH = path.join(process.cwd(), 'data', 'tasks.json');

// activity.service.js
const fp = path.join(process.cwd(), 'data', 'activity.json');
```

**Why is it a problem?**

There is no way to point the application at a different data directory without editing
source code — for example, to use a temporary directory in tests or a different path
in a staging environment.

**How to improve it:**

```js
// src/config.js
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '../data');
exports.TASKS_FILE    = path.join(DATA_DIR, 'tasks.json');
exports.ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
```

---

## MAINT-006 — Activity module structure asymmetric with the tasks module

**What is wrong?**

The tasks module has `controllers/`, `routes/`, `services/`, and `utils/` (with
`taskValidator.js`). The activity module only has `controllers/`, `routes/`, and
`services/` — no validator, no utilities.

**Why is it a problem?**

Developers expect symmetry between modules. The structural difference makes the
activity module look intentionally simpler, when it is actually just incomplete. The
activity controller performs zero input validation (see SEC-001).

**How to improve it:**

Add `src/modules/activity/utils/activityValidator.js`, mirroring the pattern
established by the tasks module. Wire it into the activity controller.

---

# 4. Security

## SEC-001 — No input validation on `POST /activity`

**What is wrong?**

The activity handler passes `req.body` directly to the service with no validation
whatsoever.

```js
// activity.controller.js
function addActivity(req, res) {
  const bodyData = req.body || {};
  const made = aSvc.createNewActivity(bodyData);  // zero validation
  res.status(201).json(made);
}
```

`action` and `info` are stored as-is: they can be `undefined`, objects, arrays, or
arbitrarily long strings, and there is no check that the required `action` field is
even present.

**Why is it a problem?**

Malformed records are written to `activity.json` without restriction. `undefined`
values serialise as absent or `null` in JSON, producing corrupt records. With no size
limit (see SEC-003), a client can also write very large values directly to disk.

**How to improve it:**

```js
async function addActivity(req, res) {
  const { action, info } = req.body ?? {};

  if (typeof action !== 'string' || action.trim().length === 0) {
    return res.status(400).json({ error: { message: '"action" is required and must be a non-empty string.' } });
  }
  if (info !== undefined && typeof info !== 'string') {
    return res.status(400).json({ error: { message: '"info" must be a string.' } });
  }

  const entry = await aSvc.createActivity({ action: action.trim(), info });
  res.status(201).json({ data: entry });
}
```

---

## SEC-002 — Unknown request fields persisted via unchecked spread

**What is wrong?**

The updated task is built by spreading the entire `updates` object. The controller
checks `title` and `completed` type but does not strip other keys before passing to
the service.

```js
// tasks.service.js — updateTask
const updatedTask = {
  ...existingTask,
  ...updates,           // spreads every key from the request body, unfiltered
  updatedAt: new Date().toISOString(),
};
```

**Note on prototype pollution:** `express.json()` uses `JSON.parse` internally, which
stores `__proto__` as a literal own string property — not as a prototype assignment.
Prototype pollution is therefore **not** a confirmed risk here. The confirmed risk is
**schema corruption**: arbitrary client-supplied keys are written to `tasks.json` and
returned to all future callers.

**Why is it a problem?**

Any client can inject arbitrary keys into stored records. Future reads return
unexpected fields. The `taskValidator.js` utility already in the project rejects
unknown fields — but it is never used (see MAINT-001).

**How to improve it:**

```js
const updatedTask = {
  ...existingTask,
  ...(updates.title !== undefined && { title: updates.title }),
  ...(updates.completed !== undefined && { completed: updates.completed }),
  updatedAt: new Date().toISOString(),
};
```

---

## SEC-003 — No explicit body size limit configured

**What is wrong?**

`express.json()` is called with no options. Express's default body size limit is
100 kilobytes.

```js
// app.js
app.use(express.json());  // default limit: 100kb
```

**Why is it a problem?**

For an API that only accepts short string fields (`title`, `action`, `info`), a 100kb
body is not a legitimate request. Combined with the absence of validation on
`POST /activity` (SEC-001), a client can write large string values directly into
`activity.json`, consuming disk space without restriction.

**How to improve it:**

Set an explicit, tight limit and add per-field length constraints in the validators:

```js
// app.js
app.use(express.json({ limit: '10kb' }));
```

---

## SEC-004 — No environment distinction in error logging

**What is wrong?**

The error handler unconditionally logs the full error object (including stack trace) to
stdout regardless of the deployment environment.

```js
// errorHandler.js
if (statusCode >= 500) {
  console.error(error);   // always logs full stack trace
}
```

**Why is it a problem?**

This does not leak information to HTTP clients — the 500 response body is correctly
masked. It is a logging configuration gap: there is no way to adjust verbosity for
production deployments or to produce structured, machine-parseable log output.

**How to improve it:**

```js
if (statusCode >= 500) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(error);
  } else {
    console.error({ message: error.message, statusCode });
  }
}
```

---

# 5. Code Quality

## QUALITY-001 — Controller performs validation, normalisation, and delegation

**What is wrong?**

`createTask` and `patchTask` each perform body shape validation, field type checking,
string trimming, default value assignment, and service delegation — all in a single
function.

```js
// tasks.controller.js — createTask (30 lines)
async function createTask(req, res) {
  const payload = req.body || {};

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: { message: 'Body must be an object.' } });
  }
  if (typeof payload.title !== 'string') {
    return res.status(400).json({ error: { message: 'title is required and must be string' } });
  }
  payload.title = payload.title.trim();
  if (!payload.title) {
    return res.status(400).json({ error: { message: 'title cannot be empty' } });
  }
  if (payload.completed === undefined) { payload.completed = false; }
  if (typeof payload.completed !== 'boolean') {
    return res.status(400).json({ error: { message: 'completed must be boolean' } });
  }

  const task = await tasksService.createTask(payload);
  res.status(201).json({ data: task });
}
```

**Why is it a problem?**

A controller's responsibility should be limited to: receive the request, call the
validator, call the service, return the response. Fat controllers are harder to read,
harder to test, and must be modified for every new field.

**How to improve it:**

Using the existing `taskValidator.js` (which already handles all of the above):

```js
// tasks.controller.js — createTask (~4 lines)
const { validateCreateTask } = require('../utils/taskValidator');

async function createTask(req, res) {
  const payload = validateCreateTask(req.body);
  const task = await tasksService.createTask(payload);
  res.status(201).json({ data: task });
}
```

---

## QUALITY-002 — `createTask` service mutates its input parameter

**What is wrong?**

The service modifies the object passed in by the caller rather than working on a copy.

```js
// tasks.service.js — createTask
async function createTask(payload) {
  // ...
  if (payload.completed === undefined) {
    payload.completed = false;   // mutates the caller's object
  }
}
```

**Why is it a problem?**

The side effect is invisible to the caller. If the same object is inspected or reused
after the call, it will have been silently modified.

**How to improve it:**

```js
const data = { ...payload, completed: payload.completed ?? false };
const newTask = buildTaskRecord(data);
```

---

## QUALITY-003 — `POST /activity` response not wrapped in the `{ data }` envelope

**What is wrong?**

The activity POST handler returns the new record as a raw object. Every task endpoint
wraps its response in `{ data: ... }`.

```js
// activity.controller.js
res.status(201).json(made);            // returns the object unwrapped

// tasks.controller.js — consistent pattern
res.status(201).json({ data: task });  // wrapped in { data }
```

**Why is it a problem?**

Clients must implement two different response-parsing strategies for conceptually
identical create operations.

**How to improve it:**

```js
res.status(201).json({ data: newActivity });
```

---

## QUALITY-004 — Unsupported HTTP methods on known paths return `404` not `405`

**What is wrong?**

A request like `PUT /tasks` falls through to the catch-all and receives `404 Not Found`.

```js
// app.js — catch-all
app.use((req, res, next) => {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
});
```

**Why is it a problem?**

`404` means the resource path does not exist. When the path is known but the method is
not supported, the correct response is `405 Method Not Allowed` with an `Allow` header
listing the valid methods. Incorrect status codes mislead API clients and monitoring
systems.

**How to improve it:**

Add a `.all()` handler at the end of each router:

```js
// tasks.routes.js
tasksRouter.all('/', (req, res) => {
  res.set('Allow', 'GET, POST')
     .status(405)
     .json({ error: { message: `Method ${req.method} not allowed.` } });
});

tasksRouter.all('/:id', (req, res) => {
  res.set('Allow', 'GET, PATCH, DELETE')
     .status(405)
     .json({ error: { message: `Method ${req.method} not allowed.` } });
});
```
