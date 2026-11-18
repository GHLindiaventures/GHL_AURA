using backend.Data;
using backend.Authentication.Interfaces;
using backend.DTOs.Common;
using backend.DTOs.Jamin;
using backend.Models.Entities;
using backend.Services.Interfaces.Jamin;
using Microsoft.EntityFrameworkCore;

namespace backend.Services.Implementations.Jamin;

public class JaminSiteVisitService : IJaminSiteVisitService
{
    private readonly ApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private const int JaminTenantId = 2;
    private static readonly string[] SiteVisitStatuses = { "Requested", "Pending", "Scheduled", "Completed", "Rescheduled", "Cancelled", "No-show" };

    public JaminSiteVisitService(ApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    private bool IsSalesExecutive => string.Equals(_currentUser.Role, "sales_executive", StringComparison.OrdinalIgnoreCase);

    private IQueryable<SiteVisit> GetScopedSiteVisits()
    {
        var query = _context.SiteVisits.Where(s => s.TenantId == JaminTenantId);
        var role = _currentUser.Role;
        var canViewAll = string.Equals(role, "super_admin", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(role, "company_admin", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(role, "admin", StringComparison.OrdinalIgnoreCase);

        if (canViewAll) return query;
        if (!_currentUser.UserId.HasValue) return query.Where(_ => false);
        var me = _currentUser.UserId.Value;

        // An agent sees a visit when they follow it up, when they assigned it to someone else,
        // or when the lead / customer it is for is theirs (so a visit hosted by a colleague never hides my customer).
        return query.Where(s =>
            s.AssignedAgentId == me ||
            s.AssignedById == me ||
            (s.LeadId != null && _context.Leads.Any(l => l.Id == s.LeadId && l.AssignedAgentId == me)) ||
            (s.CustomerId != null && _context.Customers.Any(c => c.Id == s.CustomerId && c.AssignedAgentId == me)));
    }

    /// <summary>Roles that can be given a site-visit follow-up.</summary>
    private static readonly string[] AssignableRoleCodes = { "sales_executive", "company_admin", "admin" };

    private async Task<User?> FindAssignableAgentAsync(int agentId, CancellationToken ct) =>
        await _context.Users.Include(u => u.Role).FirstOrDefaultAsync(
            u => u.Id == agentId && u.CompanyId == JaminTenantId && u.Status != backend.Models.Enums.UserStatus.Disabled
                 && u.Role != null && AssignableRoleCodes.Contains(u.Role.Code), ct);

    /// <summary>Tells the newly assigned agent who the customer is and who assigned the follow-up.</summary>
    private void NotifyAssignedAgent(SiteVisit visit, User agent)
    {
        if (agent.Id == _currentUser.UserId) return; // took it themselves — nothing to notify

        var assigner = !string.IsNullOrWhiteSpace(visit.AssignedByName) ? visit.AssignedByName : "A colleague";
        var where = string.IsNullOrWhiteSpace(visit.PlotNumber) ? visit.ProjectName : $"{visit.ProjectName} (Plot {visit.PlotNumber})";
        _context.Notifications.Add(new Notification
        {
            CompanyId = JaminTenantId,
            UserId = agent.Id,
            Title = "Site visit assigned to you",
            Message = $"{assigner} assigned you the site visit follow-up for {visit.CustomerName} ({visit.CustomerPhone}) — {where}, {visit.ScheduledAt}.",
            Type = "site_visit",
            IsRead = false,
            LeadId = visit.LeadId,
            CustomerId = visit.CustomerId,
            CreatedAt = DateTime.UtcNow
        });
    }

    private bool CanManageAllSiteVisits =>
        string.Equals(_currentUser.Role, "super_admin", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(_currentUser.Role, "company_admin", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(_currentUser.Role, "admin", StringComparison.OrdinalIgnoreCase);

    public async Task<ApiResponse<List<JaminSiteVisitDto>>> GetSiteVisitsAsync(int? agentId = null, string? status = null, int? leadId = null, int? customerId = null, CancellationToken ct = default)
    {
        var query = GetScopedSiteVisits();

        if (agentId.HasValue && agentId.Value > 0)
        {
            query = query.Where(s => s.AssignedAgentId == agentId.Value);
        }

        if (leadId.HasValue && leadId.Value > 0)
        {
            query = query.Where(s => s.LeadId == leadId.Value);
        }

        if (customerId.HasValue && customerId.Value > 0)
        {
            var custId = customerId.Value;
            query = query.Where(s => s.CustomerId == custId || 
                _context.JaminBookings.Any(b => b.CustomerId == custId && b.LeadId == s.LeadId));
        }

        if (!string.IsNullOrEmpty(status) && status != "All")
        {
            query = query.Where(s => s.Status == status);
        }

        var visits = await query.OrderByDescending(s => s.CreatedAt).ToListAsync(ct);
        return ApiResponse<List<JaminSiteVisitDto>>.SuccessResult(await MapWithContactsAsync(visits, ct));
    }

    /// <summary>
    /// Maps rows and refreshes the customer details from the linked lead / customer, so a row always shows
    /// the current name and phone (the stored copy is only a fallback) plus the email.
    /// </summary>
    private async Task<List<JaminSiteVisitDto>> MapWithContactsAsync(List<SiteVisit> visits, CancellationToken ct)
    {
        var leadIds = visits.Where(v => v.LeadId.HasValue).Select(v => v.LeadId!.Value).Distinct().ToList();
        var customerIds = visits.Where(v => v.CustomerId.HasValue).Select(v => v.CustomerId!.Value).Distinct().ToList();

        var leads = leadIds.Count == 0 ? new Dictionary<int, Lead>() : await _context.Leads.AsNoTracking()
            .Where(l => l.CompanyId == JaminTenantId && leadIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, ct);
        var customers = customerIds.Count == 0 ? new Dictionary<int, Customer>() : await _context.Customers.AsNoTracking()
            .Where(c => c.CompanyId == JaminTenantId && customerIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, ct);

        return visits.Select(v =>
        {
            var dto = MapToDto(v);
            if (v.CustomerId.HasValue && customers.TryGetValue(v.CustomerId.Value, out var c))
            {
                if (!string.IsNullOrWhiteSpace(c.Name)) dto.CustomerName = c.Name;
                if (!string.IsNullOrWhiteSpace(c.Phone)) dto.CustomerPhone = c.Phone;
                dto.CustomerEmail = string.IsNullOrWhiteSpace(c.Email) ? null : c.Email;
                dto.ContactType = "customer";
            }
            else if (v.LeadId.HasValue && leads.TryGetValue(v.LeadId.Value, out var l))
            {
                if (!string.IsNullOrWhiteSpace(l.Name)) dto.CustomerName = l.Name;
                if (!string.IsNullOrWhiteSpace(l.Phone)) dto.CustomerPhone = l.Phone;
                dto.CustomerEmail = string.IsNullOrWhiteSpace(l.Email) ? null : l.Email;
                dto.ContactType ??= "lead";
            }
            return dto;
        }).ToList();
    }


    public async Task<ApiResponse<JaminSiteVisitDto>> ScheduleSiteVisitAsync(ScheduleSiteVisitRequestDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.CustomerName) || string.IsNullOrWhiteSpace(dto.CustomerPhone))
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Visitor name and phone are required.");
        if (dto.LeadId.HasValue && dto.CustomerId.HasValue)
            return ApiResponse<JaminSiteVisitDto>.FailureResult("A site visit can be linked to either a lead or a customer, not both.");
        if (dto.LeadId is <= 0 || dto.CustomerId is <= 0)
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Contact IDs must be positive.");



        if (IsSalesExecutive && !_currentUser.UserId.HasValue)
            return ApiResponse<JaminSiteVisitDto>.FailureResult("The authenticated sales agent could not be identified.");

        if (dto.LeadId.HasValue)
        {
            var lead = await _context.Leads.FirstOrDefaultAsync(l => l.Id == dto.LeadId.Value && l.CompanyId == JaminTenantId, ct);
            if (lead == null) return ApiResponse<JaminSiteVisitDto>.FailureResult("Active Jamin lead not found.");
            // An agent can take a lead that is theirs or unassigned, or hand it to the agent who owns it.
            if (IsSalesExecutive && lead.AssignedAgentId.HasValue
                && lead.AssignedAgentId != _currentUser.UserId
                && lead.AssignedAgentId != (dto.AssignedAgentId ?? _currentUser.UserId))
                return ApiResponse<JaminSiteVisitDto>.FailureResult("You can schedule site visits only for leads assigned to you or to the agent you assign it to.");
        }
        if (dto.CustomerId.HasValue)
        {
            var customer = await _context.Customers.FirstOrDefaultAsync(c => c.Id == dto.CustomerId.Value && c.CompanyId == JaminTenantId, ct);
            if (customer == null) return ApiResponse<JaminSiteVisitDto>.FailureResult("Jamin customer not found.");
            if (IsSalesExecutive && customer.AssignedAgentId.HasValue
                && customer.AssignedAgentId != _currentUser.UserId
                && customer.AssignedAgentId != (dto.AssignedAgentId ?? _currentUser.UserId))
                return ApiResponse<JaminSiteVisitDto>.FailureResult("You can schedule site visits only for customers assigned to you or to the agent you assign it to.");
        }
        // Follow-up agent: the caller takes it themselves by default, or hands it to another Jamin agent.
        var scheduledAgentId = dto.AssignedAgentId.HasValue && dto.AssignedAgentId.Value > 0 ? dto.AssignedAgentId : _currentUser.UserId;
        User? followUpAgent = null;
        if (scheduledAgentId.HasValue && scheduledAgentId.Value > 0)
        {
            followUpAgent = await FindAssignableAgentAsync(scheduledAgentId.Value, ct);
            if (followUpAgent == null)
                return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected follow-up agent was not found in Jamin.");
        }

        int? resolvedProjectId = dto.ProjectId;
        int? resolvedPlotId = dto.PlotId;
        string projectName = dto.ProjectName;
        string? plotNumber = dto.PlotNumber;

        // If PlotId is provided, resolve ProjectId, ProjectName, PlotNumber from the plot
        if (resolvedPlotId.HasValue)
        {
            var plot = await _context.JaminPlots
                .Include(p => p.Project)
                .FirstOrDefaultAsync(p => p.Id == resolvedPlotId && p.CompanyId == JaminTenantId, ct);
            if (plot != null)
            {
                if (resolvedProjectId.HasValue && resolvedProjectId.Value != plot.ProjectId)
                    return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected plot does not belong to the selected project.");

                if (plot.Status is "Registered" or "Sold" or "Booked")
                    return ApiResponse<JaminSiteVisitDto>.FailureResult($"Plot {plot.PlotNumber} has already been {plot.Status.ToLower()} and is not available for new site visits.");

                resolvedProjectId ??= plot.ProjectId;
                projectName = plot.Project?.Name ?? projectName;
                plotNumber = plot.PlotNumber;
            }
            else
            {
                return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected plot not found in Jamin inventory.");
            }
        }
        // If only ProjectId is provided, resolve ProjectName
        else if (resolvedProjectId.HasValue && string.IsNullOrWhiteSpace(projectName))
        {
            var project = await _context.JaminProjects
                .FirstOrDefaultAsync(p => p.Id == resolvedProjectId && p.CompanyId == JaminTenantId, ct);
            if (project != null)
            {
                projectName = project.Name;
            }
            else
            {
                return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected project not found in Jamin.");
            }
        }

        if (resolvedProjectId.HasValue && !await _context.JaminProjects.AnyAsync(p => p.Id == resolvedProjectId.Value && p.CompanyId == JaminTenantId, ct))
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected project not found in Jamin.");

        var siteVisit = new SiteVisit
        {
            TenantId = JaminTenantId,
            LeadId = dto.LeadId,
            CustomerId = dto.CustomerId,
            ProjectId = resolvedProjectId,
            PlotId = resolvedPlotId,
            CustomerName = dto.CustomerName.Trim(),
            CustomerPhone = dto.CustomerPhone.Trim(),
            ContactType = dto.CustomerId.HasValue ? "customer" : dto.LeadId.HasValue ? "lead" : null,
            ProjectName = projectName,
            PlotNumber = plotNumber,
            ScheduledAt = dto.ScheduledAt,
            AssignedAgentId = scheduledAgentId,
            AssignedAgentName = followUpAgent?.Name ?? dto.AssignedAgentName ?? string.Empty,
            AssignedById = _currentUser.UserId,
            AssignedByName = _currentUser.Name,
            AssignedAt = DateTime.UtcNow,
            Status = "Scheduled",
            VisitorNote = dto.VisitorNote,
            OutcomeNotes = dto.OutcomeNotes,
            CreatedAt = DateTime.UtcNow
        };

        _context.SiteVisits.Add(siteVisit);

        // Automatically update lead status to Site Visit Scheduled strictly by LeadId
        Lead? leadToUpdate = null;
        if (dto.LeadId.HasValue && dto.LeadId.Value > 0)
        {
            leadToUpdate = await _context.Leads.FirstOrDefaultAsync(l => l.Id == dto.LeadId.Value, ct);
        }
        if (leadToUpdate != null && leadToUpdate.Status != "Converted" && leadToUpdate.Status != "Booking In Progress")
        {
            leadToUpdate.Status = "Site Visit Scheduled";
            leadToUpdate.UpdatedAt = DateTime.UtcNow;
            if (!siteVisit.LeadId.HasValue) siteVisit.LeadId = leadToUpdate.Id;
        }

        if (followUpAgent != null) NotifyAssignedAgent(siteVisit, followUpAgent);

        await _context.SaveChangesAsync(ct);

        _context.AuditLogs.Add(new AuditLog
        {
            CompanyId = JaminTenantId,
            Timestamp = DateTime.UtcNow,
            ActorName = !string.IsNullOrWhiteSpace(_currentUser.Name) ? _currentUser.Name : "System",
            ActorEmail = !string.IsNullOrWhiteSpace(_currentUser.Email) ? _currentUser.Email : string.Empty,
            Action = "CREATE",
            EntityType = "SiteVisit",
            EntityId = siteVisit.Id.ToString(),
            LeadId = siteVisit.LeadId,
            CustomerId = siteVisit.CustomerId,
            Details = $"Scheduled site visit for {siteVisit.CustomerName} at {siteVisit.ProjectName}" + (string.IsNullOrWhiteSpace(siteVisit.PlotNumber) ? "" : $" (Plot {siteVisit.PlotNumber})"),
            Module = "SiteVisits",
            Status = "success"
        });
        await _context.SaveChangesAsync(ct);

        return ApiResponse<JaminSiteVisitDto>.SuccessResult(MapToDto(siteVisit), "Site visit scheduled successfully.");
    }

    public async Task<ApiResponse<JaminSiteVisitDto>> ConfirmSiteVisitAsync(int id, CancellationToken ct = default)
    {
        var visit = await GetScopedSiteVisits().FirstOrDefaultAsync(s => s.Id == id, ct)
                 ?? await _context.SiteVisits.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (visit == null)
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Site visit not found.");
        }
        if (visit.Status is "Completed" or "Cancelled" or "No-show")
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Completed, cancelled, or no-show visits cannot be confirmed.");
        }

        visit.Status = "Scheduled";
        visit.UpdatedAt = DateTime.UtcNow;

        Lead? confirmLead = null;
        if (visit.LeadId.HasValue && visit.LeadId.Value > 0)
        {
            confirmLead = await _context.Leads.FirstOrDefaultAsync(l => l.Id == visit.LeadId.Value, ct);
        }
        if (confirmLead != null && confirmLead.Status != "Converted" && confirmLead.Status != "Booking In Progress")
        {
            confirmLead.Status = "Site Visit Scheduled";
            confirmLead.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync(ct);

        return ApiResponse<JaminSiteVisitDto>.SuccessResult(MapToDto(visit), "Site visit confirmed.");
    }

    public async Task<ApiResponse<JaminSiteVisitDto>> CompleteSiteVisitAsync(int id, UpdateSiteVisitOutcomeDto dto, CancellationToken ct = default)
    {
        var visit = await GetScopedSiteVisits().FirstOrDefaultAsync(s => s.Id == id, ct)
                 ?? await _context.SiteVisits.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (visit == null)
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Site visit not found.");
        }
        if (visit.Status is "Completed" or "Cancelled" or "No-show")
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("This site visit is already closed.");
        }
        var outcomeStatus = string.IsNullOrWhiteSpace(dto.Status) ? "Completed" : dto.Status.Trim();
        if (outcomeStatus is not ("Completed" or "No-show"))
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("A completed visit must be marked Completed or No-show.");
        }

        visit.Status = outcomeStatus;
        if (!string.IsNullOrEmpty(dto.OutcomeNotes))
        {
            visit.OutcomeNotes = dto.OutcomeNotes;
        }
        visit.UpdatedAt = DateTime.UtcNow;

        if (string.Equals(outcomeStatus, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            Lead? completeLead = null;
            if (visit.LeadId.HasValue && visit.LeadId.Value > 0)
            {
                completeLead = await _context.Leads.FirstOrDefaultAsync(l => l.Id == visit.LeadId.Value, ct);
            }
            if (completeLead != null && completeLead.Status != "Converted" && completeLead.Status != "Booking In Progress")
            {
                completeLead.Status = "Site Visit Completed";
                completeLead.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _context.SaveChangesAsync(ct);

        return ApiResponse<JaminSiteVisitDto>.SuccessResult(MapToDto(visit), "Site visit marked as completed.");
    }

    public async Task<ApiResponse<JaminSiteVisitDto>> UpdateSiteVisitAsync(int id, UpdateSiteVisitDto dto, CancellationToken ct = default)
    {
        var visit = await GetScopedSiteVisits().FirstOrDefaultAsync(s => s.Id == id, ct)
                 ?? await _context.SiteVisits.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (visit == null)
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Site visit not found.");
        }

        if (!string.IsNullOrWhiteSpace(dto.Status))
        {
            var requestedStatus = dto.Status.Trim();
            if (!SiteVisitStatuses.Contains(requestedStatus, StringComparer.OrdinalIgnoreCase))
            {
                return ApiResponse<JaminSiteVisitDto>.FailureResult("Invalid site visit status.");
            }
            visit.Status = requestedStatus;
        }

        if (!string.IsNullOrWhiteSpace(dto.ScheduledAt)) visit.ScheduledAt = dto.ScheduledAt.Trim();
        if (dto.ProjectId.HasValue && !await _context.JaminProjects.AnyAsync(
                p => p.Id == dto.ProjectId.Value && p.CompanyId == JaminTenantId, ct))
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected project was not found in Jamin.");
        if (dto.PlotId.HasValue)
        {
            var plot = await _context.JaminPlots.FirstOrDefaultAsync(
                p => p.Id == dto.PlotId.Value && p.CompanyId == JaminTenantId, ct);
            if (plot == null || (dto.ProjectId.HasValue && plot.ProjectId != dto.ProjectId.Value))
                return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected plot does not belong to the selected project.");

            if (plot.Status is "Registered" or "Sold" or "Booked")
                return ApiResponse<JaminSiteVisitDto>.FailureResult($"Plot {plot.PlotNumber} has already been {plot.Status.ToLower()} and is not available for site visits.");

            visit.ProjectId = dto.ProjectId ?? plot.ProjectId;
            visit.PlotId = plot.Id;
        }
        else if (dto.ProjectId.HasValue) visit.ProjectId = dto.ProjectId.Value;
        if (!string.IsNullOrWhiteSpace(dto.ProjectName)) visit.ProjectName = dto.ProjectName.Trim();
        if (dto.PlotNumber != null) visit.PlotNumber = dto.PlotNumber.Trim();
        User? reassignedTo = null;
        if (dto.AssignedAgentId.HasValue && dto.AssignedAgentId.Value > 0 && dto.AssignedAgentId != visit.AssignedAgentId)
        {
            reassignedTo = await FindAssignableAgentAsync(dto.AssignedAgentId.Value, ct);
            if (reassignedTo == null)
                return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected follow-up agent was not found in Jamin.");
            visit.AssignedAgentId = reassignedTo.Id;
            visit.AssignedAgentName = reassignedTo.Name;
            visit.AssignedById = _currentUser.UserId;
            visit.AssignedByName = _currentUser.Name;
            visit.AssignedAt = DateTime.UtcNow;
        }
        if (dto.LeadId.HasValue || dto.CustomerId.HasValue)
        {
            if (dto.LeadId.HasValue && dto.CustomerId.HasValue)
                return ApiResponse<JaminSiteVisitDto>.FailureResult("A site visit can be linked to either a lead or a customer, not both.");
            if (dto.LeadId is <= 0 || dto.CustomerId is <= 0)
                return ApiResponse<JaminSiteVisitDto>.FailureResult("Contact IDs must be positive.");

            if (dto.LeadId.HasValue)
            {
                var lead = await _context.Leads.FirstOrDefaultAsync(l => l.Id == dto.LeadId.Value && l.CompanyId == JaminTenantId, ct);
                if (lead == null) return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected lead was not found in Jamin.");
                if (IsSalesExecutive && lead.AssignedAgentId != _currentUser.UserId)
                    return ApiResponse<JaminSiteVisitDto>.FailureResult("You can link visits only to leads assigned to you.");
                visit.LeadId = lead.Id;
                visit.CustomerId = null;
                visit.CustomerName = lead.Name;
                visit.CustomerPhone = lead.Phone;
                visit.ContactType = "lead";
            }
            else
            {
                var customer = await _context.Customers.FirstOrDefaultAsync(c => c.Id == dto.CustomerId!.Value && c.CompanyId == JaminTenantId, ct);
                if (customer == null) return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected customer was not found in Jamin.");
                if (IsSalesExecutive && customer.AssignedAgentId != _currentUser.UserId)
                    return ApiResponse<JaminSiteVisitDto>.FailureResult("You can link visits only to customers assigned to you.");
                visit.CustomerId = customer.Id;
                visit.LeadId = null;
                visit.CustomerName = customer.Name;
                visit.CustomerPhone = customer.Phone;
                visit.ContactType = "customer";
            }
        }

        if (dto.VisitorNote != null) visit.VisitorNote = dto.VisitorNote.Trim();
        if (dto.OutcomeNotes != null) visit.OutcomeNotes = dto.OutcomeNotes.Trim();
        visit.UpdatedAt = DateTime.UtcNow;

        // Automatically update lead status when site visit status changes
        if (!string.IsNullOrWhiteSpace(dto.Status))
        {
            Lead? updateLead = null;
            if (visit.LeadId.HasValue && visit.LeadId.Value > 0)
            {
                updateLead = await _context.Leads.FirstOrDefaultAsync(l => l.Id == visit.LeadId.Value, ct);
            }
            if (updateLead != null && updateLead.Status != "Converted" && updateLead.Status != "Booking In Progress")
            {
                var newStatus = dto.Status.Trim();
                if (string.Equals(newStatus, "Completed", StringComparison.OrdinalIgnoreCase))
                {
                    updateLead.Status = "Site Visit Completed";
                    updateLead.UpdatedAt = DateTime.UtcNow;
                }
                else if (string.Equals(newStatus, "Scheduled", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(newStatus, "Rescheduled", StringComparison.OrdinalIgnoreCase))
                {
                    updateLead.Status = "Site Visit Scheduled";
                    updateLead.UpdatedAt = DateTime.UtcNow;
                }
                else if (string.Equals(newStatus, "Cancelled", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(newStatus, "No-show", StringComparison.OrdinalIgnoreCase))
                {
                    // Check if lead has any other active (non-cancelled, non-no-show) site visits
                    var hasOtherActiveSiteVisit = await _context.SiteVisits
                        .AnyAsync(s => s.TenantId == JaminTenantId &&
                                       s.Id != visit.Id &&
                                       s.LeadId == updateLead.Id &&
                                       s.Status != "Cancelled" && s.Status != "No-show", ct);

                    if (!hasOtherActiveSiteVisit)
                    {
                        // No other active site visits — revert lead to neutral "Contacted"
                        updateLead.Status = "Contacted";
                        updateLead.UpdatedAt = DateTime.UtcNow;
                    }
                    // else: another site visit is still active, leave lead at "Site Visit Scheduled"
                }
            }
        }

        // Contact details are filled in above only when the link changed, so notify after they are final.
        if (reassignedTo != null) NotifyAssignedAgent(visit, reassignedTo);

        await _context.SaveChangesAsync(ct);
        return ApiResponse<JaminSiteVisitDto>.SuccessResult(MapToDto(visit), "Site visit updated successfully.");
    }

    public async Task<ApiResponse<List<JaminSiteVisitDto>>> GetLeadSiteVisitsAsync(int leadId, CancellationToken ct = default)
    {
        var visits = await GetScopedSiteVisits()
            .Where(s => s.LeadId == leadId)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(ct);

        return ApiResponse<List<JaminSiteVisitDto>>.SuccessResult(await MapWithContactsAsync(visits, ct));
    }

    public async Task<ApiResponse<List<JaminSiteVisitDto>>> GetCustomerSiteVisitsAsync(int customerId, CancellationToken ct = default)
    {
        var visits = await GetScopedSiteVisits()
            .Where(s => s.CustomerId == customerId)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(ct);

        return ApiResponse<List<JaminSiteVisitDto>>.SuccessResult(await MapWithContactsAsync(visits, ct));
    }

    public async Task<ApiResponse<bool>> DeleteSiteVisitAsync(int id, CancellationToken ct = default)
    {
        var visit = await GetScopedSiteVisits().FirstOrDefaultAsync(s => s.Id == id, ct);
        if (visit == null)
        {
            return ApiResponse<bool>.FailureResult("Site visit not found.");
        }

        _context.SiteVisits.Remove(visit);
        await _context.SaveChangesAsync(ct);

        return ApiResponse<bool>.SuccessResult(true, "Site visit deleted successfully.");
    }

    private static JaminSiteVisitDto MapToDto(SiteVisit s) => new()
    {
        Id = s.Id,
        TenantId = s.TenantId,
        LeadId = s.LeadId,
        CustomerId = s.CustomerId,
        ProjectId = s.ProjectId,
        PlotId = s.PlotId,
        CustomerName = s.CustomerName,
        CustomerPhone = s.CustomerPhone,
        ContactType = s.ContactType,
        ProjectName = s.ProjectName,
        PlotNumber = s.PlotNumber,
        ScheduledAt = s.ScheduledAt,
        AssignedAgentId = s.AssignedAgentId,
        AssignedAgentName = s.AssignedAgentName,
        AssignedById = s.AssignedById,
        AssignedByName = s.AssignedByName,
        AssignedAt = s.AssignedAt,
        Status = s.Status,
        VisitorNote = s.VisitorNote,
        OutcomeNotes = s.OutcomeNotes,
        CreatedAt = s.CreatedAt
    };
}

