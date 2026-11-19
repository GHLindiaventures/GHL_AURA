namespace backend.DTOs.Jamin;

// ── Response DTOs ────────────────────────────────────────────────────────────

public class JaminPlotResponseDto
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public int ProjectId { get; set; }
    public string PlotNumber { get; set; } = string.Empty;
    public string Dimensions { get; set; } = "30 x 40";
    public int AreaSqFt { get; set; }
    public double? AreaSqM { get; set; }
    public double? LayoutX { get; set; }
    public double? LayoutY { get; set; }
    public double? LayoutW { get; set; }
    public double? LayoutH { get; set; }
    public string Facing { get; set; } = "East";
    public string Status { get; set; } = "Available";
    public decimal Price { get; set; }
    public decimal PricePerSqft { get; set; }
    public int? HeldByCustomerId { get; set; }
    public string? HeldByCustomerName { get; set; }
    public string? HeldByCustomerPhone { get; set; }
    public int? HeldByLeadId { get; set; }
    public string? HoldByAgent { get; set; }
    public DateTime? HoldExpiresAt { get; set; }
    public int? HoldAgentId { get; set; }
    public decimal? HoldAmount { get; set; }
    /// <summary>None | Pending Verification | Verified | Rejected</summary>
    public string? HoldPaymentStatus { get; set; }
    /// <summary>True once finance has verified the hold payment.</summary>
    public bool HoldConfirmed { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

public class CreateJaminPlotDto
{
    public int ProjectId { get; set; }
    public string PlotNumber { get; set; } = string.Empty;
    public string? Dimensions { get; set; } = "30 x 40";
    public int AreaSqFt { get; set; } = 1200;
    public string? Facing { get; set; } = "East";
    public decimal Price { get; set; }
    public decimal? PricePerSqft { get; set; }
    public string? Notes { get; set; }
}

public class HoldPlotRequestDto
{
    public int? HeldByCustomerId { get; set; }
    public int? HeldByLeadId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string? HoldByAgent { get; set; }
    /// <summary>Admin only: the agent responsible for the hold (defaults to the caller).</summary>
    public int? HoldByAgentId { get; set; }
    public int HoldDays { get; set; } = 7;
    /// <summary>Exact hold expiry (UTC). Takes precedence over <see cref="HoldDays"/>.</summary>
    public DateTime? ExpiresAt { get; set; }
    /// <summary>Hold / advance amount taken, if any.</summary>
    public decimal? AmountPaid { get; set; }
    public string? PaymentMode { get; set; }
    public string? PaymentReference { get; set; }
    public DateTime? PaymentDate { get; set; }
    public string? PaymentProofUrl { get; set; }
    /// <summary>Reason / additional notes.</summary>
    public string? Notes { get; set; }
}

public class ExtendHoldRequestDto
{
    public DateTime? NewExpiresAt { get; set; }
    public int? AddDays { get; set; }
    public string? Reason { get; set; }
}

public class VerifyHoldPaymentRequestDto
{
    public bool Approve { get; set; } = true;
    public string? Notes { get; set; }
}

public class PlotHoldEventDto
{
    public int Id { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime? OldExpiresAt { get; set; }
    public DateTime? NewExpiresAt { get; set; }
    public string? ActorName { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class PlotHoldDto
{
    public int Id { get; set; }
    public int PlotId { get; set; }
    public int? LeadId { get; set; }
    public int? CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public int? AgentId { get; set; }
    public string? AgentName { get; set; }
    public DateTime HoldStartAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public int ExtensionCount { get; set; }
    public string? Reason { get; set; }
    public decimal Amount { get; set; }
    public string? PaymentMode { get; set; }
    public string? PaymentReference { get; set; }
    public DateTime? PaymentDate { get; set; }
    public string? PaymentProofUrl { get; set; }
    public string PaymentStatus { get; set; } = "None";
    public bool Confirmed { get; set; }
    public string? VerifiedByName { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public string? VerificationNotes { get; set; }
    public string Status { get; set; } = "Active";
    public DateTime? ClosedAt { get; set; }
    public string? ClosedByName { get; set; }
    public List<PlotHoldEventDto> Events { get; set; } = new();
}

public class UpdateJaminPlotDto
{
    public string? PlotNumber { get; set; }
    public string? Dimensions { get; set; }
    public int? AreaSqFt { get; set; }
    public string? Facing { get; set; }
    public string? Status { get; set; }
    public decimal? Price { get; set; }
    public decimal? PricePerSqft { get; set; }
    public int? HeldByCustomerId { get; set; }
    public string? HeldByCustomerName { get; set; }
    public string? HeldByCustomerPhone { get; set; }
    public string? HoldByAgent { get; set; }
    public string? Notes { get; set; }
}

/// <summary>A plot a lead has shown interest in (held, booked, or planned for a site visit).</summary>
public class LeadPlotSelectionDto
{
    public int PlotId { get; set; }
    public int ProjectId { get; set; }
    public string? ProjectName { get; set; }
    public string PlotNumber { get; set; } = string.Empty;
    public string Facing { get; set; } = string.Empty;
    public int AreaSqFt { get; set; }
    public double? AreaSqM { get; set; }
    public double? LayoutX { get; set; }
    public double? LayoutY { get; set; }
    public double? LayoutW { get; set; }
    public double? LayoutH { get; set; }
    public decimal Price { get; set; }
    public string PlotStatus { get; set; } = string.Empty;

    /// <summary>Hold | Booking | SiteVisit.</summary>
    public string Source { get; set; } = string.Empty;
    public string SourceStatus { get; set; } = string.Empty;
    public DateTime? HoldExpiresAt { get; set; }
    public DateTime? SelectedAt { get; set; }
}
