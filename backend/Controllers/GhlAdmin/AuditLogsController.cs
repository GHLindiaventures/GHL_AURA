using backend.Authentication.Interfaces;
using backend.Data;
using backend.DTOs.AuditLogs;
using backend.DTOs.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using backend.Models.Entities;

namespace backend.Controllers.GhlAdmin;

/// <summary>
/// Platform-wide Audit Logs API.
/// Company Admins see their own tenant's logs.
/// Super Admins see all tenants (can filter by companyId).
/// Audit logs are read-only — they are written internally by other services.
/// </summary>
[ApiController]
[Route("api/audit-logs")]
[Authorize]
public class AuditLogsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly ICurrentUserService _currentUser;

    public AuditLogsController(ApplicationDbContext db, ICurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    // ── GET /api/audit-logs ───────────────────────────────────────────────────
    [HttpGet]
    [Authorize(Roles = "company_admin,super_admin,admin,ghl_admin")]
    public async Task<ActionResult<ApiResponse<PagedResult<AuditLogResponseDto>>>> GetAuditLogs(
        [FromQuery] string? companyId,
        [FromQuery] string? entityType,
        [FromQuery] string? action,
        [FromQuery] string? module,
        [FromQuery] string? search,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var query = _db.AuditLogs.Include(l => l.Company).AsNoTracking().AsQueryable();

        // Super admins can see everything; company admins scoped to their tenant
        if (_currentUser.Role != "super_admin" && _currentUser.CompanyId.HasValue)
        {
            query = query.Where(l => l.CompanyId == _currentUser.CompanyId.Value);
        }
        else if (_currentUser.Role == "super_admin" && !string.IsNullOrWhiteSpace(companyId) && !companyId.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            if (companyId.Equals("global", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(l => l.CompanyId == null);
            }
            else if (int.TryParse(companyId, out var cid))
            {
                query = query.Where(l => l.CompanyId == cid);
            }
            else
            {
                var s = companyId.Trim().ToLowerInvariant();
                query = query.Where(l => l.Company != null && (l.Company.Slug.ToLower() == s || l.Company.Name.ToLower().Contains(s)));
            }
        }

        if (!string.IsNullOrWhiteSpace(entityType))
            query = query.Where(l => l.EntityType == entityType);

        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(l => l.Action == action);

        if (!string.IsNullOrWhiteSpace(module))
            query = query.Where(l => l.Module == module);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(l =>
                l.ActorName.ToLower().Contains(s) ||
                l.ActorEmail.ToLower().Contains(s) ||
                l.Details.ToLower().Contains(s) ||
                l.EntityId.Contains(s) ||
                (l.Company != null && l.Company.Name.ToLower().Contains(s)));
        }

        if (from.HasValue)
            query = query.Where(l => l.Timestamp >= from.Value.ToUniversalTime());

        if (to.HasValue)
            query = query.Where(l => l.Timestamp <= to.Value.ToUniversalTime());

        var total = await query.CountAsync(ct);
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var items = await query
            .OrderByDescending(l => l.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(l => new AuditLogResponseDto
            {
                Id = l.Id,
                CompanyId = l.CompanyId,
                CompanyName = l.Company != null ? l.Company.Name : (l.CompanyId == null ? "PLATFORM CONSOLE" : $"Company #{l.CompanyId}"),
                Timestamp = l.Timestamp,
                ActorName = l.ActorName,
                ActorEmail = l.ActorEmail,
                Action = l.Action,
                EntityType = l.EntityType,
                EntityId = l.EntityId,
                Details = l.Details,
                IpAddress = l.IpAddress,
                UserAgent = l.UserAgent,
                Module = l.Module,
                Status = l.Status,
            })
            .ToListAsync(ct);

        // Resolve actor identities if stored as placeholder IDs (e.g. "IRM (ID: 5)") or if email/name is missing
        var userIdsToFetch = new HashSet<int>();
        var userEmailsToFetch = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item.ActorEmail) || (!string.IsNullOrWhiteSpace(item.ActorName) && item.ActorName.Contains("(ID:")))
            {
                var match = System.Text.RegularExpressions.Regex.Match(item.ActorName ?? string.Empty, @"\(ID:\s*(\d+)\)");
                if (match.Success && int.TryParse(match.Groups[1].Value, out var uid))
                {
                    userIdsToFetch.Add(uid);
                }
            }
            if (!string.IsNullOrWhiteSpace(item.ActorEmail))
            {
                userEmailsToFetch.Add(item.ActorEmail.Trim());
            }
        }

        var usersById = new Dictionary<int, (string Name, string Email)>();
        if (userIdsToFetch.Count > 0)
        {
            var userList = await _db.Users
                .Where(u => userIdsToFetch.Contains(u.Id))
                .Select(u => new { u.Id, u.Name, u.Email })
                .ToListAsync(ct);
            foreach (var u in userList)
            {
                usersById[u.Id] = (u.Name, u.Email);
            }
        }

        var usersByEmail = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (userEmailsToFetch.Count > 0)
        {
            var emailList = await _db.Users
                .Where(u => userEmailsToFetch.Contains(u.Email))
                .Select(u => new { u.Name, u.Email })
                .ToListAsync(ct);
            foreach (var u in emailList)
            {
                if (!string.IsNullOrWhiteSpace(u.Email) && !string.IsNullOrWhiteSpace(u.Name))
                {
                    usersByEmail[u.Email] = u.Name;
                }
            }
        }

        foreach (var item in items)
        {
            var match = System.Text.RegularExpressions.Regex.Match(item.ActorName ?? string.Empty, @"\(ID:\s*(\d+)\)");
            if (match.Success && int.TryParse(match.Groups[1].Value, out var uid) && usersById.TryGetValue(uid, out var uById))
            {
                item.ActorName = !string.IsNullOrWhiteSpace(uById.Name) ? uById.Name : uById.Email;
                if (string.IsNullOrWhiteSpace(item.ActorEmail))
                {
                    item.ActorEmail = uById.Email;
                }
            }
            else if (!string.IsNullOrWhiteSpace(item.ActorEmail) && (string.IsNullOrWhiteSpace(item.ActorName) || item.ActorName == item.ActorEmail))
            {
                if (usersByEmail.TryGetValue(item.ActorEmail, out var resolvedName) && !string.IsNullOrWhiteSpace(resolvedName))
                {
                    item.ActorName = resolvedName;
                }
            }
            else if (string.IsNullOrWhiteSpace(item.ActorEmail) && !string.IsNullOrWhiteSpace(item.ActorName) && item.ActorName.Contains("@"))
            {
                item.ActorEmail = item.ActorName;
            }
        }

        // Resolve Target Entity Names so Admin knows who the target person is
        var leadIdsToFetch = new HashSet<int>();
        var kycIdsToFetch = new HashSet<int>();
        var customerIdsToFetch = new HashSet<int>();
        var investorIdsToFetch = new HashSet<int>();
        var followupIdsToFetch = new HashSet<int>();
        var callIdsToFetch = new HashSet<int>();
        var consultationIdsToFetch = new HashSet<int>();
        var leaveIdsToFetch = new HashSet<int>();
        var handoverIdsToFetch = new HashSet<int>();
        var dealIdsToFetch = new HashSet<int>();
        var targetUserIdsToFetch = new HashSet<int>();

        foreach (var item in items)
        {
            if (int.TryParse(item.EntityId, out var eid) && eid > 0)
            {
                var et = (item.EntityType ?? string.Empty).Trim().ToLowerInvariant();
                if (et == "lead" || et == "leads") leadIdsToFetch.Add(eid);
                else if (et == "investorkyc" || et == "kyc") kycIdsToFetch.Add(eid);
                else if (et == "customer" || et == "customers") customerIdsToFetch.Add(eid);
                else if (et == "investor" || et == "investors" || et == "ghlinvestor") investorIdsToFetch.Add(eid);
                else if (et == "followup" || et == "followups") followupIdsToFetch.Add(eid);
                else if (et == "callrecord" || et == "call" || et == "callrecords") callIdsToFetch.Add(eid);
                else if (et == "consultation" || et == "consultations") consultationIdsToFetch.Add(eid);
                else if (et == "leaverequest" || et == "leave" || et == "leaverequests") leaveIdsToFetch.Add(eid);
                else if (et == "workhandover" || et == "handover" || et == "workhandovers") handoverIdsToFetch.Add(eid);
                else if (et == "ghldeal" || et == "deal" || et == "deals" || et == "opportunity") dealIdsToFetch.Add(eid);
                else if (et == "user" || et == "users") targetUserIdsToFetch.Add(eid);
            }
        }

        var leadNames = leadIdsToFetch.Count > 0
            ? await _db.Leads.AsNoTracking().Where(l => leadIdsToFetch.Contains(l.Id)).Select(l => new { l.Id, l.Name }).ToDictionaryAsync(l => l.Id, l => l.Name, ct)
            : new Dictionary<int, string>();

        var kycNames = kycIdsToFetch.Count > 0
            ? await _db.InvestorKycs.AsNoTracking().Where(k => kycIdsToFetch.Contains(k.Id)).Select(k => new { k.Id, k.InvestorName }).ToDictionaryAsync(k => k.Id, k => k.InvestorName, ct)
            : new Dictionary<int, string>();

        var customerNames = customerIdsToFetch.Count > 0
            ? await _db.Customers.AsNoTracking().Where(c => customerIdsToFetch.Contains(c.Id)).Select(c => new { c.Id, c.Name }).ToDictionaryAsync(c => c.Id, c => c.Name, ct)
            : new Dictionary<int, string>();

        var investorNames = investorIdsToFetch.Count > 0
            ? await _db.Investors.AsNoTracking().Where(i => investorIdsToFetch.Contains(i.Id)).Select(i => new { i.Id, i.Name }).ToDictionaryAsync(i => i.Id, i => i.Name, ct)
            : new Dictionary<int, string>();

        var followupNames = followupIdsToFetch.Count > 0
            ? await _db.Followups.AsNoTracking().Where(f => followupIdsToFetch.Contains(f.Id)).Select(f => new { f.Id, f.ContactName }).ToDictionaryAsync(f => f.Id, f => f.ContactName, ct)
            : new Dictionary<int, string>();

        var callNames = callIdsToFetch.Count > 0
            ? await _db.CallRecords.AsNoTracking().Where(c => callIdsToFetch.Contains(c.Id)).Select(c => new { c.Id, c.ContactName }).ToDictionaryAsync(c => c.Id, c => c.ContactName, ct)
            : new Dictionary<int, string>();

        var consultationNames = consultationIdsToFetch.Count > 0
            ? await _db.Consultations.AsNoTracking().Where(c => consultationIdsToFetch.Contains(c.Id)).Select(c => new { c.Id, Name = c.InvestorName }).ToDictionaryAsync(c => c.Id, c => c.Name, ct)
            : new Dictionary<int, string>();

        var leaveNames = leaveIdsToFetch.Count > 0
            ? await _db.LeaveRequests.AsNoTracking().Include(l => l.User).Where(l => leaveIdsToFetch.Contains(l.Id)).Select(l => new { l.Id, UserName = l.User != null ? l.User.Name : $"User #{l.UserId}" }).ToDictionaryAsync(l => l.Id, l => l.UserName, ct)
            : new Dictionary<int, string>();

        var handoverNames = handoverIdsToFetch.Count > 0
            ? await _db.WorkHandovers.AsNoTracking().Include(h => h.OriginalUser).Include(h => h.CoveringUser).Where(h => handoverIdsToFetch.Contains(h.Id)).Select(h => new { h.Id, Name = $"{(h.OriginalUser != null ? h.OriginalUser.Name : "User #" + h.OriginalUserId)} -> {(h.CoveringUser != null ? h.CoveringUser.Name : "User #" + h.CoveringUserId)}" }).ToDictionaryAsync(h => h.Id, h => h.Name, ct)
            : new Dictionary<int, string>();

        var dealNames = dealIdsToFetch.Count > 0
            ? await _db.GhlDeals.AsNoTracking().Where(d => dealIdsToFetch.Contains(d.Id)).Select(d => new { d.Id, Name = !string.IsNullOrWhiteSpace(d.CustomerName) ? d.CustomerName : d.Title }).ToDictionaryAsync(d => d.Id, d => d.Name, ct)
            : new Dictionary<int, string>();

        var targetUserNames = targetUserIdsToFetch.Count > 0
            ? await _db.Users.AsNoTracking().Where(u => targetUserIdsToFetch.Contains(u.Id)).Select(u => new { u.Id, u.Name }).ToDictionaryAsync(u => u.Id, u => u.Name, ct)
            : new Dictionary<int, string>();

        foreach (var item in items)
        {
            if (int.TryParse(item.EntityId, out var eid) && eid > 0)
            {
                var et = (item.EntityType ?? string.Empty).Trim().ToLowerInvariant();
                if ((et == "lead" || et == "leads") && leadNames.TryGetValue(eid, out var ln)) item.EntityName = ln;
                else if ((et == "investorkyc" || et == "kyc") && kycNames.TryGetValue(eid, out var kn)) item.EntityName = kn;
                else if ((et == "customer" || et == "customers") && customerNames.TryGetValue(eid, out var cn)) item.EntityName = cn;
                else if ((et == "investor" || et == "investors" || et == "ghlinvestor") && investorNames.TryGetValue(eid, out var iname)) item.EntityName = iname;
                else if ((et == "followup" || et == "followups") && followupNames.TryGetValue(eid, out var fn)) item.EntityName = fn;
                else if ((et == "callrecord" || et == "call" || et == "callrecords") && callNames.TryGetValue(eid, out var crn)) item.EntityName = crn;
                else if ((et == "consultation" || et == "consultations") && consultationNames.TryGetValue(eid, out var csn)) item.EntityName = csn;
                else if ((et == "leaverequest" || et == "leave" || et == "leaverequests") && leaveNames.TryGetValue(eid, out var lrn)) item.EntityName = lrn;
                else if ((et == "workhandover" || et == "handover" || et == "workhandovers") && handoverNames.TryGetValue(eid, out var hon)) item.EntityName = hon;
                else if ((et == "ghldeal" || et == "deal" || et == "deals" || et == "opportunity") && dealNames.TryGetValue(eid, out var dn)) item.EntityName = dn;
                else if ((et == "user" || et == "users") && targetUserNames.TryGetValue(eid, out var un)) item.EntityName = un;
            }

            if (string.IsNullOrWhiteSpace(item.EntityName))
            {
                item.EntityName = ExtractPersonNameFromDetails(item.Details);
            }
        }

        return Ok(ApiResponse<PagedResult<AuditLogResponseDto>>.SuccessResult(
            PagedResult<AuditLogResponseDto>.Create(items, total, page, pageSize),
            "Audit logs retrieved."));
    }

    private static string? ExtractPersonNameFromDetails(string? details)
    {
        if (string.IsNullOrWhiteSpace(details)) return null;

        var m = System.Text.RegularExpressions.Regex.Match(details, @"for investor ['""]([^'""]+)['""]", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (m.Success && !string.IsNullOrWhiteSpace(m.Groups[1].Value)) return m.Groups[1].Value.Trim();

        m = System.Text.RegularExpressions.Regex.Match(details, @"corrected for\s+([A-Za-z0-9_ -]+?)(?:\s*\.|\s*,|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (m.Success && !string.IsNullOrWhiteSpace(m.Groups[1].Value)) return m.Groups[1].Value.Trim();

        m = System.Text.RegularExpressions.Regex.Match(details, @"(?:assigned|created|updated)\s+lead ['""]([^'""]+)['""]", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (m.Success && !string.IsNullOrWhiteSpace(m.Groups[1].Value)) return m.Groups[1].Value.Trim();

        m = System.Text.RegularExpressions.Regex.Match(details, @"lead record\s+([^(]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (m.Success && !string.IsNullOrWhiteSpace(m.Groups[1].Value)) return m.Groups[1].Value.Trim();

        m = System.Text.RegularExpressions.Regex.Match(details, @"(?:investor|contact)\s+['""]([^'""]+)['""]", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (m.Success && !string.IsNullOrWhiteSpace(m.Groups[1].Value)) return m.Groups[1].Value.Trim();

        m = System.Text.RegularExpressions.Regex.Match(details, @"leave request (?:for|by|from)\s+([A-Za-z0-9_ -]+?)(?:\s*\(|\.|\s*,|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (m.Success && !string.IsNullOrWhiteSpace(m.Groups[1].Value)) return m.Groups[1].Value.Trim();

        m = System.Text.RegularExpressions.Regex.Match(details, @"handover from\s+([A-Za-z0-9_ -]+?)\s+to", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (m.Success && !string.IsNullOrWhiteSpace(m.Groups[1].Value)) return m.Groups[1].Value.Trim();

        return null;
    }

    // ── POST /api/audit-logs ──────────────────────────────────────────────────
    [HttpPost]
    [Authorize(Roles = "sales_executive,irm,company_admin,super_admin,admin,ghl_admin")]
    public async Task<ActionResult<ApiResponse<AuditLogResponseDto>>> CreateAuditLog(
        [FromBody] CreateAuditLogRequestDto dto,
        CancellationToken ct = default)
    {
        var callerId = _currentUser.UserId;
        var companyId = _currentUser.CompanyId;

        User? callerUser = null;
        if (callerId.HasValue && callerId.Value > 0)
        {
            callerUser = await _db.Users.Include(u => u.Company).FirstOrDefaultAsync(u => u.Id == callerId.Value, ct);
        }

        int finalCompanyId = companyId ?? callerUser?.CompanyId ?? 1;
        var actorName = callerUser?.Name ?? User.FindFirst("name")?.Value ?? "User";
        var actorEmail = callerUser?.Email ?? _currentUser.Email ?? "user@ghl.com";

        var log = new AuditLog
        {
            CompanyId = finalCompanyId,
            Timestamp = DateTime.UtcNow,
            ActorName = actorName,
            ActorEmail = actorEmail,
            Action = string.IsNullOrWhiteSpace(dto.Action) ? "ACTIVITY" : dto.Action.Trim(),
            EntityType = string.IsNullOrWhiteSpace(dto.EntityType) ? "General" : dto.EntityType.Trim(),
            EntityId = dto.EntityId ?? string.Empty,
            LeadId = dto.LeadId,
            CustomerId = dto.CustomerId,
            Details = dto.Details ?? string.Empty,
            Module = dto.Module,
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = Request.Headers["User-Agent"].ToString(),
            Status = dto.Status ?? "success"
        };

        _db.AuditLogs.Add(log);
        await _db.SaveChangesAsync(ct);

        string? resolvedEntityName = dto.EntityName;
        if (string.IsNullOrWhiteSpace(resolvedEntityName) && dto.LeadId.HasValue && dto.LeadId.Value > 0)
        {
            var l = await _db.Leads.AsNoTracking().FirstOrDefaultAsync(x => x.Id == dto.LeadId.Value, ct);
            resolvedEntityName = l?.Name;
        }
        else if (string.IsNullOrWhiteSpace(resolvedEntityName) && dto.CustomerId.HasValue && dto.CustomerId.Value > 0)
        {
            var c = await _db.Customers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == dto.CustomerId.Value, ct);
            resolvedEntityName = c?.Name;
        }
        if (string.IsNullOrWhiteSpace(resolvedEntityName))
        {
            resolvedEntityName = ExtractPersonNameFromDetails(dto.Details);
        }

        return Ok(ApiResponse<AuditLogResponseDto>.SuccessResult(new AuditLogResponseDto
        {
            Id = log.Id,
            CompanyId = log.CompanyId,
            CompanyName = callerUser?.Company?.Name ?? "GHL India Ventures",
            Timestamp = log.Timestamp,
            ActorName = log.ActorName,
            ActorEmail = log.ActorEmail,
            Action = log.Action,
            EntityType = log.EntityType,
            EntityId = log.EntityId,
            EntityName = resolvedEntityName,
            Details = log.Details,
            IpAddress = log.IpAddress,
            UserAgent = log.UserAgent,
            Module = log.Module,
            Status = log.Status
        }, "Audit log recorded successfully."));
    }
}

