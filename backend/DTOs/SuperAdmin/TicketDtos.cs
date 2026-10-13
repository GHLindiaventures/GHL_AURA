namespace backend.DTOs.SuperAdmin;

public class TicketTimelineEventDto
{
    public string Id { get; set; } = string.Empty;
    public string AuthorName { get; set; } = "Super Admin";
    public string AuthorEmail { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Type { get; set; } = "note"; // "note", "status_change", "priority_change", "system_alert"
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class PlatformTicketDto
{
    public string Id { get; set; } = string.Empty;
    public string TicketNumber { get; set; } = string.Empty; // e.g. "INC-2026-1042"
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = "System Incident"; // "Carrier Trunk Outage", "Tenant Defect", "Billing & Package", "Speech AI", "Security Incident"
    public string Priority { get; set; } = "medium"; // "low", "medium", "high", "critical"
    public string Status { get; set; } = "open"; // "open", "in_progress", "escalated", "resolved", "closed"
    public int? TenantId { get; set; }
    public string? TenantName { get; set; }
    public string? TenantSlug { get; set; }
    public string ReportedByName { get; set; } = "Super Admin Telemetry";
    public string ReportedByEmail { get; set; } = "system@nexusplatform.io";
    public string? AssignedToName { get; set; } = "Super Admin Team";
    public string? AssignedToEmail { get; set; }
    public string? ResolutionNotes { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public List<TicketTimelineEventDto> Timeline { get; set; } = new();
}

public class CreatePlatformTicketRequestDto
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = "System Incident";
    public string Priority { get; set; } = "medium";
    public int? TenantId { get; set; }
    public string? ReportedByName { get; set; }
    public string? ReportedByEmail { get; set; }
    public string? AssignedToName { get; set; }
}

public class UpdateTicketStatusRequestDto
{
    public string Status { get; set; } = "in_progress";
    public string? Note { get; set; }
    public string? ResolutionNotes { get; set; }
}

public class AddTicketNoteRequestDto
{
    public string Message { get; set; } = string.Empty;
}
