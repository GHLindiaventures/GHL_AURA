# GHL AURA Docker setup (local development)

This Docker Compose setup runs the frontend, ASP.NET Core API, and a dedicated local PostgreSQL database. It is intended for local development and evaluation, not as the existing staging/production deployment.

The API initializes an empty Compose database from the current EF Core model. This development-only setup skips EF migrations because the current historical migration chain is not suitable for bootstrapping a clean local database. The database and uploaded files use named Docker volumes so they persist when containers are restarted.

## What you need

- Docker Desktop for Windows, running with the Linux container engine.
- This repository checked out on your computer.
- The Docker Compose plugin (`docker compose`).

You do not need to install .NET, Node.js, or PostgreSQL on your Windows machine to start this Docker setup.

## Start it on Windows

Open PowerShell in the repository root:

```powershell
Set-Location D:\ghl_aura\ghl_aura
```

Copy the safe example settings into a local, untracked environment file:

```powershell
Copy-Item .env.example .env
notepad .env
```

Change `POSTGRES_PASSWORD` and `JWT_SECRET_KEY` to unique, local-only values. Use a JWT secret of at least 32 characters. Do not copy production credentials into this file or commit `.env`.

You can generate random local values from PowerShell and paste them into `.env`:

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes)
$rng.Dispose()
$secret
```

Use separate generated values for `POSTGRES_PASSWORD` and `JWT_SECRET_KEY`.

Validate the Compose configuration and build/start all containers:

```powershell
docker compose config --quiet
docker compose up --build -d
```

The first build may take several minutes while Docker downloads the .NET, Node.js, and PostgreSQL images and restores packages. The API then runs EF migrations against the **Docker-local** database before starting.

Check container status and logs:

```powershell
docker compose ps
docker compose logs -f backend
```

When the backend reports that it is listening, open:

- Frontend/login: <http://localhost:5173>
- API Swagger: <http://localhost:5106/swagger>
- Backend liveness check: <http://localhost:5106/health/live>
- Backend/database readiness check: <http://localhost:5106/health/ready>

The Vite frontend forwards `/api`, `/uploads`, and `/hubs` to the backend using the private Compose network. The browser should use `localhost`, not the internal Docker hostname `backend`.

## Everyday commands

```powershell
# Restart containers
docker compose restart

# Rebuild after changing Dockerfiles or dependencies
docker compose up --build -d

# View all service logs
docker compose logs -f

# Stop containers but keep the local database and uploads
docker compose down

# Stop containers AND permanently delete the local database, uploads and frontend dependency volume
docker compose down --volumes
```

**Caution:** `docker compose down --volumes` permanently deletes the local Docker PostgreSQL database and uploaded files. Use it only when you intentionally want to reset local data. It does not connect to or delete your hosted database.

The Docker development database is initialized with `EnsureCreated`, so it has no EF migration history. After changing the EF model, back up anything you need and intentionally recreate the local database volume to apply the updated model. Do not use this initialization mode for staging or production.

## Persistence and integrations

- `postgres-data` preserves the local PostgreSQL database across normal restarts.
- `uploads-data` preserves files uploaded to the backend.
- Email and Twilio settings are blank or local defaults in `.env.example`. Configure your provider's **test/sandbox** credentials in `.env` if you want to exercise those integrations; otherwise they may be unavailable.
- This setup does not copy, synchronize, or connect to your existing production database.

## Production deployment is separate

The Compose file intentionally runs `ASPNETCORE_ENVIRONMENT=Development`, uses a local PostgreSQL volume, and installs the EF CLI in a development image. **Do not deploy this development Compose setup or its `.env` to production.**

The backend Dockerfile also defines a smaller `final` runtime image, but your current GitHub workflows deploy to a Droplet using `systemd` and Nginx, not Docker. Moving staging/production to Docker requires a separate reviewed deployment change: image publishing, environment-specific secrets and database configuration, persistent upload storage, TLS/reverse proxy, health checks, and a verified backup/migration/rollback plan. Keep production credentials out of image build arguments and the frontend.

### Pull request and deployment flow

- Pull requests targeting `staging`, `main`, `develop`, or `backend-api` run CI checks: frontend tests/build and a backend build.
- Once SonarQube Cloud is configured, those checks also analyze backend and frontend projects separately and wait for each quality gate.
- Create the two projects in SonarQube Cloud and set GitHub repository secret `SONAR_TOKEN` plus repository variables `SONAR_ORGANIZATION`, `SONAR_BACKEND_PROJECT_KEY`, and `SONAR_FRONTEND_PROJECT_KEY`. Install/configure the SonarQube Cloud GitHub integration for PR decoration. Analysis sends source code to SonarQube Cloud; forked PRs do not receive repository secrets and therefore cannot run authenticated analysis.
- Merge a passing, reviewed pull request into `staging` to trigger the staging deployment. Configure a GitHub `staging` environment with staging-only SSH secrets.
- Promote tested staging changes to `main` with a separate pull request. Configure the GitHub `production` environment with production-only SSH secrets and required reviewers if production approval is needed.
- Configure GitHub branch protection/rulesets for `staging` and `main` to require pull requests and the CI checks, including both SonarQube Cloud quality-gate jobs after their secrets and variables are configured. Workflows cannot enforce those repository settings themselves.
- Deployment stops if database migrations or service restarts fail. Validate migrations and backups in staging before production.

## Troubleshooting

- **`docker` or `docker compose` is not recognized:** install/start Docker Desktop, then open a new PowerShell window and verify `docker compose version`.
- **Port already in use:** stop the conflicting local process or change the host-side port in `docker-compose.yml` (`5173` for frontend, `5106` for API).
- **Containers start but migrations fail:** inspect `docker compose logs backend` and `docker compose logs db`. Do not point the local Compose setup at a production database.
- **Login or API calls fail:** confirm all three services are running with `docker compose ps`, inspect the backend logs, and check that the browser is using <http://localhost:5173>.
