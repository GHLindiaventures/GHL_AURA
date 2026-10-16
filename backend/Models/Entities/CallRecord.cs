using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models.Entities;

public class CallRecord
{
    public int Id { get; set; }

    public int CompanyId { get; set; }
    public Tenant? Company { get; set; }

    public int AgentId { get; set; }
    public User? Agent { get; set; }

    public string ContactName { get; set; } = string.Empty;
    public string ContactPhone { get; set; } = string.Empty;
    public string Direction { get; set; } = "outbound"; // "inbound" | "outbound"
    public int DurationSeconds { get; set; }

    [NotMapped]
    public int Duration
    {
        get => DurationSeconds;
        set => DurationSeconds = value;
    }

    public string Disposition { get; set; } = string.Empty;
    public string? Notes { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? CallModule { get; set; }

    public string? Reason { get; set; }

    /// <summary>
    /// Twilio Call SID (CAxxxx) assigned by Twilio when a real call is placed.
    /// Null for legacy records or calls that never connected to Twilio.
    /// </summary>
    [MaxLength(64)]
    public string? TwilioCallSid { get; set; }

    /// <summary>
    /// Recording identifier stored as "recording:{RecordingSid}".
    /// The actual audio is served by /api/voice/recordings/{callRecordId}
    /// to avoid exposing Twilio credentials to the browser.
    /// Persisted to the database (was previously [NotMapped]).
    /// </summary>
    [MaxLength(256)]
    public string? RecordingUrl { get; set; }

    /// <summary>
    /// Call transcript text (populated by post-call processing or Twilio Intelligence).
    /// Persisted to the database (was previously [NotMapped]).
    /// </summary>
    public string? Transcript { get; set; }

    public int? LeadId { get; set; }
    public int? CustomerId { get; set; }

    public DateTime StartedAt { get; set; } = DateTime.UtcNow;

    [NotMapped]
    public DateTime Timestamp
    {
        get => StartedAt;
        set => StartedAt = value;
    }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
