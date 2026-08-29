# KMCQ GmbH URL Gate Security Checkpoint — Documentation Index

| Guide | What it covers |
|---|---|
| [Blog post](blog.md) | Friendly, step-by-step introduction to the app |
| [Installation & configuration](installation-and-configuration.md) | Requirements, DB, `.env`, and every config option |
| [Usage guide](usage-guide.md) | Admin + visitor workflows, gate flow, path rules |
| [Production deployment](production-deployment.md) | HAProxy/CDN setup, process supervision, phpMyAdmin reverse proxy |
| [Security & architecture](security-and-architecture.md) | Security model, threat model, known limitations |
| [Development & testing](development-and-testing.md) | Dev loop, unit + E2E tests, Next.js 16 gotchas |
| [README](../README.md) | Quick start from the repo root |

## Quick start (3 commands)

```bash
npm install
npm run migrate
npm run dev
```

Then open `http://localhost:3000` and log in at `/login` with the seeded admin
(`admin_security` / `pass_admin_security7777`) — change the password right away.