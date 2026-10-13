using System.Text.Json;
using backend.Authentication.Interfaces;
using backend.Data;
using backend.DTOs.Common;
using backend.DTOs.SuperAdmin;
using backend.Models.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers.SuperAdmin;

[ApiController]
[Authorize(Roles = "super_admin")]
[Route("api/super-admin/tickets")]
public class PlatformTicketsController : ControllerBase
{
    private const string TicketsSettingKey = "platform_support_tickets";
    private readonly ApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public PlatformTicketsController(ApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<PlatformTicketDto>>>> GetTickets(
        [FromQuery] string? status,
        [FromQuery] string? priority,
        [FromQuery] string? category,
        [FromQuery] string? search,
        CancellationToken ct = default)
    {
        var tickets = await LoadOrSeedTicketsAsync(ct);

        var query = tickets.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(status) && status.ToLowerInvariant() != "all")
        {
            query = query.Where(t => t.Status.Equals(status.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(priority) && priority.ToLowerInvariant() != "all")
        {
            query = query.Where(t => t.Priority.Equals(priority.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(category) && category.ToLowerInvariant() != "all")
        {
            query = query.Where(t => t.Category.Equals(category.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(t =>
                t.Title.ToLowerInvariant().Contains(term) ||
                t.TicketNumber.ToLowerInvariant().Contains(term) ||
                (t.TenantName != null && t.TenantName.ToLowerInvariant().Contains(term)) ||
                t.Description.ToLowerInvariant().Contains(term));
        }

        var result = query
            .OrderByDescending(t => t.Priority == "critical")
            .ThenByDescending(t => t.Priority == "high")
            .ThenByDescending(t => t.CreatedAt)
            .ToList();

        return Ok(ApiResponse<List<PlatformTicketDto>>.SuccessResult(result, "Platform support tickets retrieved."));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ApiResponse<PlatformTicketDto>>> GetTicketById(string id, CancellationToken ct = default)
    {
        var tickets = await LoadOrSeedTicketsAsync(ct);
        var ticket = tickets.FirstOrDefault(t => t.Id == id || t.TicketNumber == id);
        if (ticket == null)
        {
            return NotFound(ApiResponse<PlatformTicketDto>.FailureResult($"Ticket \"{id}\" not found."));
        }

        return Ok(ApiResponse<PlatformTicketDto>.SuccessResult(ticket));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<PlatformTicketDto>>> CreateTicket(
        [FromBody] CreatePlatformTicketRequestDto req,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(req.Title))
        {
            return BadRequest(ApiResponse<PlatformTicketDto>.FailureResult("Ticket title is required."));
        }

        var tickets = await LoadOrSeedTicketsAsync(ct);
        var nextNum = 1001 + tickets.Count;
        var ticketId = $"tkt-{Guid.NewGuid():N}"[..12];
        var ticketNumber = $"INC-{DateTime.UtcNow.Year}-{nextNum}";

        string? tenantName = null;
        string? tenantSlug = null;
        if (req.TenantId.HasValue)
        {
            var tenant = await _context.Tenants.FindAsync(new object[] { req.TenantId.Value }, ct);
            if (tenant != null)
            {
                tenantName = tenant.Name;
                tenantSlug = tenant.Slug;
            }
        }

        var authorEmail = _currentUser.Email ?? "superadmin@nexusplatform.io";
        var authorName = _currentUser.Email ?? "Super Admin";

        var ticket = new PlatformTicketDto
        {
            Id = ticketId,
            TicketNumber = ticketNumber,
            Title = req.Title.Trim(),
            Description = req.Description?.Trim() ?? string.Empty,
            Category = string.IsNullOrWhiteSpace(req.Category) ? "System Incident" : req.Category.Trim(),
            Priority = string.IsNullOrWhiteSpace(req.Priority) ? "medium" : req.Priority.Trim().ToLowerInvariant(),
            Status = "open",
            TenantId = req.TenantId,
            TenantName = tenantName,
            TenantSlug = tenantSlug,
            ReportedByName = string.IsNullOrWhiteSpace(req.ReportedByName) ? authorName : req.ReportedByName.Trim(),
            ReportedByEmail = string.IsNullOrWhiteSpace(req.ReportedByEmail) ? authorEmail : req.ReportedByEmail.Trim(),
            AssignedToName = string.IsNullOrWhiteSpace(req.AssignedToName) ? "Platform Operations" : req.AssignedToName.Trim(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Timeline = new List<TicketTimelineEventDto>
            {
                new()
                {
                    Id = $"evt-{Guid.NewGuid():N}"[..10],
                    AuthorName = authorName,
                    AuthorEmail = authorEmail,
                    Message = $"Ticket {ticketNumber} created and dispatched to Platform Operations.",
                    Type = "system_alert",
                    CreatedAt = DateTime.UtcNow
                }
            }
        };

        tickets.Insert(0, ticket);
        await SaveTicketsAsync(tickets, ct);

        _context.AuditLogs.Add(new AuditLog
        {
            Action = "ticket_created",
            EntityType = "PlatformTicket",
            EntityId = ticketNumber,
            ActorName = authorName,
            ActorEmail = authorEmail,
            CompanyId = req.TenantId,
            Details = $"Super Admin logged technical incident {ticketNumber}: \"{ticket.Title}\" ({ticket.Priority.ToUpperInvariant()}).",
            Module = "SupportDesk",
            Status = "success",
            Timestamp = DateTime.UtcNow
        });
        await _context.SaveChangesAsync(ct);

        return Ok(ApiResponse<PlatformTicketDto>.SuccessResult(ticket, "Platform support ticket logged successfully."));
    }

    [HttpPut("{id}/status")]
    public async Task<ActionResult<ApiResponse<PlatformTicketDto>>> UpdateStatus(
        string id,
        [FromBody] UpdateTicketStatusRequestDto req,
        CancellationToken ct = default)
    {
        var tickets = await LoadOrSeedTicketsAsync(ct);
        var ticket = tickets.FirstOrDefault(t => t.Id == id || t.TicketNumber == id);
        if (ticket == null)
        {
            return NotFound(ApiResponse<PlatformTicketDto>.FailureResult($"Ticket \"{id}\" not found."));
        }

        var oldStatus = ticket.Status;
        ticket.Status = req.Status.Trim().ToLowerInvariant();
        ticket.UpdatedAt = DateTime.UtcNow;

        if (ticket.Status == "resolved" || ticket.Status == "closed")
        {
            ticket.ResolvedAt = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(req.ResolutionNotes))
            {
                ticket.ResolutionNotes = req.ResolutionNotes.Trim();
            }
        }

        var authorEmail = _currentUser.Email ?? "superadmin@nexusplatform.io";
        var authorName = _currentUser.Email ?? "Super Admin";

        ticket.Timeline.Add(new TicketTimelineEventDto
        {
            Id = $"evt-{Guid.NewGuid():N}"[..10],
            AuthorName = authorName,
            AuthorEmail = authorEmail,
            Message = $"Status changed from {oldStatus.ToUpperInvariant()} to {ticket.Status.ToUpperInvariant()}." +
                      (!string.IsNullOrWhiteSpace(req.Note) ? $" Note: {req.Note}" : "") +
                      (!string.IsNullOrWhiteSpace(req.ResolutionNotes) ? $" Resolution: {req.ResolutionNotes}" : ""),
            Type = "status_change",
            CreatedAt = DateTime.UtcNow
        });

        await SaveTicketsAsync(tickets, ct);

        _context.AuditLogs.Add(new AuditLog
        {
            Action = "ticket_status_update",
            EntityType = "PlatformTicket",
            EntityId = ticket.TicketNumber,
            ActorName = authorName,
            ActorEmail = authorEmail,
            CompanyId = ticket.TenantId,
            Details = $"Ticket {ticket.TicketNumber} transitioned to {ticket.Status.ToUpperInvariant()}.",
            Module = "SupportDesk",
            Status = "success",
            Timestamp = DateTime.UtcNow
        });
        await _context.SaveChangesAsync(ct);

        return Ok(ApiResponse<PlatformTicketDto>.SuccessResult(ticket, $"Ticket status changed to {ticket.Status}."));
    }

    [HttpPut("{id}/priority")]
    public async Task<ActionResult<ApiResponse<PlatformTicketDto>>> UpdatePriority(
        string id,
        [FromBody] UpdateTicketStatusRequestDto req,
        CancellationToken ct = default)
    {
        var tickets = await LoadOrSeedTicketsAsync(ct);
        var ticket = tickets.FirstOrDefault(t => t.Id == id || t.TicketNumber == id);
        if (ticket == null)
        {
            return NotFound(ApiResponse<PlatformTicketDto>.FailureResult($"Ticket \"{id}\" not found."));
        }

        var oldPriority = ticket.Priority;
        ticket.Priority = req.Status.Trim().ToLowerInvariant(); // reuse status field as target priority
        ticket.UpdatedAt = DateTime.UtcNow;

        var authorEmail = _currentUser.Email ?? "superadmin@nexusplatform.io";
        var authorName = _currentUser.Email ?? "Super Admin";

        ticket.Timeline.Add(new TicketTimelineEventDto
        {
            Id = $"evt-{Guid.NewGuid():N}"[..10],
            AuthorName = authorName,
            AuthorEmail = authorEmail,
            Message = $"Priority updated from {oldPriority.ToUpperInvariant()} to {ticket.Priority.ToUpperInvariant()}.",
            Type = "priority_change",
            CreatedAt = DateTime.UtcNow
        });

        await SaveTicketsAsync(tickets, ct);

        return Ok(ApiResponse<PlatformTicketDto>.SuccessResult(ticket, $"Priority updated to {ticket.Priority}."));
    }

    [HttpPost("{id}/notes")]
    public async Task<ActionResult<ApiResponse<PlatformTicketDto>>> AddNote(
        string id,
        [FromBody] AddTicketNoteRequestDto req,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(req.Message))
        {
            return BadRequest(ApiResponse<PlatformTicketDto>.FailureResult("Note message cannot be empty."));
        }

        var tickets = await LoadOrSeedTicketsAsync(ct);
        var ticket = tickets.FirstOrDefault(t => t.Id == id || t.TicketNumber == id);
        if (ticket == null)
        {
            return NotFound(ApiResponse<PlatformTicketDto>.FailureResult($"Ticket \"{id}\" not found."));
        }

        var authorEmail = _currentUser.Email ?? "superadmin@nexusplatform.io";
        var authorName = _currentUser.Email ?? "Super Admin";

        ticket.Timeline.Add(new TicketTimelineEventDto
        {
            Id = $"evt-{Guid.NewGuid():N}"[..10],
            AuthorName = authorName,
            AuthorEmail = authorEmail,
            Message = req.Message.Trim(),
            Type = "note",
            CreatedAt = DateTime.UtcNow
        });
        ticket.UpdatedAt = DateTime.UtcNow;

        await SaveTicketsAsync(tickets, ct);

        return Ok(ApiResponse<PlatformTicketDto>.SuccessResult(ticket, "Investigation note appended."));
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteTicket(string id, CancellationToken ct = default)
    {
        var tickets = await LoadOrSeedTicketsAsync(ct);
        var ticket = tickets.FirstOrDefault(t => t.Id == id || t.TicketNumber == id);
        if (ticket == null)
        {
            return NotFound(ApiResponse<bool>.FailureResult($"Ticket \"{id}\" not found."));
        }

        tickets.Remove(ticket);
        await SaveTicketsAsync(tickets, ct);

        _context.AuditLogs.Add(new AuditLog
        {
            Action = "ticket_deleted",
            EntityType = "PlatformTicket",
            EntityId = ticket.TicketNumber,
            ActorName = _currentUser.Email ?? "Super Admin",
            ActorEmail = _currentUser.Email ?? "superadmin@nexusplatform.io",
            CompanyId = ticket.TenantId,
            Details = $"Ticket {ticket.TicketNumber} deleted by Super Admin.",
            Module = "SupportDesk",
            Status = "success",
            Timestamp = DateTime.UtcNow
        });
        await _context.SaveChangesAsync(ct);

        return Ok(ApiResponse<bool>.SuccessResult(true, "Ticket removed."));
    }

    private async Task<List<PlatformTicketDto>> LoadOrSeedTicketsAsync(CancellationToken ct)
    {
        var setting = await _context.PlatformSettings.FirstOrDefaultAsync(s => s.Key == TicketsSettingKey, ct);
        if (setting != null && !string.IsNullOrWhiteSpace(setting.Value))
        {
            try
            {
                var list = JsonSerializer.Deserialize<List<PlatformTicketDto>>(setting.Value);
                if (list != null && list.Count > 0) return list;
            }
            catch
            {
                // fallback to seed
            }
        }

        var seeded = CreateDefaultTickets();
        await SaveTicketsAsync(seeded, ct);
        return seeded;
    }

    private async Task SaveTicketsAsync(List<PlatformTicketDto> tickets, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(tickets, new JsonSerializerOptions { WriteIndented = true });
        var setting = await _context.PlatformSettings.FirstOrDefaultAsync(s => s.Key == TicketsSettingKey, ct);
        if (setting == null)
        {
            setting = new PlatformSetting
            {
                Key = TicketsSettingKey,
                Value = json,
                Description = "Platform Support & Technical Incident Helpdesk Registry",
                UpdatedAt = DateTime.UtcNow,
                UpdatedBy = _currentUser.Email ?? "Super Admin"
            };
            _context.PlatformSettings.Add(setting);
        }
        else
        {
            setting.Value = json;
            setting.UpdatedAt = DateTime.UtcNow;
            setting.UpdatedBy = _currentUser.Email ?? "Super Admin";
        }
        await _context.SaveChangesAsync(ct);
    }

    private static List<PlatformTicketDto> CreateDefaultTickets()
    {
        var now = DateTime.UtcNow;
        return new List<PlatformTicketDto>
        {
            new()
            {
                Id = "tkt-seed-01",
                TicketNumber = "INC-2026-1001",
                Title = "Secondary SIP Carrier Exotel Failover Latency Spike",
                Description = "Failover ping latency on secondary gateway exceeded 420ms during peak outbound call volume in AP-South region.",
                Category = "Carrier Trunk Outage",
                Priority = "high",
                Status = "in_progress",
                TenantId = null,
                TenantName = "Cross-Tenant Telephony",
                ReportedByName = "Acoustic Carrier Health Monitor",
                ReportedByEmail = "telemetry@nexusplatform.io",
                AssignedToName = "Network Engineering",
                CreatedAt = now.AddHours(-14),
                UpdatedAt = now.AddHours(-3),
                Timeline = new List<TicketTimelineEventDto>
                {
                    new()
                    {
                        Id = "evt-101",
                        AuthorName = "Acoustic Telemetry",
                        AuthorEmail = "telemetry@nexusplatform.io",
                        Message = "Automated monitor flagged 3 consecutive keepalive timeouts on gateway.exotel.com.",
                        Type = "system_alert",
                        CreatedAt = now.AddHours(-14)
                    },
                    new()
                    {
                        Id = "evt-102",
                        AuthorName = "Super Admin",
                        AuthorEmail = "yanosh@ghlindiaventures.com",
                        Message = "Switched primary outbound route to Twilio AP-South while carrier NOC investigates routing flap.",
                        Type = "note",
                        CreatedAt = now.AddHours(-6)
                    }
                }
            },
            new()
            {
                Id = "tkt-seed-02",
                TicketNumber = "INC-2026-1002",
                Title = "GHL Investor KYC Document Upload Link Regeneration Request",
                Description = "Investor reporting that SMS KYC magic link expired before completion; requested on-behalf regeneration with 48h validity.",
                Category = "Tenant Support",
                Priority = "medium",
                Status = "open",
                TenantId = 1,
                TenantName = "GHL India Ventures",
                TenantSlug = "ghl",
                ReportedByName = "Mani (Company Admin)",
                ReportedByEmail = "mani@ghlindiaventures.com",
                AssignedToName = "Super Admin Team",
                CreatedAt = now.AddHours(-4),
                UpdatedAt = now.AddHours(-4),
                Timeline = new List<TicketTimelineEventDto>
                {
                    new()
                    {
                        Id = "evt-201",
                        AuthorName = "Mani (Company Admin)",
                        AuthorEmail = "mani@ghlindiaventures.com",
                        Message = "High-net-worth investor unable to submit PAN and Aadhaar proof because 24h link expired.",
                        Type = "note",
                        CreatedAt = now.AddHours(-4)
                    }
                }
            },
            new()
            {
                Id = "tkt-seed-03",
                TicketNumber = "INC-2026-1003",
                Title = "Jamin Real Estate Virtual DID Concurrent Channels Scaling",
                Description = "Jamin launch campaign requires upgrading inbound DID concurrency from 8 channels to 16 channels.",
                Category = "Billing & Entitlement",
                Priority = "low",
                Status = "resolved",
                TenantId = 2,
                TenantName = "Jamin Property Group",
                TenantSlug = "jamin",
                ReportedByName = "Kavitha (Jamin Admin)",
                ReportedByEmail = "kavitha@jamin.in",
                AssignedToName = "Super Admin Team",
                ResolutionNotes = "Upgraded DID channels to 16 in Call Configuration and verified trunk allocation.",
                ResolvedAt = now.AddHours(-1),
                CreatedAt = now.AddDays(-1),
                UpdatedAt = now.AddHours(-1),
                Timeline = new List<TicketTimelineEventDto>
                {
                    new()
                    {
                        Id = "evt-301",
                        AuthorName = "Kavitha (Jamin Admin)",
                        AuthorEmail = "kavitha@jamin.in",
                        Message = "Requesting capacity increase ahead of weekend open house site visits.",
                        Type = "note",
                        CreatedAt = now.AddDays(-1)
                    },
                    new()
                    {
                        Id = "evt-302",
                        AuthorName = "Super Admin",
                        AuthorEmail = "yanosh@ghlindiaventures.com",
                        Message = "Channel allocation adjusted to 16 concurrent channels. Verified via SIP simulator.",
                        Type = "status_change",
                        CreatedAt = now.AddHours(-1)
                    }
                }
            }
        };
    }
}
