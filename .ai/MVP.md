### GD Tracker (MVP)

### Short description

GD Tracker is a lightweight PWA for tracking gestational diabetes glucose readings over time. It lets a signed-in user record measurements, review them in a table with status highlighting, filter by date range, and export a printable PDF summary.

### What we support (MVP features)

- **Auth / session**
  - Sign in via **Google OAuth** (Supabase Auth).
  - Sign out.
- **List / browse readings**
  - List readings for the selected period (sorted newest first).
  - Show: measurement datetime, type, glucose value, status badge, notes, and last modified timestamp.
  - Status is computed against target ranges (**fasting: 91**, **1h after meal: 140**) and displayed as in-range / near-limit / out-of-range.
- **Add a reading**
  - Fields:
    - Glucose value (integer; UI validation **0–500**; interpreted as mg/dL in the UI/labels).
    - Measurement type: **fasting** or **1h after meal**.
    - Datetime (entered in local time; stored as UTC ISO in the DB).
    - Optional notes/comment.
- **Edit a reading**
  - Edit the same fields as “add” (value, type, datetime, notes).
  - Last modified is tracked via `updated_at`.
- **Remove a reading**
  - Delete a reading with a confirmation prompt.
- **Filter by date range**
  - Presets: **Today**, **Last 7 days**, **Last 30 days**, **Custom range** (from/to date).
- **Export**
  - Export filtered data to **PDF**:
    - Grouped by day, with columns for **fasting** + up to **5 “1h after meal”** values per day.
    - Color-coded values based on targets.
    - Localized (EN/PL) and includes the selected date range.
- **UX / platform**
  - Responsive UI with a floating “add” button on mobile devices.
  - **Theme toggle** (light/dark/system) persisted in localStorage.
  - **Language switcher** (English/Polski) persisted in localStorage.
  - Installable **PWA** (standalone display) with service worker caching (network-first for Supabase requests).

### Data model (MVP)

Single table: `glucose_readings`

- `id` (uuid)
- `user_id` (Supabase `auth.users.id`)
- `glucose_value` (integer)
- `measurement_type` ("fasting" | "1hr_after_meal")
- `measured_at` (timestamptz)
- `comment` (text, optional)
- `created_at` (timestamptz)
- `updated_at` (timestamptz, auto-updated via trigger)

Row Level Security (RLS) enforces per-user access: users can SELECT/INSERT/UPDATE/DELETE only their own rows.

### Tech stack used

- **Frontend**: React 19 + TypeScript, Vite 7
- **Styling/UI**: Tailwind CSS v4, Radix UI primitives, shadcn-style components, lucide-react icons
- **Data/auth**: Supabase (Postgres + RLS) via `@supabase/supabase-js`
- **Dates/i18n**: date-fns, custom i18n provider with EN/PL JSON dictionaries
- **PDF export**: jsPDF + jspdf-autotable (with embedded Roboto fonts for Polish characters)
- **PWA**: `vite-plugin-pwa` (Workbox)

### Supported auth methods

- **Google OAuth** via Supabase Auth
