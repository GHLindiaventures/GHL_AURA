using System.Security.Cryptography;
using System.Text.Json;
using backend.Authentication.Interfaces;
using backend.Data;
using backend.DTOs.Common;
using backend.DTOs.Jamin;
using backend.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers.Jamin;

/// <summary>
/// Jamin Bazaar — share a plot's document pack (project legal docs + plot docs + cost sheet) with a
/// customer during a hold, and track the customer's verification (viewed / queries / verified).
/// </summary>
[ApiController]
[Route("api/jamin/document-shares")]
[Authorize]
public class JaminDocumentSharesController : JaminTenantControllerBase
{
    public const string ProjectDocEntityType = "jamin_project";
    public const string PlotDocEntityType = "jamin_plot";

    private static readonly HashSet<string> AllowedStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Shared", "Viewed", "Under Verification", "Queries Raised", "Verified", "Revoked"
    };

    private readonly ApplicationDbContext _db;
    private readonly ICurrentUserService _currentUser;

    public JaminDocumentSharesController(ApplicationDbContext db, ICurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    /// <summary>All documents that can go into a plot's pack: the project's legal docs + the plot's own docs.</summary>
    [HttpGet("pack-documents")]
    public async Task<IActionResult> GetPackDocuments([FromQuery] int plotId, CancellationToken ct)
    {
        var plot = await _db.JaminPlots.AsNoTracking().FirstOrDefaultAsync(p => p.Id == plotId && p.CompanyId == JaminCompanyId, ct);
        if (plot == null) return NotFound(ApiResponse<List<PackDocumentDto>>.FailureResult("Plot not found."));
        var docs = await LoadPackDocumentsAsync(plot, ct);
        return Ok(ApiResponse<List<PackDocumentDto>>.SuccessResult(docs));
    }

    [HttpGet]
    public async Task<IActionResult> GetShares([FromQuery] int? projectId, [FromQuery] int? plotId, [FromQuery] int? leadId, CancellationToken ct)
    {
        var query = _db.PlotDocumentShares.AsNoTracking().Include(s => s.Plot).Where(s => s.CompanyId == JaminCompanyId);
        if (projectId.HasValue) query = query.Where(s => s.ProjectId == projectId.Value);
        if (plotId.HasValue) query = query.Where(s => s.PlotId == plotId.Value);
        if (leadId.HasValue) query = query.Where(s => s.LeadId == leadId.Value);
        var list = await query.OrderByDescending(s => s.SharedAt).Take(500).ToListAsync(ct);
        return Ok(ApiResponse<List<PlotDocumentShareDto>>.SuccessResult(list.Select(ToDto).ToList()));
    }

    [HttpPost]
    public async Task<IActionResult> CreateShare([FromBody] CreatePlotDocumentShareDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.RecipientName) || string.IsNullOrWhiteSpace(dto.RecipientPhone))
            return BadRequest(ApiResponse<PlotDocumentShareDto>.FailureResult("Recipient name and phone are required."));

        var plot = await _db.JaminPlots.FirstOrDefaultAsync(p => p.Id == dto.PlotId && p.CompanyId == JaminCompanyId, ct);
        if (plot == null) return NotFound(ApiResponse<PlotDocumentShareDto>.FailureResult("Plot not found."));

        var available = await LoadPackDocumentsAsync(plot, ct);
        var availableIds = available.Select(d => d.Id).ToHashSet();
        var docIds = (dto.DocumentIds ?? new()).Distinct().Where(availableIds.Contains).ToList();
        if (docIds.Count == 0 && !dto.IncludeCostSheet)
            return BadRequest(ApiResponse<PlotDocumentShareDto>.FailureResult("Select at least one document or include the cost sheet."));

        var now = DateTime.UtcNow;
        DateTime expiresAt;
        if (dto.ExpiresAt.HasValue)
        {
            expiresAt = dto.ExpiresAt.Value.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(dto.ExpiresAt.Value, DateTimeKind.Utc)
                : dto.ExpiresAt.Value.ToUniversalTime();
        }
        else
        {
            expiresAt = plot.Status == "Hold" && plot.HoldExpiresAt.HasValue && plot.HoldExpiresAt.Value > now
                ? plot.HoldExpiresAt.Value
                : now.AddDays(7);
        }
        if (expiresAt <= now.AddMinutes(5)) return BadRequest(ApiResponse<PlotDocumentShareDto>.FailureResult("Link expiry must be in the future."));
        if (expiresAt > now.AddDays(60)) expiresAt = now.AddDays(60);

        var channel = (dto.Channel ?? "link").Trim().ToLowerInvariant();
        if (channel is not ("whatsapp" or "email" or "link")) channel = "link";

        var leadId = dto.LeadId ?? plot.HeldByLeadId;
        var customerId = dto.CustomerId ?? plot.HeldByCustomerId;

        var share = new PlotDocumentShare
        {
            CompanyId = JaminCompanyId,
            PlotId = plot.Id,
            ProjectId = plot.ProjectId,
            LeadId = leadId,
            CustomerId = customerId,
            RecipientName = dto.RecipientName.Trim(),
            RecipientPhone = dto.RecipientPhone.Trim(),
            RecipientEmail = string.IsNullOrWhiteSpace(dto.RecipientEmail) ? null : dto.RecipientEmail.Trim(),
            Channel = channel,
            Token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant(),
            DocumentIdsJson = JsonSerializer.Serialize(docIds),
            IncludeCostSheet = dto.IncludeCostSheet,
            Message = string.IsNullOrWhiteSpace(dto.Message) ? null : dto.Message.Trim(),
            SharedById = _currentUser.UserId,
            SharedByName = _currentUser.Name ?? "Sales Team",
            SharedAt = now,
            ExpiresAt = expiresAt,
            Status = "Shared",
        };
        _db.PlotDocumentShares.Add(share);

        AddAudit("DOCUMENTS_SHARED", share, plot.PlotNumber,
            $"Document pack for {plot.PlotNumber} ({docIds.Count} document(s){(dto.IncludeCostSheet ? " + cost sheet" : "")}) shared with {share.RecipientName} via {channel}. Link valid until {expiresAt:dd MMM yyyy, hh:mm tt} UTC.");

        await _db.SaveChangesAsync(ct);
        share.Plot = plot;
        return Ok(ApiResponse<PlotDocumentShareDto>.SuccessResult(ToDto(share), "Document pack shared."));
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdatePlotDocumentShareStatusDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Status) || !AllowedStatuses.Contains(dto.Status))
            return BadRequest(ApiResponse<PlotDocumentShareDto>.FailureResult("Invalid verification status."));

        var share = await _db.PlotDocumentShares.Include(s => s.Plot).FirstOrDefaultAsync(s => s.Id == id && s.CompanyId == JaminCompanyId, ct);
        if (share == null) return NotFound(ApiResponse<PlotDocumentShareDto>.FailureResult("Share not found."));

        var status = AllowedStatuses.First(s => s.Equals(dto.Status, StringComparison.OrdinalIgnoreCase));
        share.Status = status;
        share.StatusNote = string.IsNullOrWhiteSpace(dto.Note) ? share.StatusNote : dto.Note.Trim();
        share.StatusUpdatedAt = DateTime.UtcNow;
        share.StatusUpdatedByName = _currentUser.Name ?? "Sales Team";

        AddAudit(status == "Revoked" ? "DOCUMENTS_SHARE_REVOKED" : "DOCUMENTS_VERIFICATION_UPDATED", share, share.Plot?.PlotNumber ?? $"Plot #{share.PlotId}",
            $"Document verification for {share.Plot?.PlotNumber} ({share.RecipientName}) set to '{status}'{(string.IsNullOrWhiteSpace(dto.Note) ? "" : $": {dto.Note!.Trim()}")}.");

        await _db.SaveChangesAsync(ct);
        return Ok(ApiResponse<PlotDocumentShareDto>.SuccessResult(ToDto(share), "Verification status updated."));
    }

    /// <summary>Delete a share sent by mistake (admins only). The link stops working immediately.</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "company_admin,super_admin,admin")]
    public async Task<IActionResult> DeleteShare(int id, CancellationToken ct)
    {
        var share = await _db.PlotDocumentShares.Include(s => s.Plot).FirstOrDefaultAsync(s => s.Id == id && s.CompanyId == JaminCompanyId, ct);
        if (share == null) return NotFound(ApiResponse<object>.FailureResult("Share not found."));
        AddAudit("DOCUMENTS_SHARE_DELETED", share, share.Plot?.PlotNumber ?? $"Plot #{share.PlotId}",
            $"Document share for {share.Plot?.PlotNumber} ({share.RecipientName}) was deleted.");
        _db.PlotDocumentShares.Remove(share);
        await _db.SaveChangesAsync(ct);
        return Ok(ApiResponse<object>.SuccessResult(new { }, "Share deleted."));
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private void AddAudit(string action, PlotDocumentShare share, string plotNumber, string details)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            CompanyId = JaminCompanyId,
            Timestamp = DateTime.UtcNow,
            ActorName = _currentUser.Name ?? "Sales Team",
            ActorEmail = _currentUser.Email ?? string.Empty,
            Action = action,
            EntityType = "Plot",
            EntityId = share.PlotId.ToString(),
            LeadId = share.LeadId,
            Module = "Plots",
            Details = details,
            Status = "success"
        });
    }

    private async Task<List<PackDocumentDto>> LoadPackDocumentsAsync(JaminPlot plot, CancellationToken ct)
        => await LoadPackDocumentsAsync(_db, plot, ct);

    internal static async Task<List<PackDocumentDto>> LoadPackDocumentsAsync(ApplicationDbContext db, JaminPlot plot, CancellationToken ct)
    {
        var projectKey = plot.ProjectId.ToString();
        var plotKey = plot.Id.ToString();
        var docs = await db.Documents.AsNoTracking()
            .Where(d => (d.EntityType == ProjectDocEntityType && d.EntityId == projectKey) ||
                        (d.EntityType == PlotDocEntityType && d.EntityId == plotKey))
            .OrderBy(d => d.EntityType).ThenBy(d => d.Category).ThenByDescending(d => d.UploadedAt)
            .ToListAsync(ct);

        return docs.Select(d => new PackDocumentDto
        {
            Id = d.Id,
            Name = d.Name,
            Category = d.Category,
            Size = d.Size,
            Scope = d.EntityType == PlotDocEntityType ? "plot" : "project",
            FileUrl = ToRelativeUrl(d.FileUrl),
            UploadedAt = d.UploadedAt.ToString("dd MMM yyyy"),
        }).ToList();
    }

    /// <summary>Uploaded files are stored with an absolute URL of whichever host received the upload; serve them relative.</summary>
    internal static string? ToRelativeUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return url;
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.AbsolutePath.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase))
            return uri.AbsolutePath;
        return url;
    }

    internal static List<int> ParseIds(string json)
    {
        try { return JsonSerializer.Deserialize<List<int>>(json) ?? new(); }
        catch { return new(); }
    }

    private static PlotDocumentShareDto ToDto(PlotDocumentShare s)
    {
        var ids = ParseIds(s.DocumentIdsJson);
        return new PlotDocumentShareDto
        {
            Id = s.Id,
            PlotId = s.PlotId,
            PlotNumber = s.Plot?.PlotNumber ?? $"Plot #{s.PlotId}",
            ProjectId = s.ProjectId,
            LeadId = s.LeadId,
            CustomerId = s.CustomerId,
            RecipientName = s.RecipientName,
            RecipientPhone = s.RecipientPhone,
            RecipientEmail = s.RecipientEmail,
            Channel = s.Channel,
            Token = s.Token,
            SharePath = $"/docs/{s.Token}",
            DocumentIds = ids,
            DocumentCount = ids.Count,
            IncludeCostSheet = s.IncludeCostSheet,
            Message = s.Message,
            SharedByName = s.SharedByName,
            SharedAt = s.SharedAt,
            ExpiresAt = s.ExpiresAt,
            IsExpired = s.ExpiresAt <= DateTime.UtcNow,
            FirstViewedAt = s.FirstViewedAt,
            LastViewedAt = s.LastViewedAt,
            ViewCount = s.ViewCount,
            Status = s.Status,
            StatusNote = s.StatusNote,
            StatusUpdatedAt = s.StatusUpdatedAt,
            StatusUpdatedByName = s.StatusUpdatedByName,
        };
    }
}
