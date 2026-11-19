namespace backend.DTOs.Jamin;

public class PackDocumentDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Size { get; set; } = string.Empty;
    /// <summary>"project" (layout-level) or "plot" (plot-specific).</summary>
    public string Scope { get; set; } = "project";
    public string? FileUrl { get; set; }
    public string UploadedAt { get; set; } = string.Empty;
}

public class CreatePlotDocumentShareDto
{
    public int PlotId { get; set; }
    public int? LeadId { get; set; }
    public int? CustomerId { get; set; }
    public string RecipientName { get; set; } = string.Empty;
    public string RecipientPhone { get; set; } = string.Empty;
    public string? RecipientEmail { get; set; }
    public string Channel { get; set; } = "link";
    public List<int> DocumentIds { get; set; } = new();
    public bool IncludeCostSheet { get; set; } = true;
    public string? Message { get; set; }
    /// <summary>Optional link expiry; defaults to the plot's hold expiry (or 7 days).</summary>
    public DateTime? ExpiresAt { get; set; }
}

public class UpdatePlotDocumentShareStatusDto
{
    public string Status { get; set; } = string.Empty;
    public string? Note { get; set; }
}

public class PlotDocumentShareDto
{
    public int Id { get; set; }
    public int PlotId { get; set; }
    public string PlotNumber { get; set; } = string.Empty;
    public int ProjectId { get; set; }
    public int? LeadId { get; set; }
    public int? CustomerId { get; set; }
    public string RecipientName { get; set; } = string.Empty;
    public string RecipientPhone { get; set; } = string.Empty;
    public string? RecipientEmail { get; set; }
    public string Channel { get; set; } = "link";
    public string Token { get; set; } = string.Empty;
    public string SharePath { get; set; } = string.Empty;
    public List<int> DocumentIds { get; set; } = new();
    public int DocumentCount { get; set; }
    public bool IncludeCostSheet { get; set; }
    public string? Message { get; set; }
    public string SharedByName { get; set; } = string.Empty;
    public DateTime SharedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool IsExpired { get; set; }
    public DateTime? FirstViewedAt { get; set; }
    public DateTime? LastViewedAt { get; set; }
    public int ViewCount { get; set; }
    public string Status { get; set; } = "Shared";
    public string? StatusNote { get; set; }
    public DateTime? StatusUpdatedAt { get; set; }
    public string? StatusUpdatedByName { get; set; }
}

public class PublicCostSheetDto
{
    public decimal PlotPrice { get; set; }
    public decimal PricePerSqft { get; set; }
    public int AreaSqFt { get; set; }
    public decimal StampDutyEstimate { get; set; }
    public decimal RegistrationFeeEstimate { get; set; }
    public decimal TotalEstimate { get; set; }
    public string Note { get; set; } = string.Empty;
}

public class PublicDocumentPackDto
{
    public string CompanyName { get; set; } = "Jamin Bazaar";
    public string RecipientName { get; set; } = string.Empty;
    public string ProjectName { get; set; } = string.Empty;
    public string ProjectLocation { get; set; } = string.Empty;
    public string PlotNumber { get; set; } = string.Empty;
    public string Dimensions { get; set; } = string.Empty;
    public int AreaSqFt { get; set; }
    public string Facing { get; set; } = string.Empty;
    public string PlotStatus { get; set; } = string.Empty;
    public DateTime? HoldExpiresAt { get; set; }
    public string SharedByName { get; set; } = string.Empty;
    public DateTime SharedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public string? Message { get; set; }
    public PublicCostSheetDto? CostSheet { get; set; }
    public List<PackDocumentDto> Documents { get; set; } = new();
}
