using backend.Configuration;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace backend.Tests;

public sealed class ApiApplicationFactory : WebApplicationFactory<Program>
{
    static ApiApplicationFactory()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Testing");
        Environment.SetEnvironmentVariable("UseInMemoryDatabase", "true");
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", "InMemory");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["UseInMemoryDatabase"] = "true",
                ["Database:EnsureCreated"] = "false",
                ["ConnectionStrings:DefaultConnection"] = "InMemory",
                ["JwtSettings:SecretKey"] = "test-only-key-not-used-outside-automated-tests",
                ["JwtSettings:Issuer"] = "GhlAuraApi",
                ["JwtSettings:Audience"] = "GhlAuraClient",
                ["Twilio:AccountSid"] = "",
                ["Twilio:ApiKeySid"] = "",
                ["Twilio:ApiKeySecret"] = "",
                ["Twilio:TwiMLAppSid"] = "",
                ["Twilio:CallerNumber"] = "",
                ["Twilio:AuthToken"] = ""
            });
        });

        builder.ConfigureServices(services =>
        {
            services.PostConfigure<TwilioSettings>(settings =>
            {
                settings.AccountSid = string.Empty;
                settings.ApiKeySid = string.Empty;
                settings.ApiKeySecret = string.Empty;
                settings.TwiMLAppSid = string.Empty;
                settings.CallerNumber = string.Empty;
                settings.AuthToken = string.Empty;
            });
        });
    }
}
