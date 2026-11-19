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
    private static readonly string[] SiteVisitStatuses = { "Requested", "Pending", "Scheduled", "Visited", "Revisit", "Completed", "Rescheduled", "Cancelled", "No-show" };

    public JaminSiteVisitService(ApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    private bool IsSalesExecutive => string.Equals(_currentUser.Role, "sales_executive", StringComparison.OrdinalIgnoreCase);

    private IQueryable<SiteVisit> GetScopedSiteVisits()
    {
        var query = _context.SiteVisits.Include(s => s.VisitPlots).Where(s => s.TenantId == JaminTenantId);
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

    private const int MaxPlotsPerVisit = 10;

    private static List<int> NormalizePlotIds(IEnumerable<int>? ids, int? single)
    {
        var list = (ids ?? Enumerable.Empty<int>()).ToList();
        if (list.Count == 0 && single.HasValue) list.Add(single.Value);
        return list.Where(i => i > 0).Distinct().ToList();
    }

    private async Task<(string? Error, List<JaminPlot> Plots)> ResolvePlotsAsync(List<int> ids, int? projectId, CancellationToken ct)
    {
        if (ids.Count > MaxPlotsPerVisit)
            return ($"You can pick up to {MaxPlotsPerVisit} plots for one site visit.", new List<JaminPlot>());

        var found = await _context.JaminPlots.Include(p => p.Project)
            .Where(p => ids.Contains(p.Id) && p.CompanyId == JaminTenantId)
            .ToListAsync(ct);
        if (found.Count != ids.Count)
            return ("Selected plot not found in Jamin inventory.", found);

        var ordered = ids.Select(id => found.First(p => p.Id == id)).ToList(); // keep the order the rep picked them in
        var expectedProject = projectId ?? ordered[0].ProjectId;
        if (ordered.Any(p => p.ProjectId != expectedProject))
            return ("All selected plots must belong to the selected project.", ordered);

        var taken = ordered.FirstOrDefault(p => p.Status is "Registered" or "Sold" or "Booked");
        if (taken != null)
            return ($"Plot {taken.PlotNumber} has already been {taken.Status.ToLower()} and is not available for site visits.", ordered);

        return (null, ordered);
    }

    /// <summary>"Plot #1, Plot #2" — kept within the 100-character column.</summary>
    private static string JoinPlotNumbers(IEnumerable<JaminPlot> plots)
    {
        var joined = string.Join(", ", plots.Select(p => p.PlotNumber));
        return joined.Length <= 100 ? joined : joined[..99] + "…";
    }

    private static readonly string[] ClosedVisitStatuses = { "Cancelled", "No-show", "Visited", "Completed" };

    /// <summary>Error code returned (HTTP 409) when the customer already has an open site visit.</summary>
    public const string DuplicateOpenVisitCode = "duplicate_open_visit";

    private static string PhoneKey(string? phone)
    {
        var digits = new string((phone ?? string.Empty).Where(char.IsDigit).ToArray());
        return digits.Length > 10 ? digits[^10..] : digits;
    }

    /// <summary>
    /// The customer's open (not visited / cancelled / no-show) site visit, if any. Matches the same lead, the same customer,
    /// or the same phone number, so typing the number again as a "new visitor" does not slip past it.
    /// </summary>
    private async Task<SiteVisit?> FindOpenVisitForContactAsync(int? leadId, int? customerId, string? phone, CancellationToken ct)
    {
        var key = PhoneKey(phone);
        var open = await _context.SiteVisits.AsNoTracking().Include(s => s.VisitPlots)
            .Where(s => s.TenantId == JaminTenantId && !ClosedVisitStatuses.Contains(s.Status))
            .ToListAsync(ct);
        return open
            .Where(s => (leadId.HasValue && s.LeadId == leadId) ||
                        (customerId.HasValue && s.CustomerId == customerId) ||
                        (key.Length >= 10 && PhoneKey(s.CustomerPhone) == key))
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefault();
    }

    /// <summary>Visits still ahead (not closed) that include any of these plots, excluding one visit.</summary>
    private async Task<List<SiteVisit>> FindOtherActiveVisitsAsync(List<int> plotIds, int? excludeVisitId, CancellationToken ct)
    {
        if (plotIds.Count == 0) return new List<SiteVisit>();
        return await _context.SiteVisits.AsNoTracking()
            .Include(s => s.VisitPlots)
            .Where(s => s.TenantId == JaminTenantId
                        && (!excludeVisitId.HasValue || s.Id != excludeVisitId.Value)
                        && !ClosedVisitStatuses.Contains(s.Status)
                        && ((s.PlotId != null && plotIds.Contains(s.PlotId.Value))
                            || s.VisitPlots.Any(vp => plotIds.Contains(vp.PlotId))))
            .ToListAsync(ct);
    }

    private static bool VisitIncludesPlot(SiteVisit v, int plotId) =>
        v.PlotId == plotId || v.VisitPlots.Any(vp => vp.PlotId == plotId);

    /// <summary>
    /// Several customers may visit the same plot, but the people involved are told:
    /// the follow-up agent of every other open visit on the plot, and the agent holding the plot, if any.
    /// </summary>
    private async Task NotifyPlotInterestAsync(SiteVisit visit, List<JaminPlot> plots, CancellationToken ct)
    {
        if (plots.Count == 0) return;
        var me = _currentUser.UserId;
        var who = !string.IsNullOrWhiteSpace(_currentUser.Name) ? _currentUser.Name : "A colleague";
        var plotIds = plots.Select(p => p.Id).ToList();
        var notified = new HashSet<(int UserId, string Key)>();

        // 1. Other open visits on the same plot(s): their follow-up agents learn that someone else is going too.
        var others = await FindOtherActiveVisitsAsync(plotIds, visit.Id > 0 ? visit.Id : null, ct);
        foreach (var group in others.Where(o => o.AssignedAgentId.HasValue && o.AssignedAgentId != me).GroupBy(o => o.AssignedAgentId!.Value))
        {
            foreach (var theirs in group)
            {
                var shared = plots.Where(p => VisitIncludesPlot(theirs, p.Id)).Select(p => p.PlotNumber).ToList();
                if (shared.Count == 0 || !notified.Add((group.Key, $"visit-{theirs.Id}"))) continue;
                _context.Notifications.Add(new Notification
                {
                    CompanyId = JaminTenantId,
                    UserId = group.Key,
                    Title = "Another customer is visiting the same plot",
                    Message = $"{who} scheduled another customer's site visit ({visit.ScheduledAt}) that includes {string.Join(", ", shared)}. " +
                              $"Your visit for {theirs.CustomerName} on {theirs.ScheduledAt} also includes it.",
                    Type = "site_visit",
                    IsRead = false,
                    LeadId = theirs.LeadId,
                    CustomerId = theirs.CustomerId,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        // 2. The agent holding a plot on hold for a customer.
        foreach (var plot in plots.Where(p => p.Status == "Hold"))
        {
            int? holderId = null;
            if (plot.HeldByLeadId.HasValue)
                holderId = await _context.Leads.AsNoTracking()
                    .Where(l => l.Id == plot.HeldByLeadId.Value && l.CompanyId == JaminTenantId)
                    .Select(l => l.AssignedAgentId).FirstOrDefaultAsync(ct);
            if (holderId == null && !string.IsNullOrWhiteSpace(plot.HoldByAgent))
            {
                var name = plot.HoldByAgent.Trim().ToLower();
                holderId = await _context.Users.AsNoTracking()
                    .Where(u => u.CompanyId == JaminTenantId && u.Name.ToLower() == name)
                    .Select(u => (int?)u.Id).FirstOrDefaultAsync(ct);
            }
            if (!holderId.HasValue || holderId == me || !notified.Add((holderId.Value, $"hold-{plot.Id}"))) continue;

            _context.Notifications.Add(new Notification
            {
                CompanyId = JaminTenantId,
                UserId = holderId.Value,
                Title = "A plot you are holding was chosen for a site visit",
                Message = $"{who} chose {plot.PlotNumber}, which you are holding" +
                          (string.IsNullOrWhiteSpace(plot.HeldByCustomerName) ? "" : $" for {plot.HeldByCustomerName}") +
                          $", for a site visit on {visit.ScheduledAt}.",
                Type = "site_visit",
                IsRead = false,
                CreatedAt = DateTime.UtcNow
            });
        }
    }

    /// <summary>Open visits per plot (for the "already planned" warning). Names of customers are not exposed.</summary>
    public async Task<ApiResponse<Dictionary<int, List<PlotVisitUsageDto>>>> GetPlotUsageAsync(int? projectId, CancellationToken ct = default)
    {
        var query = _context.SiteVisits.AsNoTracking().Include(s => s.VisitPlots)
            .Where(s => s.TenantId == JaminTenantId && !ClosedVisitStatuses.Contains(s.Status));
        if (projectId.HasValue) query = query.Where(s => s.ProjectId == projectId.Value);

        var result = new Dictionary<int, List<PlotVisitUsageDto>>();
        foreach (var v in await query.ToListAsync(ct))
        {
            var ids = v.VisitPlots.Select(vp => vp.PlotId).ToHashSet();
            if (v.PlotId.HasValue) ids.Add(v.PlotId.Value);
            foreach (var id in ids)
            {
                if (!result.TryGetValue(id, out var list)) result[id] = list = new List<PlotVisitUsageDto>();
                list.Add(new PlotVisitUsageDto { VisitId = v.Id, ScheduledAt = v.ScheduledAt, Status = v.Status, FollowUpAgentName = v.AssignedAgentName });
            }
        }
        return ApiResponse<Dictionary<int, List<PlotVisitUsageDto>>>.SuccessResult(result);
    }

    /// <summary>Tells the agent who assigned the follow-up what the follow-up agent set (status and remarks).</summary>
    private void NotifyAssignerOfUpdate(SiteVisit visit)
    {
        var assignerId = visit.AssignedById;
        if (!assignerId.HasValue || assignerId == _currentUser.UserId) return; // they changed it themselves

        var who = !string.IsNullOrWhiteSpace(_currentUser.Name) ? _currentUser.Name : "The follow-up agent";
        var remarks = string.IsNullOrWhiteSpace(visit.OutcomeNotes) ? "no remarks" : $"remarks: \"{visit.OutcomeNotes}\"";
        _context.Notifications.Add(new Notification
        {
            CompanyId = JaminTenantId,
            UserId = assignerId.Value,
            Title = $"Site visit {visit.Status}",
            Message = $"{who} set the site visit for {visit.CustomerName} ({visit.CustomerPhone}) to {visit.Status} — {remarks}.",
            Type = "site_visit",
            IsRead = false,
            LeadId = visit.LeadId,
            CustomerId = visit.CustomerId,
            CreatedAt = DateTime.UtcNow
        });
    }

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

    /// <summary>Only the assigned agent or an admin may change a visit's status, remarks or attendance.</summary>
    private bool CanChangeStatus(SiteVisit v) =>
        CanManageAllSiteVisits || (_currentUser.UserId.HasValue && v.AssignedAgentId == _currentUser.UserId.Value);

    private const string StatusForbiddenMessage =
        "Only the agent assigned to this site visit (or an admin) can update its status, remarks or attendance.";

    private void AddHistory(SiteVisit v, string type, string description,
        int? fromAgentId = null, string? fromAgentName = null, int? toAgentId = null, string? toAgentName = null,
        string? fromStatus = null, string? toStatus = null)
    {
        var text = description.Length > 480 ? description[..480] : description;
        v.History.Add(new SiteVisitHistory
        {
            EventType = type, Description = text,
            FromAgentId = fromAgentId, FromAgentName = fromAgentName, ToAgentId = toAgentId, ToAgentName = toAgentName,
            FromStatus = fromStatus, ToStatus = toStatus,
            ActorId = _currentUser.UserId, ActorName = _currentUser.Name,
            CreatedAt = DateTime.UtcNow
        });
    }

    public async Task<ApiResponse<List<SiteVisitHistoryDto>>> GetSiteVisitHistoryAsync(int id, CancellationToken ct = default)
    {
        var visible = await GetScopedSiteVisits().AnyAsync(s => s.Id == id, ct);
        if (!visible) return ApiResponse<List<SiteVisitHistoryDto>>.FailureResult("Site visit not found.");
        var rows = await _context.SiteVisitHistory.AsNoTracking()
            .Where(h => h.SiteVisitId == id).OrderBy(h => h.CreatedAt).ThenBy(h => h.Id).ToListAsync(ct);
        return ApiResponse<List<SiteVisitHistoryDto>>.SuccessResult(rows.Select(h => new SiteVisitHistoryDto
        {
            Id = h.Id, SiteVisitId = h.SiteVisitId, EventType = h.EventType, Description = h.Description,
            FromAgentId = h.FromAgentId, FromAgentName = h.FromAgentName, ToAgentId = h.ToAgentId, ToAgentName = h.ToAgentName,
            FromStatus = h.FromStatus, ToStatus = h.ToStatus, ActorId = h.ActorId, ActorName = h.ActorName, CreatedAt = h.CreatedAt
        }).ToList());
    }

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
        // One open site visit per customer: if they already have one, it is rescheduled/edited, not duplicated.
        var existingOpen = await FindOpenVisitForContactAsync(dto.LeadId, dto.CustomerId, dto.CustomerPhone, ct);
        if (existingOpen != null)
        {
            var plotText = existingOpen.VisitPlots.Count > 0
                ? string.Join(", ", existingOpen.VisitPlots.OrderBy(vp => vp.Id).Select(vp => vp.PlotNumber))
                : existingOpen.PlotNumber;
            var where = string.IsNullOrWhiteSpace(plotText) ? existingOpen.ProjectName : $"{existingOpen.ProjectName}, {plotText}";
            var visible = await GetScopedSiteVisits().AnyAsync(s => s.Id == existingOpen.Id, ct);
            var message = visible
                ? $"{existingOpen.CustomerName} already has an open site visit ({where}, {existingOpen.ScheduledAt}). Reschedule that visit instead of creating a new one."
                : $"{existingOpen.CustomerName} already has an open site visit ({where}, {existingOpen.ScheduledAt}) with {(string.IsNullOrWhiteSpace(existingOpen.AssignedAgentName) ? "another agent" : existingOpen.AssignedAgentName)}. Ask them or an admin to reschedule it.";
            // Only hand back the visit itself when the caller may edit it.
            var existingDto = visible ? (await MapWithContactsAsync(new List<SiteVisit> { existingOpen }, ct))[0] : null;
            return ApiResponse<JaminSiteVisitDto>.FailureResult(message, existingDto, new List<string> { DuplicateOpenVisitCode });
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
        string projectName = dto.ProjectName;

        // One or more plots: every plot must exist, be open for visits, and belong to the same project.
        var requestedPlotIds = NormalizePlotIds(dto.PlotIds, dto.PlotId);
        var chosenPlots = new List<JaminPlot>();
        if (requestedPlotIds.Count > 0)
        {
            var (plotError, plots) = await ResolvePlotsAsync(requestedPlotIds, resolvedProjectId, ct);
            if (plotError != null) return ApiResponse<JaminSiteVisitDto>.FailureResult(plotError);
            chosenPlots = plots;
            resolvedProjectId ??= chosenPlots[0].ProjectId;
            projectName = chosenPlots[0].Project?.Name ?? projectName;
        }
        // If only ProjectId is provided, resolve ProjectName
        else if (resolvedProjectId.HasValue && string.IsNullOrWhiteSpace(projectName))
        {
            var project = await _context.JaminProjects
                .FirstOrDefaultAsync(p => p.Id == resolvedProjectId && p.CompanyId == JaminTenantId, ct);
            if (project == null)
                return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected project not found in Jamin.");
            projectName = project.Name;
        }

        if (resolvedProjectId.HasValue && !await _context.JaminProjects.AnyAsync(p => p.Id == resolvedProjectId.Value && p.CompanyId == JaminTenantId, ct))
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected project not found in Jamin.");

        var plotNumber = chosenPlots.Count > 0 ? JoinPlotNumbers(chosenPlots) : dto.PlotNumber;


        var siteVisit = new SiteVisit
        {
            TenantId = JaminTenantId,
            LeadId = dto.LeadId,
            CustomerId = dto.CustomerId,
            ProjectId = resolvedProjectId,
            PlotId = chosenPlots.FirstOrDefault()?.Id,
            VisitPlots = chosenPlots.Select(p => new SiteVisitPlot { PlotId = p.Id, PlotNumber = p.PlotNumber }).ToList(),
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
            Status = "Pending",
            VisitorNote = dto.VisitorNote,
            OutcomeNotes = dto.OutcomeNotes,
            CreatedAt = DateTime.UtcNow
        };

        AddHistory(siteVisit, "Created", $"Site visit scheduled by {_currentUser.Name}.", toStatus: "Pending");
        if (scheduledAgentId.HasValue)
        {
            var selfAssigned = scheduledAgentId == _currentUser.UserId;
            AddHistory(siteVisit, "Assigned",
                selfAssigned ? $"{siteVisit.AssignedAgentName} took this visit." : $"Assigned to {siteVisit.AssignedAgentName} by {_currentUser.Name}.",
                toAgentId: scheduledAgentId, toAgentName: siteVisit.AssignedAgentName);
        }

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
        await NotifyPlotInterestAsync(siteVisit, chosenPlots, ct);

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
        var visit = await GetScopedSiteVisits().FirstOrDefaultAsync(s => s.Id == id, ct);
        if (visit == null)
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Site visit not found.");
        }
        if (!CanChangeStatus(visit)) return ApiResponse<JaminSiteVisitDto>.FailureResult(StatusForbiddenMessage);
        if (visit.Status is "Completed" or "Cancelled" or "No-show")
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Completed, cancelled, or no-show visits cannot be confirmed.");
        }

        AddHistory(visit, "StatusChanged", $"Status changed from {visit.Status} to Scheduled.", fromStatus: visit.Status, toStatus: "Scheduled");
        visit.Status = "Scheduled";
        visit.StatusUpdatedById = _currentUser.UserId; visit.StatusUpdatedByName = _currentUser.Name; visit.StatusUpdatedAt = DateTime.UtcNow;
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
        var visit = await GetScopedSiteVisits().FirstOrDefaultAsync(s => s.Id == id, ct);
        if (visit == null)
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Site visit not found.");
        }
        if (!CanChangeStatus(visit)) return ApiResponse<JaminSiteVisitDto>.FailureResult(StatusForbiddenMessage);
        if (visit.Status is "Completed" or "Cancelled" or "No-show")
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("This site visit is already closed.");
        }
        var outcomeStatus = string.IsNullOrWhiteSpace(dto.Status) ? "Completed" : dto.Status.Trim();
        if (outcomeStatus is not ("Completed" or "No-show"))
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("A completed visit must be marked Completed or No-show.");
        }

        AddHistory(visit, "StatusChanged", $"Status changed from {visit.Status} to {outcomeStatus}.", fromStatus: visit.Status, toStatus: outcomeStatus);
        visit.Status = outcomeStatus;
        if (!string.IsNullOrEmpty(dto.OutcomeNotes))
        {
            visit.OutcomeNotes = dto.OutcomeNotes;
        }
        visit.UpdatedAt = DateTime.UtcNow;
        visit.StatusUpdatedById = _currentUser.UserId; visit.StatusUpdatedByName = _currentUser.Name; visit.StatusUpdatedAt = DateTime.UtcNow;
        RecordAttendanceDefault(visit, outcomeStatus);

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
        var visit = await GetScopedSiteVisits().FirstOrDefaultAsync(s => s.Id == id, ct);
        if (visit == null)
        {
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Site visit not found.");
        }

        var previousStatus = visit.Status;
        var previousRemarks = visit.OutcomeNotes;
        var previousScheduledAt = visit.ScheduledAt;

        // Status, remarks and attendance belong to the assigned agent (or an admin) - enforced here, not just in the UI.
        var changesStatus = !string.IsNullOrWhiteSpace(dto.Status)
            && !string.Equals(dto.Status.Trim(), visit.Status, StringComparison.OrdinalIgnoreCase);
        var changesRemarks = dto.OutcomeNotes != null
            && !string.Equals(dto.OutcomeNotes.Trim(), (visit.OutcomeNotes ?? string.Empty).Trim(), StringComparison.Ordinal);
        if ((changesStatus || changesRemarks || dto.AttendedById.HasValue) && !CanChangeStatus(visit))
            return ApiResponse<JaminSiteVisitDto>.FailureResult(StatusForbiddenMessage);

        if (!string.IsNullOrWhiteSpace(dto.Status))
        {
            var requestedStatus = dto.Status.Trim();
            // Store the canonical spelling ("visited" -> "Visited").
            var canonical = SiteVisitStatuses.FirstOrDefault(s => string.Equals(s, requestedStatus, StringComparison.OrdinalIgnoreCase));
            if (canonical == null)
            {
                return ApiResponse<JaminSiteVisitDto>.FailureResult("Invalid site visit status.");
            }
            visit.Status = canonical;
        }

        if (!string.IsNullOrWhiteSpace(dto.ScheduledAt)) visit.ScheduledAt = dto.ScheduledAt.Trim();
        if (!string.Equals(previousScheduledAt, visit.ScheduledAt, StringComparison.Ordinal))
            AddHistory(visit, "Rescheduled", $"Rescheduled from {previousScheduledAt} to {visit.ScheduledAt}.");
        if (dto.ProjectId.HasValue && !await _context.JaminProjects.AnyAsync(
                p => p.Id == dto.ProjectId.Value && p.CompanyId == JaminTenantId, ct))
            return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected project was not found in Jamin.");
        // Plots: PlotIds (or a single PlotId) replaces the set; an empty PlotIds list clears it (General Project Tour).
        var replacePlots = dto.PlotIds != null || dto.PlotId.HasValue;
        var addedPlots = new List<JaminPlot>();
        if (replacePlots)
        {
            var wanted = NormalizePlotIds(dto.PlotIds, dto.PlotId);
            var chosen = new List<JaminPlot>();
            if (wanted.Count > 0)
            {
                var (plotError, plots) = await ResolvePlotsAsync(wanted, dto.ProjectId, ct);
                if (plotError != null) return ApiResponse<JaminSiteVisitDto>.FailureResult(plotError);
                chosen = plots;
                visit.ProjectId = dto.ProjectId ?? chosen[0].ProjectId;
            }
            else if (dto.ProjectId.HasValue) visit.ProjectId = dto.ProjectId.Value;

            // Keep rows for plots that stay, drop the rest, add the new ones (avoids a delete + insert of the same key).
            var keepIds = chosen.Select(p => p.Id).ToHashSet();
            addedPlots = chosen.Where(p => visit.VisitPlots.All(vp => vp.PlotId != p.Id)).ToList(); // newly chosen only
            foreach (var stale in visit.VisitPlots.Where(vp => !keepIds.Contains(vp.PlotId)).ToList())
            {
                visit.VisitPlots.Remove(stale);
                _context.SiteVisitPlots.Remove(stale);
            }
            foreach (var plot in chosen.Where(p => visit.VisitPlots.All(vp => vp.PlotId != p.Id)))
                visit.VisitPlots.Add(new SiteVisitPlot { PlotId = plot.Id, PlotNumber = plot.PlotNumber });

            visit.PlotId = chosen.FirstOrDefault()?.Id;
            visit.PlotNumber = chosen.Count > 0 ? JoinPlotNumbers(chosen) : null;
        }
        else if (dto.ProjectId.HasValue) visit.ProjectId = dto.ProjectId.Value;
        if (!string.IsNullOrWhiteSpace(dto.ProjectName)) visit.ProjectName = dto.ProjectName.Trim();
        if (!replacePlots && dto.PlotNumber != null) visit.PlotNumber = dto.PlotNumber.Trim();
        User? reassignedTo = null;
        if (dto.AssignedAgentId.HasValue && dto.AssignedAgentId.Value > 0 && dto.AssignedAgentId != visit.AssignedAgentId)
        {
            reassignedTo = await FindAssignableAgentAsync(dto.AssignedAgentId.Value, ct);
            if (reassignedTo == null)
                return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected follow-up agent was not found in Jamin.");
            AddHistory(visit, "Reassigned", $"Reassigned from {visit.AssignedAgentName ?? "no one"} to {reassignedTo.Name} by {_currentUser.Name}.",
                fromAgentId: visit.AssignedAgentId, fromAgentName: visit.AssignedAgentName, toAgentId: reassignedTo.Id, toAgentName: reassignedTo.Name);
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

        // Record who set the status / remarks, so the agent who assigned the follow-up can see it.
        var statusChanged = !string.Equals(previousStatus, visit.Status, StringComparison.Ordinal);
        var remarksChanged = !string.Equals(previousRemarks ?? string.Empty, visit.OutcomeNotes ?? string.Empty, StringComparison.Ordinal);
        if (statusChanged)
        {
            AddHistory(visit, "StatusChanged", $"Status changed from {previousStatus} to {visit.Status} by {_currentUser.Name}.", fromStatus: previousStatus, toStatus: visit.Status);
            RecordAttendanceDefault(visit, visit.Status);
        }
        if (dto.AttendedById.HasValue && dto.AttendedById.Value > 0 && dto.AttendedById != visit.AttendedById)
        {
            var attendee = await FindAssignableAgentAsync(dto.AttendedById.Value, ct);
            if (attendee == null) return ApiResponse<JaminSiteVisitDto>.FailureResult("Selected attending agent was not found in Jamin.");
            AddHistory(visit, "AttendedBy", $"{attendee.Name} recorded as the attending agent by {_currentUser.Name}.",
                fromAgentId: visit.AttendedById, fromAgentName: visit.AttendedByName, toAgentId: attendee.Id, toAgentName: attendee.Name);
            visit.AttendedById = attendee.Id;
            visit.AttendedByName = attendee.Name;
            visit.AttendedAt = DateTime.UtcNow;
        }
        if (statusChanged || remarksChanged)
        {
            visit.StatusUpdatedById = _currentUser.UserId;
            visit.StatusUpdatedByName = _currentUser.Name;
            visit.StatusUpdatedAt = DateTime.UtcNow;
            NotifyAssignerOfUpdate(visit);
        }

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
                if (string.Equals(newStatus, "Completed", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(newStatus, "Visited", StringComparison.OrdinalIgnoreCase))
                {
                    updateLead.Status = "Site Visit Completed";
                    updateLead.UpdatedAt = DateTime.UtcNow;
                }
                else if (string.Equals(newStatus, "Scheduled", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(newStatus, "Rescheduled", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(newStatus, "Revisit", StringComparison.OrdinalIgnoreCase))
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
        if (addedPlots.Count > 0) await NotifyPlotInterestAsync(visit, addedPlots, ct);

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

        // If this was the lead's only open visit, the lead is no longer "Site Visit Scheduled".
        if (visit.LeadId.HasValue)
        {
            var lead = await _context.Leads.FirstOrDefaultAsync(l => l.Id == visit.LeadId.Value && l.CompanyId == JaminTenantId, ct);
            var hasOtherOpenVisit = await _context.SiteVisits.AnyAsync(
                s => s.TenantId == JaminTenantId && s.Id != visit.Id && s.LeadId == visit.LeadId
                     && !ClosedVisitStatuses.Contains(s.Status), ct);
            if (lead != null && !hasOtherOpenVisit && lead.Status == "Site Visit Scheduled")
            {
                lead.Status = "Contacted";
                lead.UpdatedAt = DateTime.UtcNow;
            }
        }

        // Tell the follow-up agent when somebody else removes their visit.
        if (visit.AssignedAgentId.HasValue && visit.AssignedAgentId != _currentUser.UserId)
        {
            var who = !string.IsNullOrWhiteSpace(_currentUser.Name) ? _currentUser.Name : "A colleague";
            _context.Notifications.Add(new Notification
            {
                CompanyId = JaminTenantId,
                UserId = visit.AssignedAgentId.Value,
                Title = "Site visit removed",
                Message = $"{who} removed the site visit for {visit.CustomerName} ({visit.CustomerPhone}) — {visit.ProjectName}, {visit.ScheduledAt}.",
                Type = "site_visit",
                IsRead = false,
                LeadId = visit.LeadId,
                CustomerId = visit.CustomerId,
                CreatedAt = DateTime.UtcNow
            });
        }

        _context.AuditLogs.Add(new AuditLog
        {
            CompanyId = JaminTenantId,
            Timestamp = DateTime.UtcNow,
            ActorName = !string.IsNullOrWhiteSpace(_currentUser.Name) ? _currentUser.Name : "System",
            ActorEmail = !string.IsNullOrWhiteSpace(_currentUser.Email) ? _currentUser.Email : string.Empty,
            Action = "DELETE",
            EntityType = "SiteVisit",
            EntityId = visit.Id.ToString(),
            LeadId = visit.LeadId,
            CustomerId = visit.CustomerId,
            Details = $"Removed site visit for {visit.CustomerName} at {visit.ProjectName} ({visit.ScheduledAt}, status {visit.Status})",
            Module = "SiteVisits",
            Status = "success"
        });

        _context.SiteVisits.Remove(visit);
        await _context.SaveChangesAsync(ct);

        return ApiResponse<bool>.SuccessResult(true, "Site visit removed.");
    }

    /// <summary>All plots on the visit; falls back to the single PlotId for visits saved before multi-plot support.</summary>
    private static List<JaminSiteVisitPlotDto> PlotsOf(SiteVisit s)
    {
        var rows = s.VisitPlots
            .OrderBy(vp => vp.Id)
            .Select(vp => new JaminSiteVisitPlotDto { PlotId = vp.PlotId, PlotNumber = vp.PlotNumber })
            .ToList();
        if (rows.Count == 0 && s.PlotId.HasValue)
            rows.Add(new JaminSiteVisitPlotDto { PlotId = s.PlotId.Value, PlotNumber = s.PlotNumber ?? string.Empty });
        return rows;
    }

    /// <summary>When a visit is marked Visited / Completed and nobody recorded an attendee, the assigned agent attended.</summary>
    private void RecordAttendanceDefault(SiteVisit v, string newStatus)
    {
        if (newStatus is not ("Visited" or "Completed") || v.AttendedById.HasValue || !v.AssignedAgentId.HasValue) return;
        v.AttendedById = v.AssignedAgentId;
        v.AttendedByName = v.AssignedAgentName;
        v.AttendedAt = DateTime.UtcNow;
        AddHistory(v, "AttendedBy", $"{v.AssignedAgentName} attended (default: assigned agent).", toAgentId: v.AssignedAgentId, toAgentName: v.AssignedAgentName);
    }

    private JaminSiteVisitDto MapToDto(SiteVisit s) => new()
    {
        Id = s.Id,
        TenantId = s.TenantId,
        LeadId = s.LeadId,
        CustomerId = s.CustomerId,
        ProjectId = s.ProjectId,
        PlotId = s.PlotId,
        Plots = PlotsOf(s),
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
        StatusUpdatedById = s.StatusUpdatedById,
        StatusUpdatedByName = s.StatusUpdatedByName,
        StatusUpdatedAt = s.StatusUpdatedAt,
        AttendedById = s.AttendedById ?? s.AssignedAgentId,
        AttendedByName = s.AttendedById.HasValue ? s.AttendedByName : s.AssignedAgentName,
        AttendedAt = s.AttendedAt,
        AttendedByRecorded = s.AttendedById.HasValue,
        CanUpdateStatus = CanChangeStatus(s),
        CreatedAt = s.CreatedAt
    };
}

