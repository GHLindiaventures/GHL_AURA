namespace backend.Models.Entities;

public class SiteVisit
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public int? LeadId { get; set; }
    public Lead? Lead { get; set; }

    /// <summary>Optional FK to customers. Set when scheduled for an existing customer.</summary>
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }

    /// <summary>Optional FK to jamin_projects. Set when visiting a project site.</summary>
    public int? ProjectId { get; set; }
    public JaminProject? Project { get; set; }

    /// <summary>Optional FK to jamin_plots. Set when visiting a specific plot.</summary>
    public int? PlotId { get; set; }
    public JaminPlot? Plot { get; set; }

    /// <summary>Every plot on this visit (one or more). <see cref="PlotId"/> is the first of them.</summary>
    public ICollection<SiteVisitPlot> VisitPlots { get; set; } = new List<SiteVisitPlot>();

    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string? ContactType { get; set; }

    public string ProjectName { get; set; } = string.Empty;
    public string? PlotNumber { get; set; }

    public string ScheduledAt { get; set; } = string.Empty;
    public int? AssignedAgentId { get; set; }
    public string? AssignedAgentName { get; set; }

    /// <summary>User who assigned the follow-up to <see cref="AssignedAgentId"/> (equals the agent when they took it themselves).</summary>
    public int? AssignedById { get; set; }
    public string? AssignedByName { get; set; }
    public DateTime? AssignedAt { get; set; }

    public string Status { get; set; } = "Pending";
    public string? VisitorNote { get; set; }
    public string? OutcomeNotes { get; set; }

    /// <summary>Who last changed the status / remarks (shown to the agent who assigned the follow-up).</summary>
    public int? StatusUpdatedById { get; set; }
    public string? StatusUpdatedByName { get; set; }
    public DateTime? StatusUpdatedAt { get; set; }

    /// <summary>The agent who actually attended. Null until recorded; the assigned agent is the default.</summary>
    public int? AttendedById { get; set; }
    public string? AttendedByName { get; set; }
    public DateTime? AttendedAt { get; set; }

    /// <summary>Timeline of assignments, status changes and attendance.</summary>
    public ICollection<SiteVisitHistory> History { get; set; } = new List<SiteVisitHistory>();

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
