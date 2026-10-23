# API testing

## Test project

`backend.Tests/backend.Tests.csproj` is an xUnit integration-test project targeting .NET 8. It uses `Microsoft.AspNetCore.Mvc.Testing` and `WebApplicationFactory<Program>` to exercise the actual ASP.NET Core pipeline over an in-process `HttpClient`.

The test host runs in the `Testing` environment, forces the backend to use EF Core's process-local InMemory database, and explicitly clears Twilio settings. Tests do not require production/staging credentials, PostgreSQL, Twilio, SMTP, or other external services. Do not change the test factory to load a non-test connection string.

There is no solution file in this repository. Build the backend and test project explicitly.

## Current automated coverage

The integration suite currently checks:

- Runtime Swagger JSON is reachable, has the expected API title, and its documented HTTP method/path set matches MVC's runtime API descriptions.
- `/health`, `/health/live`, `/health/ready`, and their `/api/Health` route aliases return the expected successful payload with the isolated test database.
- `/api/voice/status` is public and reports that provider credentials are absent in the test host.
- Representative protected call/admin/voice routes reject missing credentials.
- Every discovered controller operation marked with `[Authorize]` rejects an unauthenticated request without invoking the endpoint handler. This safely checks method/route routing and the authentication gate without calling mutating actions.
- An unknown route returns 404.

This is **not complete business-logic coverage for all endpoints**. Authenticated CRUD, role-by-role permissions, valid and invalid DTOs, tenant data isolation, duplicate handling, pagination/filtering, webhook signature behavior, uploads, and persistence still need endpoint-specific tests. The test suite does not send requests to external providers or issue destructive authenticated API requests.

The inventory test writes `TestResults/api-endpoint-inventory.json` with documented/runtime operation counts, authentication classification, coverage classification, and an entry for every MVC HTTP operation. It distinguishes behavioral tests from authentication-gate-only tests and untested anonymous endpoints. TRX contains the test case totals and pass/fail results.

Latest local run: 15 tests passed; Swagger and runtime discovery matched 359 operations, of which 7 have behavioral smoke tests, 332 have an unauthenticated-access check, and 20 anonymous operations remain untested. These counts are regenerated in `TestResults/api-endpoint-inventory.json` on each run. This is not full API business-logic coverage.

## Run locally

From the repository root in PowerShell:

```powershell
dotnet restore backend.Tests\backend.Tests.csproj
dotnet build backend\backend.csproj --configuration Release --no-restore
dotnet test backend.Tests\backend.Tests.csproj --configuration Release --logger "trx;LogFileName=api-tests.trx" --results-directory TestResults
```

The test project uses a process-local database; no database setup or secrets are required. `TestResults` contains the TRX result and generated endpoint inventory.

## GitHub Actions

`.github/workflows/api-tests.yml` runs for pull requests and pushes to `main`, `staging`, `develop`, and `backend-api`, and supports manual runs from **Actions → API Tests → Run workflow**. It restores and builds both .NET projects, runs tests, and uploads TRX and endpoint inventory files as an artifact even if a prior build/test step fails. The workflow needs no GitHub secrets.

To require tests before merging, configure branch protection or a repository ruleset for `staging` and `main`:

1. Require pull requests before merging.
2. Require status checks to pass.
3. Select the check named **API integration tests** (it may only appear after its first workflow run).
4. Optionally require an approving review and conversation resolution.

GitHub repository settings and reviewer/permission requirements must be configured by a repository administrator; the workflow file cannot turn on branch protection by itself.

## Adding tests for endpoints

1. Add a test in `backend.Tests` using `ApiApplicationFactory` and its `HttpClient`.
2. Assert the actual HTTP status and response contract, not just that the server returned a response.
3. For state-changing routes, seed isolated test data and assert the intended database effects. Never point tests at staging or production.
4. Mock or disable outbound integrations; do not send live SMS, email, voice calls, payments, or webhooks from automated tests.
5. Update the behavioral-coverage set in `ApiSmokeAndAuthorizationTests` when adding a meaningful contract test. The generated inventory is deliberately conservative and otherwise labels the endpoint only as auth-gate-covered or untested.
6. Run `dotnet test backend.Tests\backend.Tests.csproj` and inspect the TRX and JSON inventory outputs.

## OpenAPI and known limitations

Swagger is enabled at `/swagger` and its JSON is served at `/swagger/v1/swagger.json`. The integration test compares documented paths/methods against runtime MVC API descriptions to reveal drift. The inventory counts HTTP operations, not unique route strings; multiple HTTP methods on one path count separately.

The backend migration chain has previously failed on a clean database due to duplicate table creation. These tests intentionally use EF InMemory and therefore **do not validate PostgreSQL migrations or provider-specific SQL**. Add a separate PostgreSQL integration-test job against an ephemeral test-only database after the migration chain is repaired/verified. Do not point that job at production or staging.
