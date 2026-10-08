# Northfield Academy School Management

A responsive React + TypeScript web client and Express/PostgreSQL API for school administration. The current MVP includes role-based login, student and teacher enrollment, class/subject organization, attendance, examinations/results, fee tracking, and staff dashboards.

## Requirements

- Node.js 20.19+ or 22.12+
- PostgreSQL 14+

## Configure the API

1. Create a PostgreSQL database.
2. Copy `config/.env.example` to `config/.env` and set `DATABASE_URL`, `JWT_SECRET` (at least 32 random characters), and any deployment-specific options.
3. Install backend dependencies with `npm install`.
4. Apply the additive schema with `psql "$env:DATABASE_URL" -f config/schema.sql` in PowerShell, or use your database client to run `config/schema.sql`. The schema uses `IF NOT EXISTS` and does not drop existing records.
5. Create the first administrator in an interactive terminal with `npm run admin:create`. The password is masked while typing. Additional accounts can be created after login.
6. Start the API with `npm run dev`. The default API address is `http://localhost:5000`.

Do not commit `config/.env`. For managed PostgreSQL that requires TLS, set `DATABASE_SSL=true`. Set `CLIENT_ORIGIN` to the exact deployed frontend origin (comma-separated if needed); cross-origin requests are disabled when it is unset.

## Start the web client

In another terminal, run:

```powershell
npm --prefix client install
npm run client:dev
```

Open the Vite URL printed by the command (normally `http://localhost:5173`). The dev server proxies `/api` requests to `http://localhost:5000`. Set `client/.env` from `client/.env.example` if the API is hosted elsewhere or your school uses a different currency.

Build the client with `npm run client:build`; serve the resulting `client/dist` directory with your static hosting provider. Configure `VITE_API_BASE_URL` to the deployed API URL and allow that frontend origin in Express CORS before deployment.

## Main API routes

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/register` (admin only)
- `POST /api/auth/signup` (public student signup only), `PATCH /api/auth/me`, `PATCH /api/auth/me/password`
- `/api/students`: directory, self profile, atomic enrollment, update, and delete
- `/api/teachers`, `/api/classes`, `/api/subjects`, `/api/class-subjects`
- `/api/timetable` (overlap-checked schedule) and `/api/announcements` (class targeting/read receipts)
- `/api/attendance` and `/api/attendance/summary`
- `/api/examinations`, `/api/results`, `/api/examinations/:id/results`
- `/api/fees`, `/api/fees/:id/pay`
- `GET /api/dashboard` (staff only)

All school data routes require a bearer JWT. Admin-only routes manage accounts, records, and fee receipts; teachers record attendance and exam results; student views are scoped to their own records and class. Fee payment in this MVP is an administrator-recorded payment with a generated receipt reference; it is not connected to a payment processor.

## Notes

The client is a responsive web application. Native React Native, homework, downloadable report-card layouts, payment-provider integration, and production deployment configuration are not included. Run `npm test` with PostgreSQL configured to execute the API integration workflow; it creates uniquely named temporary records and removes them at the end. Configure production secrets, backups, HTTPS, rate limits, and school-specific data retention before real student data is used.
