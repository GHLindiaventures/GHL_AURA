using backend.Data;
using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace backend.Services.Implementations.Jamin;

/// <summary>
/// Keeps <c>site_visits</c> the single source of truth for Jamin site visits.
/// A lead that is marked "Site Visit Scheduled" outside the Site Visit module (Leads module, website intake)
/// gets a matching site visit row, so it always shows up in the Site Visit module.
/// </summary>
public static class JaminSiteVisitSync
{
    public const int JaminTenantId = 2;
    public const string ScheduledLeadStatus = "Site Visit Scheduled";

    /// <summary>True when the lead belongs to Jamin and its status says a site visit is scheduled.</summary>
    public static bool IsScheduledJaminLead(Lead lead) =>
        lead.CompanyId == JaminTenantId &&
        string.Equals(lead.Status, ScheduledLeadStatus, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Adds (does not save) a site visit for the lead if it has no open one yet.
    /// Returns the new row, or null when one already exists or the lead is not a scheduled Jamin lead.
    /// </summary>
    public static async Task<SiteVisit?> EnsureForLeadAsync(ApplicationDbContext db, Lead lead, CancellationToken ct = default)
    {
        if (!IsScheduledJaminLead(lead)) return null;

        var hasOpenVisit = await db.SiteVisits.AnyAsync(
            s => s.TenantId == JaminTenantId && s.LeadId == lead.Id && s.Status != "Cancelled" && s.Status != "No-show", ct);
        if (hasOpenVisit) return null;

        var visit = BuildFromLead(lead);
        db.SiteVisits.Add(visit);
        return visit;
    }

    /// <summary>One-time/idempotent catch-up for leads that were scheduled before this sync existed.</summary>
    public static int BackfillScheduledLeads(ApplicationDbContext db)
    {
        var missing = db.Leads
            .Where(l => l.CompanyId == JaminTenantId && l.Status == ScheduledLeadStatus)
            .Where(l => !db.SiteVisits.Any(s => s.TenantId == JaminTenantId && s.LeadId == l.Id))
            .ToList();

        foreach (var lead in missing) db.SiteVisits.Add(BuildFromLead(lead));
        if (missing.Count > 0) db.SaveChanges();
        return missing.Count;
    }

    public static SiteVisit BuildFromLead(Lead lead)
    {
        var scheduledAt = !string.IsNullOrWhiteSpace(lead.PreferredVisitDate)
            ? (!string.IsNullOrWhiteSpace(lead.PreferredTimeSlot) ? $"{lead.PreferredVisitDate} • {lead.PreferredTimeSlot}" : lead.PreferredVisitDate!)
            : "To be scheduled";

        return new SiteVisit
        {
            TenantId = JaminTenantId,
            LeadId = lead.Id,
            CustomerName = lead.Name,
            CustomerPhone = lead.Phone,
            ContactType = "lead",
            ProjectName = string.IsNullOrWhiteSpace(lead.TargetDevelopment) ? "General Project Tour" : lead.TargetDevelopment!,
            PlotNumber = null,
            ScheduledAt = scheduledAt,
            AssignedAgentId = lead.AssignedAgentId,
            AssignedAgentName = lead.AssignedAgentName,
            // The lead owner is following it up themselves unless someone else assigned the lead.
            AssignedById = lead.AssignedById ?? lead.AssignedAgentId,
            AssignedByName = lead.AssignedById is null || lead.AssignedById == lead.AssignedAgentId ? lead.AssignedAgentName : null,
            AssignedAt = lead.AssignedAt ?? DateTime.UtcNow,
            Status = "Scheduled",
            VisitorNote = string.IsNullOrWhiteSpace(lead.AnythingWeShouldKnow) ? null : lead.AnythingWeShouldKnow,
            OutcomeNotes = "Synced from Leads: lead marked Site Visit Scheduled.",
            CreatedAt = DateTime.UtcNow
        };
    }
}
