# SXCCE Account Registration — Password Setup Portal

A Next.js 16 web application that lets SXCCE students create their student-portal password securely through a guided, email-verified, multi-step flow.

---

## Features

- **Multi-step single-page form** — Instructions → Identity → OTP → Password → Success
- **Email OTP verification** — 6-digit OTP sent to `@sxcce.edu.in` address, valid for 5 minutes, single-use
- **Roll-number cross-check** — the number inside the email must match the roll number field
- **Secure password storage** — bcrypt (cost 12) hash stored in MongoDB; plaintext never persisted
- **Password strength indicator** — real-time feedback while typing
- **Rate limiting** — max 3 OTP requests per hour per email

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Database | MongoDB Atlas (free M0 tier) via Mongoose |
| Email | **Brevo** (free SMTP relay — 300 emails/day, lifetime free) |
| Password hashing | bcryptjs (cost 12) |

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/astlindijo/password.git
cd password
npm install
```

### 2. Set up MongoDB Atlas (free)

1. Go to <https://cloud.mongodb.com> → create a free **M0** cluster.
2. Create a database user and allow access from your IP (or `0.0.0.0/0` for Vercel).
3. Copy the **connection string** — it looks like:
   ```
   mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/sxcce?retryWrites=true&w=majority
   ```

### 3. Set up Brevo email (free — 300 emails/day, lifetime)

> Brevo is the recommended free email service for this project.  
> It supports **300 emails / day** with **unlimited contacts** — enough for  
> 2,000 – 3,000 students receiving daily OTP emails, **forever free**.

1. Register at <https://app.brevo.com/account/register> (no credit card needed).
2. Navigate to **Settings → SMTP & API → SMTP** tab.
3. Click **"Generate a new SMTP key"** and copy the key shown.
4. Note your **Brevo login email** (used as the SMTP username).

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/sxcce?retryWrites=true&w=majority

# Brevo SMTP (free — 300 emails/day, lifetime)
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-brevo-login@example.com   # your Brevo account email
EMAIL_PASS=your-brevo-smtp-key            # the SMTP key from step 3.3 above
EMAIL_FROM=noreply@sxcce.edu.in
```

### 5. Run locally

```bash
npm run dev
```

Open <http://localhost:3000>.

### 6. Deploy to Vercel (recommended)

```bash
npx vercel --prod
```

Add the environment variables from `.env.local` in the Vercel project settings.

---

## Project Structure

```
app/
  page.tsx              — multi-step registration UI
  layout.tsx            — root layout + metadata
  globals.css           — Tailwind base styles
  api/
    send-otp/route.ts   — validate email/rollno, send OTP via Brevo SMTP
    verify-otp/route.ts — verify 6-digit OTP (single-use, 5-min TTL)
    set-password/route.ts — hash & store password in MongoDB
lib/
  mongodb.ts            — Mongoose connection with serverless-safe caching
  otp-store.ts          — in-memory OTP store (bcrypt hash, TTL, rate limit)
models/
  User.ts               — Mongoose schema: rollno + email + hashed password
```

---

## Support

If you face any issues, contact [@astlin_dijo](https://astlindijo.vercel.app).