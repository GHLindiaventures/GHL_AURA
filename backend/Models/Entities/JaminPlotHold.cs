namespace backend.Models.Entities;

/// <summary>One plot hold: who it is for, who is responsible, until when, and the hold payment.</summary>
public class JaminPlotHold
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public int PlotId { get; set; }
    public JaminPlot? Plot { get; set; }
    public int ProjectId { get; set; }

    public int? LeadId { get; set; }
    public int? CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;

    /// <summary>The agent responsible for the hold (the only agent besides admins who may extend or release it).</summary>
    public int? AgentId { get; set; }
    public string? AgentName { get; set; }

    public DateTime HoldStartAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public int ExtensionCount { get; set; }
    public string? Reason { get; set; }

    /// <summary>Hold / advance amount, 0 when no payment was taken.</summary>
    public decimal Amount { get; set; }
    public string? PaymentMode { get; set; }
    public string? PaymentReference { get; set; }
    public DateTime? PaymentDate { get; set; }
    public string? PaymentProofUrl { get; set; }
    /// <summary>None | Pending Verification | Verified | Rejected</summary>
    public string PaymentStatus { get; set; } = "None";
    public int? VerifiedById { get; set; }
    public string? VerifiedByName { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public string? VerificationNotes { get; set; }

    /// <summary>Active | Released | Expired | Converted (to a booking)</summary>
    public string Status { get; set; } = "Active";
    public DateTime? ClosedAt { get; set; }
    public string? ClosedByName { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<JaminPlotHoldEvent> Events { get; set; } = new List<JaminPlotHoldEvent>();
}

/// <summary>Timeline entry of a hold: placed, extended, payment recorded / verified / rejected, released, expired, converted.</summary>
public class JaminPlotHoldEvent
{
    public int Id { get; set; }
    public int HoldId { get; set; }
    public JaminPlotHold? Hold { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime? OldExpiresAt { get; set; }
    public DateTime? NewExpiresAt { get; set; }
    public int? ActorId { get; set; }
    public string? ActorName { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
