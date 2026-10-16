namespace backend.DTOs.SuperAdmin;

public class BroadcastAnnouncementDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Priority { get; set; } = "info"; // info | warning | critical
    public string TargetAudience { get; set; } = "all"; // all | tenant_admins | sales_reps
    public string? TargetTenantId { get; set; }
    public string? TargetTenantName { get; set; }
    public bool IsActive { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public string? ExpiresAt { get; set; }
    public string CreatedBy { get; set; } = "Super Admin";
}

public class CreateAnnouncementDto
{
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Priority { get; set; } = "info";
    public string TargetAudience { get; set; } = "all";
    public string? TargetTenantId { get; set; }
    public string? ExpiresAt { get; set; }
}

public class MaintenanceStatusDto
{
    public bool Enabled { get; set; }
    public string Message { get; set; } = "Platform under scheduled maintenance.";
    public string BypassSecret { get; set; } = "nexus-admin-2026";
}

public class SetMaintenanceDto
{
    public bool Enabled { get; set; }
    public string? Message { get; set; }
    public string? BypassSecret { get; set; }
}
