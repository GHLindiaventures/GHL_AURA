namespace backend.Models.Entities;

public class PlatformSetting
{
    public int Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? UpdatedBy { get; set; } = "Super Admin";

    // Legacy / Helper maintenance mode properties
    public bool MaintenanceModeEnabled { get; set; } = false;
    public string MaintenanceMessage { get; set; } = "Platform under scheduled maintenance.";
    public string BypassSecret { get; set; } = "nexus-admin-2026";
}
