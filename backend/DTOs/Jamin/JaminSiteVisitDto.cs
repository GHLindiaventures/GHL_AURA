namespace backend.DTOs.Jamin;

public class JaminSiteVisitDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int? LeadId { get; set; }
    public int? CustomerId { get; set; }
    public int? ProjectId { get; set; }
    public int? PlotId { get; set; }
    /// <summary>Every plot on the visit. <see cref="PlotId"/> is the first one.</summary>
    public List<JaminSiteVisitPlotDto> Plots { get; set; } = new();
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string? ContactType { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public string? PlotNumber { get; set; }
    public string ScheduledAt { get; set; } = string.Empty;
    public int? AssignedAgentId { get; set; }
    public string? AssignedAgentName { get; set; }
    /// <summary>Who assigned the follow-up to the agent above (same as the agent when they took it themselves).</summary>
    public int? AssignedById { get; set; }
    public string? AssignedByName { get; set; }
    public DateTime? AssignedAt { get; set; }
    public string? CustomerEmail { get; set; }
    public string Status { get; set; } = "Requested"; // Requested | Pending | Scheduled | Completed | Rescheduled | Cancelled | No-show
    public string? VisitorNote { get; set; }
    public string? OutcomeNotes { get; set; }
    public int? StatusUpdatedById { get; set; }
    public string? StatusUpdatedByName { get; set; }
    public DateTime? StatusUpdatedAt { get; set; }
    /// <summary>The agent who attended (defaults to the assigned agent until someone records a different one).</summary>
    public int? AttendedById { get; set; }
    public string? AttendedByName { get; set; }
    public DateTime? AttendedAt { get; set; }
    /// <summary>True once an attending agent has been recorded (otherwise the values above are the assigned agent).</summary>
    public bool AttendedByRecorded { get; set; }
    /// <summary>Whether the caller may change this visit's status, remarks and attendance.</summary>
    public bool CanUpdateStatus { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class SiteVisitHistoryDto
{
    public int Id { get; set; }
    public int SiteVisitId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int? FromAgentId { get; set; }
    public string? FromAgentName { get; set; }
    public int? ToAgentId { get; set; }
    public string? ToAgentName { get; set; }
    public string? FromStatus { get; set; }
    public string? ToStatus { get; set; }
    public int? ActorId { get; set; }
    public string? ActorName { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class ScheduleSiteVisitRequestDto
{
    public int? LeadId { get; set; }
    public int? CustomerId { get; set; }
    public int? ProjectId { get; set; }
    public int? PlotId { get; set; }
    /// <summary>One or more plots the customer will see; takes precedence over <see cref="PlotId"/>.</summary>
    public List<int>? PlotIds { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string? ContactType { get; set; } = "lead";
    public string ProjectName { get; set; } = string.Empty;
    public string? PlotNumber { get; set; }
    public string ScheduledAt { get; set; } = string.Empty;
    public int? AssignedAgentId { get; set; }
    public string? AssignedAgentName { get; set; }
    public string? VisitorNote { get; set; }
    public string? OutcomeNotes { get; set; }
}

public class UpdateSiteVisitOutcomeDto
{
    public string? Status { get; set; } = "Completed";
    public string? OutcomeNotes { get; set; }
}

public class UpdateSiteVisitDto
{
    public int? LeadId { get; set; }
    public int? CustomerId { get; set; }
    public string? ContactType { get; set; }
    public int? ProjectId { get; set; }
    public int? PlotId { get; set; }
    /// <summary>Replaces the plots on the visit when provided.</summary>
    public List<int>? PlotIds { get; set; }
    public string? ProjectName { get; set; }
    public string? PlotNumber { get; set; }
    public string? ScheduledAt { get; set; }
    public int? AssignedAgentId { get; set; }
    public string? AssignedAgentName { get; set; }
    public string? Status { get; set; }
    public string? VisitorNote { get; set; }
    public string? OutcomeNotes { get; set; }
    /// <summary>Records which agent actually attended (assigned agent or admin only).</summary>
    public int? AttendedById { get; set; }
}


public class JaminSiteVisitPlotDto
{
    public int PlotId { get; set; }
    public string PlotNumber { get; set; } = string.Empty;
}

/// <summary>An open site visit that includes a plot — enough to warn "already planned", without customer details.</summary>
public class PlotVisitUsageDto
{
    public int VisitId { get; set; }
    public string ScheduledAt { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? FollowUpAgentName { get; set; }
}
