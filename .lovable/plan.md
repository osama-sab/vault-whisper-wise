# Offline-First Budget Tracker PWA

A fully local, installable budget tracking app modeled on classic budgeting spreadsheets (Income / Bills / Expenses / Savings / Debt) with dual-profile tracking (Household / Personal / Combined), smart CSV import for German banks, a privacy-first "Discreet Mode", and PDF/CSV reporting. All data lives on the device in IndexedDB.

## App Structure

Bottom tab navigation (native-app feel):
- **Dashboard** – Month-in-review, "Left to Spend / Budget", category bars
- **Transactions** – List, add, edit, split, vague toggle
- **Calendar** – Grid bill calendar with payday markers and check-off
- **Subscriptions** – Recurring bill tracker
- **Import** – CSV upload + auto-categorization review
- **Settings** – Categories, Rules, Discreet Mode, Profiles, Export, PDF

Persistent header controls:
- Profile switcher chip: **Household / Personal / Combined**
- **Discreet Mode** eye-toggle (blurs/redacts payees globally)

## Core Features

### 1. Dual-Level Tracking
- Profile context provider drives all queries and aggregations.
- Every transaction stores a `profile` field. "Combined" merges both views read-only.

### 2. Transactions
- Add/Edit form: date, amount, category, profile, payee, description, notes, isVague flag.
- **Split**: dynamic rows assigning portions of the total across categories and profiles; sum must equal total before save.
- **Make Vague** checkbox: stores `displayDescription` as the category's generic label, keeps the original encrypted-at-rest only if the user opts in (default: discard original).
- **Discreet Mode** (UI-level): replaces payee/description with category name and applies blur to amounts on long-press reveal.

### 3. CSV Import
- Drag-drop or file picker. Format selector: **Sparkasse**, **Wise**, **Generic (column mapper)**.
- Parses Sparkasse semicolon CSV (Buchungstag, Verwendungszweck, Beguenstigter, Betrag) and Wise CSV (Date, Description, Amount, Currency).
- Runs the rule engine; shows a review table with proposed category/profile per row.
- Unmatched rows: user picks category → prompt **"Save as rule for future imports?"** with editable keyword.
- Duplicate detection by date+amount+payee hash.

### 4. Rule Management
- Settings → Rules screen.
- Each rule: keyword (contains, case-insensitive), match field (payee/description/either), category, profile, priority.
- Add / edit / delete / reorder. Test box to preview a rule against a sample string.

### 5. Subscriptions & Bill Calendar
- Subscription model: name, dueDay (1–31), expectedAmount, actualAmount (per month), category, profile, active flag.
- Calendar: month grid Sun–Sat. Cells show payday badges and bill chips. Tap a bill chip to mark paid for the current month (stored per month/year). Overdue chips highlighted.

### 6. Reporting & Export
- **Month in Review**: budgets per category, spent, remaining, % bar; totals for Income, Expenses, Savings, Debt; "Left to Spend" = income − committed; "Left to Budget" = budget − allocated.
- **PDF**: jsPDF + jspdf-autotable + lightweight inline SVG/Canvas chart for spending by category. Discreet Mode export omits payee/description columns entirely and shows only category totals.
- **CSV Export**: current month's transactions, RFC-4180 compliant.

### 7. Default Schema (seeded on first launch)
Categories grouped by type:
- **Income**: Salary, Side Income, Other
- **Bills**: Rent, Utilities, Internet, Phone, Insurance
- **Expenses**: Groceries, Transport, Dining, Medical, Personal, Household, Entertainment
- **Savings**: Emergency Fund, Goals
- **Debt**: Loan, Credit Card

Each category has: name, type, profileDefault, monthlyBudget, genericLabel (used by Discreet/Vague mode).

### 8. PWA / Installability
- `vite-plugin-pwa` with manifest (name, icons 192/512, theme color, `display: standalone`).
- Service worker with NetworkFirst for HTML, precaching app shell.
- Install prompt page `/install` with iOS "Add to Home Screen" instructions and Android install button.
- Note: SW disabled in dev / Lovable preview iframe; works in published build.

## Data Model (IndexedDB via `idb`)

```text
db: budgetApp
├── profiles            { id, name }                       // seeded: household, personal
├── categories          { id, name, type, profileDefault, monthlyBudget, genericLabel }
├── transactions        { id, date, amount, categoryId, profile, payee, description,
│                         displayDescription, isVague, splitGroupId?, importedFrom? }
├── splits              { groupId → [transactionIds] }    // logical link
├── subscriptions       { id, name, dueDay, expectedAmount, categoryId, profile, active }
├── billPayments        { subscriptionId, year, month, paid, actualAmount }
├── rules               { id, keyword, field, categoryId, profile, priority }
├── settings            { discreetMode, activeProfile, paydays:[], theme }
└── importLog           { id, source, date, rowCount, hashes[] }
```

## Tech Stack

- React 18 + Vite + TypeScript + Tailwind + Lucide-React (already in project).
- `idb` for IndexedDB.
- `papaparse` for CSV parsing/export.
- `jspdf` + `jspdf-autotable` for PDF.
- `date-fns` for calendar/month math.
- `vite-plugin-pwa` (Workbox) for service worker + manifest.
- React Router for tabs/pages.
- Zustand (lightweight) for global UI state (active profile, discreet mode).

## Out of Scope (not built)
- Cloud sync, accounts, multi-device sharing.
- Bank API connections (CSV only).
- Encryption of original payee text beyond browser storage defaults (can be added later).
