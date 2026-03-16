# Thiepcuoi4 — Wedding Invitation Website

A full wedding invitation system with:

- Public invitation website (guest-facing)
- Admin CMS for editing JSON-driven content
- Personalized guest links with token-based rendering
- RSVP, Blessings, and Hearts APIs

---

## 1) Run on localhost

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
npm install
```

### Configure Admin login

1. Copy environment template:

```bash
copy .env.example .env
```

(Use `cp .env.example .env` on macOS/Linux.)

2. Generate SHA-256 hash for your admin password:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('YOUR_PASSWORD').digest('hex'))"
```

3. Open `.env` and set:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<generated_hash>
```

### Start servers

You need 2 servers in 2 terminals:

Terminal A (public site):

```bash
npm run dev
```

Terminal B (admin CMS):

```bash
npm run admin:dev
```

### Access

- Public: http://localhost:3000
- Admin: http://localhost:8080

### Run tests

```bash
npm test
```

---

## 2) How Admin affects Public (core principle)

**Everything edited in Admin is persisted into JSON files under `data/`, and Public reads those values at runtime.**

- Admin writes data via API in admin server
- Public server and browser load those JSON files
- Guest personalization (`/<token>`) injects guest-specific values on top of base config

---

## 3) Detailed guide by section (Admin ↔ Public)

## 3.1 Hero & Gallery

### Admin

- Tab: **Hero & Gallery**
- Main source: `hero_gallery.json`
- You can edit hero image, text, photo list, thumbnail settings, and gallery display options.

### Public

- Hero section and gallery render from `hero_gallery.json`
- If not available, site falls back to legacy fields where supported.

### Impact flow

Admin save → `data/hero_gallery.json` updated → Public reload reflects hero/gallery changes.

---

## 3.2 Invitations (formats, placeholders, pronouns)

### Admin

- Tab: **Invitations**
- Main source: `invitations.json`
- Manage:
  - Multiple invitation formats (e.g., default/formal/casual)
  - Body template placeholders like `{d0}`, `{d1}`, ...
  - Slot descriptors (`index`, `label`, `type`, `hint`)
  - Default pronouns per slot
  - Global presets
  - Pronoun auto-fill preset table (`pronoun_for_title_defaults`)

### Public

- Invitation title/body/closing render from `invitations.json`
- For tokenized guests, selected `invitation_format` and guest pronouns are applied.

### Impact flow

Admin save format/presets → `data/invitations.json` updated → Public invitation text and replacement behavior change accordingly.

---

## 3.3 Guest Links (personalized invitation)

### Admin

- Tab: **Guest Links**
- Main source: `guest-links.json`
- Manage per guest:
  - `token`
  - `phrase`, `pronoun_for_title`, `guest_name`
  - `invitation_format` (per-guest format selection)
  - Pronoun slots (`d0...dN`)
  - `custom_body` (optional override)
  - QR target and image state

When changing `pronoun_for_title`, system auto-fills pronouns by this order:

1. Try `pronoun_for_title_defaults` preset from `invitations.json`
2. If no preset match, fallback to slot-type logic

### Public

- Access via personalized URL: `http://localhost:3000/<token>`
- Server injects personalization bootstrap:
  - title/pronouns/custom body/family companion flag/invitation format
- Browser renders final invitation from guest data + selected format.

### Impact flow

Admin save guest entry → `data/guest-links.json` updated → guest token page reflects new personalized content.

---

## 3.4 Story

### Admin

- Tab: **Story**
- Main source: `story-layout.json`
- Edit timeline blocks, layout, media, and text structure.

### Public

- Story section renders from story layout JSON and related media references.

### Impact flow

Admin save story layout → `data/story-layout.json` updated → Public story section updates.

---

## 3.5 Wedding core config

### Admin

- Tab: **Wedding**
- Main source: `wedding.json`
- Edit foundational page content and section settings:
  - Couple info
  - Hosts
  - Ceremony/reception info
  - RSVP labels/options
  - Gifts information
  - Typography, spacing, and other base settings

### Public

- Public uses `wedding.json` as base configuration.
- Newer feature-specific files may override parts of legacy invitation data.

### Impact flow

Admin save base config → `data/wedding.json` updated → corresponding Public sections update.

---

## 3.6 RSVP, Blessings, Hearts

### Admin

- Data files managed by APIs:
  - `rsvp.json`
  - `blessings.json`
  - `hearts.json`

### Public

- RSVP form posts to API
- Blessings list reads/writes through API
- Hearts counter increments through API

### Impact flow

User interaction on Public → API writes JSON → Admin can inspect/manage resulting data.

---

## 3.7 Pronoun map

### Admin

- Tab: **Pronoun Map**
- Main source: `pronoun.json`
- Defines smart mappings used by auto-fill/fallback logic.

### Public

- Mainly influences personalization logic indirectly via admin-side processing and helper behavior.

### Impact flow

Admin save pronoun map → mapping behavior changes in guest personalization defaults.

---

## 4) Data files and ownership

- Runtime data: `data/*.json`
- Default reset templates: `data/defaults/*.json`
- Admin reads/writes allowlisted keys via `admin-server.js`

Key files:

- `data/invitations.json`
- `data/guest-links.json`
- `data/wedding.json`
- `data/story-layout.json`
- `data/hero_gallery.json`

---

## 5) Common workflow

1. Open Admin at `http://localhost:8080`
2. Edit target tab
3. Click Save
4. Open/refresh Public page at `http://localhost:3000`
5. For personalized test, open guest token URL

---

## 6) Troubleshooting

### Admin login fails

- Check `.env` exists and has valid `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`
- Regenerate hash and restart admin server

### Guest link page not personalized

- Verify token exists in `data/guest-links.json`
- Ensure URL is exactly `/<token>`

### Invitation placeholders not replaced

- Verify format body placeholders (`{d0}`, `{d1}`, ...)
- Check guest pronouns array and selected `invitation_format`
- Check `custom_body_enabled` and `custom_body`

### Port conflict

- Public default: `3000`
- Admin default: `8080`
- Stop conflicting process or run with different ports via environment variables.

---

## 7) Scripts

```bash
npm run dev         # Public server (nodemon)
npm run start       # Public server (node)
npm run admin:dev   # Admin server (nodemon)
npm run admin:start # Admin server (node)
npm test            # Full test suite
npm run invite:generate -- --phrase "Kính mời" --pronoun "anh" --guest "Minh"
```

---

## 8) Architecture note

This project uses a **JSON-as-CMS** architecture:

- Admin is the authoring layer
- JSON files are the source of truth
- Public is the rendering layer
- Guest token personalization is an overlay on top of base config

That is why each admin change can be traced directly to a public behavior change.
