using System.Security.Claims;
using backend.DTOs.Common;
using backend.DTOs.Irm;
using backend.Extensions;
using backend.Repositories.Interfaces;
using backend.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers.Irm;

[ApiController]
[Route("api/irm/pipeline")]
[Authorize]
public class IrmPipelineController : ControllerBase
{
    private readonly IIrmPipelineService _pipelineService;
    private readonly IIrmPipelineRepository _pipelineRepo;
    private readonly backend.Data.ApplicationDbContext _db;

    public IrmPipelineController(IIrmPipelineService pipelineService, backend.Data.ApplicationDbContext db, IIrmPipelineRepository? pipelineRepo = null)
    {
        _pipelineService = pipelineService;
        _db = db;
        _pipelineRepo = pipelineRepo!;
    }

    [HttpGet]
    public async Task<IActionResult> GetBoard([FromQuery] int? irmId, CancellationToken ct)
    {
        var companyId = User.GetCompanyId();
        var role = (User.FindFirstValue(ClaimTypes.Role) ?? User.FindFirstValue("role") ?? "").ToLowerInvariant();
        var isPlatformAdmin = role == "admin" || role == "ghl_admin" || role == "super_admin" || role == "company_admin";
        int? effectiveIrmId = isPlatformAdmin ? irmId : User.GetUserId();

        var result = await _pipelineService.GetBoardAsync(companyId, effectiveIrmId, ct);
        return Ok(result);
    }

    [HttpPut("{cardId:int}/move")]
    public async Task<IActionResult> MoveStage(int cardId, [FromBody] MoveIrmStageDto dto, CancellationToken ct)
    {
        if (User.IsGhlAdmin())
        {
            return StatusCode(StatusCodes.Status403Forbidden, ApiResponse<string>.ErrorResponse("Access denied: GHL Admin has read-only access to IRM pipeline data."));
        }

        var role = (User.FindFirstValue(ClaimTypes.Role) ?? User.FindFirstValue("role") ?? "").ToLowerInvariant();
        var isPlatformAdmin = role == "admin" || role == "ghl_admin" || role == "super_admin" || role == "company_admin";
        var companyId = User.GetCompanyId();
        var irmId = User.GetUserId();

        if (!isPlatformAdmin && _pipelineRepo != null)
        {
            var card = await _pipelineRepo.GetByIdAsync(cardId, companyId, ct);
            if (card != null && card.AssignedIrmId > 0 && card.AssignedIrmId != irmId)
            {
                return StatusCode(StatusCodes.Status403Forbidden, ApiResponse<string>.ErrorResponse("Access denied: You can only move pipeline cards assigned to you."));
            }
        }

        var result = await _pipelineService.MoveStageAsync(cardId, companyId, irmId, dto, ct);
        if (!result.Success)
            return BadRequest(result);

        var actorName = User.FindFirst(ClaimTypes.Name)?.Value ?? User.FindFirst("name")?.Value ?? (irmId > 0 ? $"IRM #{irmId}" : "IRM");
        var actorEmail = User.FindFirst(ClaimTypes.Email)?.Value ?? User.FindFirst("email")?.Value ?? "irm@ghl.com";
        _db.AuditLogs.Add(new backend.Models.Entities.AuditLog
        {
            CompanyId = companyId,
            Timestamp = DateTime.UtcNow,
            ActorName = actorName,
            ActorEmail = actorEmail,
            Action = "STAGE_CHANGE",
            EntityType = "Deal",
            EntityId = cardId.ToString(),
            CustomerId = result.Data?.InvestorId,
            Module = "Opportunities",
            Details = $"IRM {actorName} moved investor '{result.Data?.InvestorName}' to stage '{dto.TargetStageId}' in Pipeline.",
            Status = "success"
        });
        await _db.SaveChangesAsync(ct);

        return Ok(result);
    }
}
