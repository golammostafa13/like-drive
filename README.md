# Drive

A Google-Drive-style library for PDFs. An administrator uploads files into
folders; anyone who signs in can browse, read them in the app and download
them; only the administrator can rename or delete. Bilingual (English and
Bengali), and sized to run entirely on free tiers.

Built on the same Next.js 16 / React 19 / Tailwind v4 stack as the sibling
libraries in this directory, and reusing their pdf.js reader, their signed
session and their CSP. What is new here is a real store: none of those three
has a working upload — their catalogues are hand-written TypeScript files.

---

## Setting it up

### 1. Supabase

Create a project, then in the SQL editor run the whole of
`supabase/migrations/0001_init.sql`. It creates the tables, the triggers, the
two storage buckets, and enables row-level security with no policies — see the
long note at the bottom of that file for why that combination is deliberate.

From **Project Settings → API**, take:

- the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- the **`service_role`** key → `SUPABASE_SERVICE_ROLE_KEY`

You do **not** need the `anon` key. The browser talks to Supabase exactly once
— a `PUT` to a signed upload URL, which carries its own token — so a public key
would be a credential with nothing to do.

> **Before relying on uploads**, prove one assumption the design rests on: that
> a signed upload URL minted by the service role uploads with the service
> role's authority, which is why the buckets carry no policies. One
> `createSignedUploadUrl` and one `curl -X PUT` is enough.

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in. It documents each variable
at length; the three that will bite if you get them wrong:

- **`AUTH_SECRET`** — `openssl rand -base64 48`. Unset in production, sign-in
  is disabled outright rather than signing cookies with something guessable.
- **`ADMIN_EMAILS`** — blank means *nobody* can administer. Both this and
  `ADMIN_PASSWORD` are required to reach an admin control; neither alone does
  anything.
- **`ADMIN_PASSWORD`** — must not be `SITE_PASSWORD` with characters appended.
  Two passwords where one is a prefix of the other survive `===` and are broken
  by the first well-meant "be forgiving about trailing whitespace" edit anyone
  makes nearby.

### 3. Run

```sh
npm install     # also vendors the pdf.js worker into public/
npm run dev
```

### 4. Deploy

Push to GitHub, import into Vercel, set the same variables in the dashboard.
`vercel.json` already registers the daily cron.

---

## How it works

### The door

Any email address plus one shared password gets you in, and a new address
simply becomes a new account — it is recorded, never checked. An address on
`ADMIN_EMAILS` that types `ADMIN_PASSWORD` gets an administrator's session
instead.

The session is an HMAC-signed cookie with no server-side store, so the route
guard in `src/proxy.ts` can verify it without a database round trip. The role
inside it is only half the check: `canAdminister()` also re-tests the address
against `ADMIN_EMAILS` **on every request**, read from the environment rather
than from the token. Removing an address therefore takes effect on the next
request rather than whenever an eight-hour cookie expires.

`SITE_PASSWORD` is short and shared, so `src/lib/auth/rate-limit.ts` is
load-bearing rather than decorative. It counts attempts per IP **in Postgres**,
not in memory: an in-process counter on a serverless host quietly means ten
attempts per instance rather than ten per address.

### Uploads never touch this server

Vercel's free tier caps a request body at ~4.5 MB and a Server Action's at
1 MB, so a 20 MB PDF cannot arrive through either. The browser uploads straight
to Supabase Storage:

1. `createUploadTicket` — checks the admin, reserves a `files` row as
   `pending`, mints two signed URLs. No bytes.
2. The browser `PUT`s the PDF (raw `XMLHttpRequest`, because `fetch` reports no
   upload progress), then renders page one with pdf.js and `PUT`s that as a
   WebP thumbnail.
3. `commitUpload` — verifies the object exists and begins with `%PDF-`, then
   promotes the row to `ready`.

**The row is written before the upload URL exists**, and that ordering is what
removes any need for a reconciliation pass. A failure at any point leaves the
row `pending`; every listing query filters `status = 'ready'`, so a broken
upload is *invisible* rather than a card that 404s. There is no opposite case,
because the object key is derived from the row id — bytes can only ever land at
a key belonging to a row that already exists.

### Reading proxies; downloading redirects

`/api/file/[id]` checks the session and proxies the bytes, forwarding `Range`.
That looks like the expensive option and is measurably the cheap one.

Supabase Storage serves real 206s and allows the `Range` *request* header
cross-origin, but sends no `Access-Control-Expose-Headers`, and hosted Storage
has no CORS configuration to add one. Cross-origin, JavaScript may read only
the six CORS-safelisted response headers — and `Accept-Ranges` is not among
them. pdf.js decides whether to use ranges by reading exactly that header off
the first response, so cross-origin it silently concludes ranges are
unsupported and **downloads the entire file on every open**.

| read path | Supabase egress per open |
|---|---|
| signed URL straight to pdf.js | ~20 MB — whole file, ranges silently off |
| proxy through `/api/file/[id]` | ~2–4 MB — ranged |

Downloads are the exception: a download is the whole file however it is served,
so `/api/file/[id]/download` checks the session and then 302s to a one-minute
signed URL. Note the `download` parameter passed to `createSignedUrl` is not a
nicety — the HTML `download` attribute is ignored across origins, so it is the
only thing making the saved filename correct.

### Object keys are ids, never paths

A file's bytes live at `<uuid>.pdf`. Nothing in the key records the folder or
the display name. This is the decision the rest of the codebase leans on
hardest: **rename and move are single-row `UPDATE`s that never touch storage.**
Under keys that mirrored the visible tree, renaming a folder would mean copying
every object beneath it and deleting the originals — unbounded, untransactional,
at up to 50 MB a copy, against a 1 GB quota.

It is also why the reader's saved position (`gdrive:progress:<fileId>`)
survives a rename and a move for free.

### Deletion is row-first

The two failure modes are not symmetric. A row pointing at missing bytes is a
file that lists and 404s — user-visible breakage only an admin can clear. Bytes
with no row are invisible and mechanically reclaimable. So the row goes first,
an `AFTER DELETE` trigger writes a tombstone into `orphan_objects` **in the
same transaction**, and the storage call that follows is free to be
best-effort — the daily cron retries whatever failed.

Which also makes recursive folder delete a single statement: `delete from
folders where id = $1` cascades through every descendant and enqueues every
object atomically. No tree walk in application code.

### The 3D

Four scenes on one harness (`src/lib/scenes/harness.ts`), all of which dispose
everything they allocate and none of which is in the initial bundle — `three`
is dynamically imported inside an effect.

- **Backdrop** — mounted once in the layout, so motion is continuous across
  navigation. **Disposed outright on `/read/[id]`**: pdf.js budgets tens of
  megabytes of page bitmaps and a live GPU context beside that is how a phone
  kills the tab.
- **Upload** — a sheet flying into a folder, driven by `xhr.upload.onprogress`.
  The animation *is* the progress indicator, which is precisely why the upload
  uses XHR rather than `fetch`.
- **Shelf** — one `InstancedMesh`, so a folder of 200 files stays one draw
  call. The spines carry colour rather than thumbnails: one draw call means one
  shared material, so per-spine covers would need a custom shader, and a custom
  shader recompiles on every theme change. Thumbnails live in the grid view,
  where they are real `<img>` elements the browser can cache and lazy-load.

`prefers-reduced-motion`, no WebGL, or `deviceMemory < 4` means **no renderer
is created at all** — not a paused one. Every view remains complete without
them; the upload's real `<progressbar>` is always rendered and the shelf's file
list is a real list of links, not a fallback.

---

## Verifying it

Anything not needing a Supabase project has been checked and passes:

- `/` honours `Accept-Language` (`bn-BD` → `/bn/drive`), then redirects to the
  door with `?next=` preserved.
- `/api/file/<id>` with no session: **401** to a fetch, **redirect** to a
  navigation — the split matters, or pdf.js parses the sign-in page as a PDF.
- A cookie claiming `role: admin` from an address **not** on `ADMIN_EMAILS`
  resolves to `admin: false`.
- A tampered cookie is rejected.
- Wrong password, malformed address, and the admin password from an unlisted
  address are each refused with their own message — and the last does **not**
  fall back to reader access.
- Any address plus `SITE_PASSWORD` signs in and sets an `HttpOnly; Secure;
  SameSite=lax` cookie.
- `?next=https://evil.example` and `?next=//evil.example` are both ignored;
  `?next=/en/drive/abc` is honoured.
- `/api/cron/maintain` refuses a missing or wrong bearer token.
- With Supabase unreachable, the drive renders "the library is waking up" in
  both languages rather than a 500.

Still to check against a real project: upload end to end, a **206** with a
`Content-Range` from `/api/file/[id]`, the download filename, recursive folder
delete removing storage objects, and the cron.

---

## Free-tier limits worth knowing

- **Supabase storage is 1 GB**, and 50 MB per file. `gs -dPDFSETTINGS=/ebook`
  roughly halves a scanned PDF if you approach it.
- **Supabase egress is 5 GB/month.** The proxy read path is worth roughly 5–10×
  the signed-URL alternative here, so this is far less tight than it looks — but
  downloads are a flat ~20 MB each and there is no architecture that changes
  that.
- **A free Supabase project pauses after 7 days of inactivity**, and a paused
  project fails *everything*. The daily cron touches `heartbeat` to prevent it.
  It cannot cure a pause — that needs a click in the dashboard.
- **Vercel Hobby crons** run once a day, against production only.
