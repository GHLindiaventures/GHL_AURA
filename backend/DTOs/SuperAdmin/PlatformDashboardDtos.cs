namespace backend.DTOs.SuperAdmin;

public class FleetCompanyStatDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Status { get; set; } = "Active";
    public string BrandColor { get; set; } = "#0284c7";
    public string SubscriptionPlan { get; set; } = string.Empty;
    public int UsersCount { get; set; }
    public int ActiveUsersCount { get; set; }
    public int TotalLeads { get; set; }
    public int CallsToday { get; set; }
    public decimal PipelineValue { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
}
