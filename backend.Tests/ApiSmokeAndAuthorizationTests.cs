using System.Net;
using System.Text.Json;
using backend.Data;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace backend.Tests;

public sealed class ApiSmokeAndAuthorizationTests(ApiApplicationFactory factory)
    : IClassFixture<ApiApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false
    });

    [Fact]
    public void Test_host_uses_an_in_memory_database()
    {
        using var scope = factory.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        Assert.True(database.Database.IsInMemory());
    }

    [Theory]
    [InlineData("/health/live", "Live")]
    [InlineData("/health/ready", "Ready")]
    [InlineData("/health", "Healthy")]
    [InlineData("/api/Health/live", "Live")]
    [InlineData("/api/Health/ready", "Ready")]
    [InlineData("/api/Health", "Healthy")]
    public async Task Health_endpoints_return_expected_status_and_payload(string path, string expectedStatus)
    {
        using var response = await _client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(expectedStatus, body.RootElement.GetProperty("status").GetString());
        Assert.False(string.IsNullOrWhiteSpace(body.RootElement.GetProperty("service").GetString()));
    }

    [Fact]
    public async Task Swagger_document_is_available_and_contains_api_routes()
    {
        using var response = await _client.GetAsync("/swagger/v1/swagger.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("GHL Aura Platform API", document.RootElement.GetProperty("info").GetProperty("title").GetString());
        Assert.True(document.RootElement.GetProperty("paths").EnumerateObject().Any());
    }

    [Fact]
    public async Task Voice_status_is_public_and_never_reports_test_credentials()
    {
        using var response = await _client.GetAsync("/api/voice/status");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = body.RootElement.GetProperty("data");
        Assert.False(data.GetProperty("isConfigured").GetBoolean());
        Assert.False(data.GetProperty("hasAccountSid").GetBoolean());
        Assert.False(data.GetProperty("hasTwiMLApp").GetBoolean());
        Assert.False(data.GetProperty("hasCallerNumber").GetBoolean());
    }

    [Theory]
    [InlineData("GET", "/api/voice/token")]
    [InlineData("GET", "/api/sales-executive/calls")]
    [InlineData("POST", "/api/sales-executive/calls")]
    [InlineData("GET", "/api/adminusers")]
    public async Task Protected_endpoints_reject_missing_credentials(string method, string path)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (!HttpMethods.IsGet(method))
        {
            request.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
        }

        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_route_returns_not_found()
    {
        using var response = await _client.GetAsync("/api/__automated-test-route-that-does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task OpenApi_inventory_matches_runtime_routes_and_writes_coverage_report()
    {
        using var response = await _client.GetAsync("/swagger/v1/swagger.json");
        response.EnsureSuccessStatusCode();
        using var swagger = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        var documented = swagger.RootElement.GetProperty("paths")
            .EnumerateObject()
            .SelectMany(path => path.Value.EnumerateObject().Select(operation =>
                $"{operation.Name.ToUpperInvariant()} {NormalizeOpenApiPath(path.Name)}"))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var apiDescriptions = factory.Services
            .GetRequiredService<IApiDescriptionGroupCollectionProvider>()
            .ApiDescriptionGroups.Items
            .SelectMany(group => group.Items)
            .Where(description => description.HttpMethod != null && description.RelativePath != null)
            .ToList();

        var runtime = apiDescriptions
            .Select(description => $"{description.HttpMethod!.ToUpperInvariant()} {NormalizeOpenApiPath(description.RelativePath!)}")
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var protectedEndpoints = apiDescriptions
            .Where(IsProtected)
            .ToList();
        var behavioralCoverage = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "GET /health",
            "GET /health/live",
            "GET /health/ready",
            "GET /api/Health",
            "GET /api/Health/live",
            "GET /api/Health/ready",
            "GET /api/voice/status"
        };

        var report = apiDescriptions
            .Select(description =>
            {
                var endpoint = $"{description.HttpMethod!.ToUpperInvariant()} {NormalizeOpenApiPath(description.RelativePath!)}";
                var isProtected = IsProtected(description);
                var hasBehavioralCoverage = behavioralCoverage.Contains(endpoint);
                return new
                {
                    method = description.HttpMethod!.ToUpperInvariant(),
                    route = NormalizeOpenApiPath(description.RelativePath!),
                    authentication = isProtected ? "required" : "anonymous",
                    coverage = hasBehavioralCoverage
                        ? "behavioral integration"
                        : isProtected
                            ? "unauthenticated access rejected"
                            : "not tested",
                    documentedInOpenApi = documented.Contains(endpoint)
                };
            })
            .OrderBy(item => item.route, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.method, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var coverageReport = new
        {
            generatedAtUtc = DateTime.UtcNow,
            documentedEndpointCount = documented.Count,
            runtimeEndpointCount = runtime.Count,
            endpointCountWithBehavioralIntegrationTests = report.Count(item => item.coverage == "behavioral integration"),
            endpointCountWithAuthenticationGateTests = protectedEndpoints.Count,
            endpointCountWithoutBehavioralOrAuthenticationTests = report.Count(item => item.coverage == "not tested"),
            endpoints = report
        };

        var repositoryRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
        var outputDirectory = Environment.GetEnvironmentVariable("API_TEST_REPORTS")
            ?? Path.Combine(repositoryRoot, "TestResults");
        Directory.CreateDirectory(outputDirectory);
        await File.WriteAllTextAsync(
            Path.Combine(outputDirectory, "api-endpoint-inventory.json"),
            JsonSerializer.Serialize(coverageReport, new JsonSerializerOptions { WriteIndented = true }));

        Assert.NotEmpty(documented);
        Assert.Equal(runtime.OrderBy(x => x), documented.OrderBy(x => x));
        Assert.NotEmpty(protectedEndpoints);

        foreach (var description in protectedEndpoints)
        {
            var path = ReplaceRouteParameters(description.RelativePath!);
            using var request = new HttpRequestMessage(new HttpMethod(description.HttpMethod!), path);
            if (!HttpMethods.IsGet(description.HttpMethod!) && !HttpMethods.IsHead(description.HttpMethod!))
            {
                request.Content = CreateRequestContent(description);
            }

            using var unauthorizedResponse = await _client.SendAsync(request);
            Assert.True(
                unauthorizedResponse.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
                $"{description.HttpMethod} /{description.RelativePath} allowed an unauthenticated request: {(int)unauthorizedResponse.StatusCode}");
        }
    }

    private static bool IsProtected(ApiDescription description)
    {
        var metadata = description.ActionDescriptor.EndpointMetadata;
        return metadata.OfType<IAuthorizeData>().Any() && !metadata.OfType<IAllowAnonymous>().Any();
    }

    private static string ReplaceRouteParameters(string route)
    {
        return System.Text.RegularExpressions.Regex.Replace(
            route.Split('?')[0],
            "\\{[^}:]+(?::[^}]+)?\\}",
            "1");
    }

    private static string NormalizeOpenApiPath(string route)
    {
        var path = route.Split('?')[0].TrimStart('/');
        return "/" + System.Text.RegularExpressions.Regex.Replace(path, "\\{([^}:]+)(?::[^}]+)?\\}", "{$1}");
    }

    private static HttpContent CreateRequestContent(ApiDescription description)
    {
        var mediaType = description.SupportedRequestFormats
            .Select(format => format.MediaType)
            .FirstOrDefault();

        if (mediaType?.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase) == true)
        {
            return new MultipartFormDataContent();
        }

        if (mediaType?.StartsWith("application/x-www-form-urlencoded", StringComparison.OrdinalIgnoreCase) == true)
        {
            return new FormUrlEncodedContent(Array.Empty<KeyValuePair<string, string>>());
        }

        return new StringContent("{}", System.Text.Encoding.UTF8, mediaType ?? "application/json");
    }
}
