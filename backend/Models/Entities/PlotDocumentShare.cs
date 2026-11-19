namespace backend.Models.Entities;

/// <summary>
/// Jamin Bazaar — a document pack (project legal documents + plot documents + cost sheet)
/// shared with a customer while a plot is on hold, so they / their lawyer / their bank can
/// verify the property. Opened through a secret, expiring link.
/// </summary>
public class PlotDocumentShare
{
    public int Id { get; set; }
    public int CompanyId { get; set; }

    public int PlotId { get; set; }
    public JaminPlot? Plot { get; set; }
    public int ProjectId { get; set; }

    public int? LeadId { get; set; }
    public int? CustomerId { get; set; }

    public string RecipientName { get; set; } = string.Empty;
    public string RecipientPhone { get; set; } = string.Empty;
    public string? RecipientEmail { get; set; }

    /// <summary>whatsapp | email | link</summary>
    public string Channel { get; set; } = "link";

    /// <summary>Unguessable token used in the public link.</summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>JSON array of shared document ids (documents table).</summary>
    public string DocumentIdsJson { get; set; } = "[]";
    public bool IncludeCostSheet { get; set; } = true;
    public string? Message { get; set; }

    public int? SharedById { get; set; }
    public string SharedByName { get; set; } = string.Empty;
    public DateTime SharedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }

    public DateTime? FirstViewedAt { get; set; }
    public DateTime? LastViewedAt { get; set; }
    public int ViewCount { get; set; }

    /// <summary>Shared | Viewed | Under Verification | Queries Raised | Verified | Revoked</summary>
    public string Status { get; set; } = "Shared";
    public string? StatusNote { get; set; }
    public DateTime? StatusUpdatedAt { get; set; }
    public string? StatusUpdatedByName { get; set; }
}
