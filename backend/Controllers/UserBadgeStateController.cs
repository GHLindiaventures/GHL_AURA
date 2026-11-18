using System.Text.Json;
using backend.Authentication.Interfaces;
using backend.Data;
using backend.DTOs.Common;
using backend.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

public class RouteBadgeStateDto
{
    public List<string> SeenIds { get; set; } = new();
    public long LastSeenTime { get; set; }
}

public class UpdateBadgeStateRequest
{
    public string? Route { get; set; }
    public List<string>? SeenIds { get; set; }
    public long? LastSeenTime { get; set; }
    public Dictionary<string, RouteBadgeStateDto>? Routes { get; set; }
}

[ApiController]
[Route("api/user/badge-state")]
[Authorize]
public class UserBadgeStateController : ControllerBase
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public UserBadgeStateController(
        ApplicationDbContext dbContext,
        ICurrentUserService currentUserService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
    }

    private static string GetStorageKey(int userId, int? companyId)
    {
        var cid = companyId ?? 0;
        return $"user_badge_state_{cid}_{userId}";
    }

    [HttpGet]
    public async Task<IActionResult> GetBadgeState(CancellationToken ct)
    {
        var userId = _currentUserService.UserId;
        if (!userId.HasValue) return Unauthorized();

        var companyId = _currentUserService.CompanyId;
        var key = GetStorageKey(userId.Value, companyId);

        var setting = await _dbContext.PlatformSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Key == key, ct);

        if (setting == null || string.IsNullOrWhiteSpace(setting.Value))
        {
            return Ok(ApiResponse<Dictionary<string, RouteBadgeStateDto>>.SuccessResult(new Dictionary<string, RouteBadgeStateDto>()));
        }

        try
        {
            var data = JsonSerializer.Deserialize<Dictionary<string, RouteBadgeStateDto>>(setting.Value, _jsonOptions)
                       ?? new Dictionary<string, RouteBadgeStateDto>();
            return Ok(ApiResponse<Dictionary<string, RouteBadgeStateDto>>.SuccessResult(data));
        }
        catch
        {
            return Ok(ApiResponse<Dictionary<string, RouteBadgeStateDto>>.SuccessResult(new Dictionary<string, RouteBadgeStateDto>()));
        }
    }

    [HttpPost]
    public async Task<IActionResult> UpdateBadgeState([FromBody] UpdateBadgeStateRequest request, CancellationToken ct)
    {
        var userId = _currentUserService.UserId;
        if (!userId.HasValue) return Unauthorized();

        var companyId = _currentUserService.CompanyId;
        var key = GetStorageKey(userId.Value, companyId);

        var setting = await _dbContext.PlatformSettings
            .FirstOrDefaultAsync(s => s.Key == key, ct);

        Dictionary<string, RouteBadgeStateDto> data;
        if (setting == null)
        {
            data = new Dictionary<string, RouteBadgeStateDto>(StringComparer.OrdinalIgnoreCase);
            setting = new PlatformSetting
            {
                Key = key,
                Description = $"User badge seen state for user {userId.Value}",
                UpdatedAt = DateTime.UtcNow,
                UpdatedBy = _currentUserService.Email ?? $"User {userId.Value}"
            };
            _dbContext.PlatformSettings.Add(setting);
        }
        else
        {
            try
            {
                data = JsonSerializer.Deserialize<Dictionary<string, RouteBadgeStateDto>>(setting.Value, _jsonOptions)
                       ?? new Dictionary<string, RouteBadgeStateDto>(StringComparer.OrdinalIgnoreCase);
            }
            catch
            {
                data = new Dictionary<string, RouteBadgeStateDto>(StringComparer.OrdinalIgnoreCase);
            }
        }

        if (request.Routes != null)
        {
            foreach (var (routeKey, routeState) in request.Routes)
            {
                MergeRoute(data, routeKey, routeState.SeenIds, routeState.LastSeenTime);
            }
        }

        if (!string.IsNullOrWhiteSpace(request.Route))
        {
            MergeRoute(data, request.Route, request.SeenIds, request.LastSeenTime ?? 0);
        }

        setting.Value = JsonSerializer.Serialize(data, _jsonOptions);
        setting.UpdatedAt = DateTime.UtcNow;
        setting.UpdatedBy = _currentUserService.Email ?? $"User {userId.Value}";

        await _dbContext.SaveChangesAsync(ct);

        return Ok(ApiResponse<Dictionary<string, RouteBadgeStateDto>>.SuccessResult(data));
    }

    private static void MergeRoute(Dictionary<string, RouteBadgeStateDto> data, string route, List<string>? seenIds, long lastSeenTime)
    {
        var normRoute = route.Trim().ToLowerInvariant();
        if (!data.TryGetValue(normRoute, out var existing))
        {
            existing = new RouteBadgeStateDto();
            data[normRoute] = existing;
        }

        if (seenIds != null && seenIds.Count > 0)
        {
            var set = new HashSet<string>(existing.SeenIds, StringComparer.OrdinalIgnoreCase);
            foreach (var id in seenIds)
            {
                if (!string.IsNullOrWhiteSpace(id)) set.Add(id.Trim());
            }
            // Keep up to 1000 IDs per route
            existing.SeenIds = set.TakeLast(1000).ToList();
        }

        if (lastSeenTime > existing.LastSeenTime)
        {
            existing.LastSeenTime = lastSeenTime;
        }
    }
}

