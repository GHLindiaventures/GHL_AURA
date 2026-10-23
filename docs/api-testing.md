# API testing status

The API integration-test project and its GitHub Actions workflow are currently disabled. The `backend.Tests` project files were removed, so `.github/workflows/api-tests.yml` was removed as well; otherwise GitHub Actions would fail during restore/build because the referenced project no longer exists.

The regular application CI workflow remains separate and is not affected. A passing CI run does not mean API integration tests were run.

To re-enable API integration testing:

1. Restore or recreate `backend.Tests/backend.Tests.csproj`, the test host, and API test cases.
2. Configure the test host with an isolated in-memory/test database and test-only JWT settings. Do not use production or staging credentials/data.
3. Add `.github/workflows/api-tests.yml` to restore, build, and run the test project and upload TRX results.
4. Run the workflow on GitHub and configure branch protection to require its test job before merging.
