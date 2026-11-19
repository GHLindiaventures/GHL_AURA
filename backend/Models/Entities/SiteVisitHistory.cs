namespace backend.Models.Entities;

/// <summary>One entry in a site visit's timeline: created, assigned / reassigned, status change, attended-by change, reschedule.</summary>
public class SiteVisitHistory
{
    public int Id { get; set; }
    public int SiteVisitId { get; set; }
    public SiteVisit? SiteVisit { get; set; }

    /// <summary>Created | Assigned | Reassigned | StatusChanged | AttendedBy | Rescheduled | PlotsChanged</summary>
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
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
