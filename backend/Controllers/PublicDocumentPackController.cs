using backend.Controllers.Jamin;
using backend.Data;
using backend.DTOs.Common;
using backend.DTOs.Jamin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

/// <summary>
/// Public (no login) view of a document pack shared with a customer. Access is by an unguessable
/// token only, the link expires with the share, and every open is recorded for the sales team.
/// </summary>
[ApiController]
[Route("api/public/document-pack")]
[AllowAnonymous]
public class PublicDocumentPackController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    public PublicDocumentPackController(ApplicationDbContext db) => _db = db;

    [HttpGet("{token}")]
    public async Task<IActionResult> GetPack(string token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length < 32 || token.Length > 64)
            return NotFound(ApiResponse<PublicDocumentPackDto>.FailureResult("This document link is invalid."));

        var share = await _db.PlotDocumentShares.Include(s => s.Plot).FirstOrDefaultAsync(s => s.Token == token, ct);
        if (share == null || share.Plot == null)
            return NotFound(ApiResponse<PublicDocumentPackDto>.FailureResult("This document link is invalid."));
        if (share.Status == "Revoked")
            return StatusCode(StatusCodes.Status410Gone, ApiResponse<PublicDocumentPackDto>.FailureResult("This document link has been withdrawn. Please contact your sales executive."));
        var now = DateTime.UtcNow;
        if (share.ExpiresAt <= now)
            return StatusCode(StatusCodes.Status410Gone, ApiResponse<PublicDocumentPackDto>.FailureResult("This document link has expired. Please ask your sales executive for a new link."));

        // Track the open for the sales team.
        share.FirstViewedAt ??= now;
        share.LastViewedAt = now;
        share.ViewCount += 1;
        if (share.Status == "Shared") share.Status = "Viewed";
        await _db.SaveChangesAsync(ct);

        var plot = share.Plot;
        var project = await _db.JaminProjects.AsNoTracking().FirstOrDefaultAsync(p => p.Id == plot.ProjectId, ct);
        var company = await _db.Tenants.AsNoTracking().Where(t => t.Id == share.CompanyId).Select(t => t.Name).FirstOrDefaultAsync(ct);

        var sharedIds = JaminDocumentSharesController.ParseIds(share.DocumentIdsJson).ToHashSet();
        var allDocs = await JaminDocumentSharesController.LoadPackDocumentsAsync(_db, plot, ct);

        PublicCostSheetDto? cost = null;
        if (share.IncludeCostSheet)
        {
            // Indicative only — stamp duty / registration are computed on the guideline value at registration.
            var stamp = Math.Round(plot.Price * 0.07m, 0);
            var reg = Math.Round(plot.Price * 0.02m, 0);
            cost = new PublicCostSheetDto
            {
                PlotPrice = plot.Price,
                PricePerSqft = plot.PricePerSqft > 0 ? plot.PricePerSqft : (plot.AreaSqFt > 0 ? Math.Round(plot.Price / plot.AreaSqFt, 0) : 0),
                AreaSqFt = plot.AreaSqFt,
                StampDutyEstimate = stamp,
                RegistrationFeeEstimate = reg,
                TotalEstimate = plot.Price + stamp + reg,
                Note = "Indicative estimate. Stamp duty (7%) and registration fee (2%) are finally calculated on the government guideline value at the time of registration."
            };
        }

        var dto = new PublicDocumentPackDto
        {
            CompanyName = string.IsNullOrWhiteSpace(company) ? "Jamin Bazaar" : company!,
            RecipientName = share.RecipientName,
            ProjectName = project?.Name ?? string.Empty,
            ProjectLocation = project?.Location ?? string.Empty,
            PlotNumber = plot.PlotNumber,
            Dimensions = plot.Dimensions,
            AreaSqFt = plot.AreaSqFt,
            Facing = plot.Facing,
            PlotStatus = plot.Status,
            HoldExpiresAt = plot.Status == "Hold" ? plot.HoldExpiresAt : null,
            SharedByName = share.SharedByName,
            SharedAt = share.SharedAt,
            ExpiresAt = share.ExpiresAt,
            Message = share.Message,
            CostSheet = cost,
            Documents = allDocs.Where(d => sharedIds.Contains(d.Id)).ToList(),
        };
        return Ok(ApiResponse<PublicDocumentPackDto>.SuccessResult(dto));
    }
}
