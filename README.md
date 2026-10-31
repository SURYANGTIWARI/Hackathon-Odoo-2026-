# Brightloop — Subscription Management

Brightloop is a React + Vite subscription management workspace. It includes a public landing page, Supabase Auth screens, an Admin/Staff intelligence dashboard, and a Customer portal. The dashboard and portal read live records through the existing Supabase client and RLS policies; other business modules remain clearly marked as foundations until their CRUD workflows are implemented.

## Run locally

```sh
npm install
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the project-root `.env.local` file. Restart Vite after changing environment configuration. Never add a service-role or secret key to frontend variables.

## Routes and account access

- `/` — public landing page
- `/login` — Admin, Staff, and Customer login
- `/signup` — public Customer registration only
- `/reset-password` — Supabase password recovery
- `/dashboard` — protected Admin/Staff workspace
- `/portal` — protected Customer records, scoped by database RLS

The app loads the authenticated user's role from `public.profiles`; it does not accept roles from signup form input. Database migrations and staff account provisioning instructions are in [`supabase/SETUP.md`](supabase/SETUP.md). Do not treat the local SQL files as applied to a Supabase project until an administrator runs them.

## Checks

```sh
npm run build
npm run lint
```
