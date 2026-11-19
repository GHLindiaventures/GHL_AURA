using backend.Data;
using backend.DTOs.Jamin;
using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace backend.Services.Implementations.Jamin;

/// <summary>Who is acting on a hold.</summary>
public record HoldActor(int? Id, string Name, bool IsAdmin);

/// <summary>
/// Plot-hold rules in one place: placing, extending / modifying, payment verification, closing
/// (released / expired / converted to a booking) and the history of each.
/// </summary>
public static class JaminHoldLedger
{
    public const int MaxHoldDays = 30;
    public const string Active = "Active";
    public const string PaymentNone = "None";
    public const string PaymentPending = "Pending Verification";
    public const string PaymentVerified = "Verified";
    public const string PaymentRejected = "Rejected";

    private static string Fmt(DateTime utc) => utc.ToString("yyyy-MM-dd HH:mm") + " UTC";

    private static string PhoneKey(string? phone)
    {
        var digits = new string((phone ?? string.Empty).Where(char.IsDigit).ToArray());
        return digits.Length > 10 ? digits[^10..] : digits;
    }

    private static void AddEvent(JaminPlotHold hold, string type, string text, HoldActor actor, DateTime now,
        DateTime? oldExpiry = null, DateTime? newExpiry = null)
    {
        hold.Events.Add(new JaminPlotHoldEvent
        {
            EventType = type, Description = text.Length > 480 ? text[..480] : text,
            OldExpiresAt = oldExpiry, NewExpiresAt = newExpiry,
            ActorId = actor.Id, ActorName = actor.Name, CreatedAt = now
        });
    }

    private static void ClearPlotHold(JaminPlot plot, DateTime now)
    {
        plot.Status = "Available";
        plot.HeldByCustomerId = null; plot.HeldByLeadId = null;
        plot.HeldByCustomerName = null; plot.HeldByCustomerPhone = null;
        plot.HoldByAgent = null; plot.HoldExpiresAt = null;
        plot.HoldAgentId = null; plot.HoldAmount = null; plot.HoldPaymentStatus = null;
        plot.UpdatedAt = now;
    }

    public static Task<JaminPlotHold?> GetActiveAsync(ApplicationDbContext db, int plotId, CancellationToken ct) =>
        db.JaminPlotHolds.Include(h => h.Events)
            .Where(h => h.PlotId == plotId && h.Status == Active)
            .OrderByDescending(h => h.Id).FirstOrDefaultAsync(ct);

    /// <summary>The hold's responsible agent or an admin. A legacy hold with no ledger row can be handled by any agent.</summary>
    public static bool CanManage(JaminPlotHold? hold, HoldActor actor) =>
        actor.IsAdmin || hold == null || (actor.Id.HasValue && hold.AgentId == actor.Id.Value);

    /// <summary>Is this person the buyer the hold is for (matched by lead, customer or phone)?</summary>
    public static bool IsHolder(JaminPlot plot, int? leadId, int? customerId, string? phone)
    {
        if (leadId.HasValue && plot.HeldByLeadId == leadId) return true;
        if (customerId.HasValue && plot.HeldByCustomerId == customerId) return true;
        var key = PhoneKey(phone);
        return key.Length >= 10 && PhoneKey(plot.HeldByCustomerPhone) == key;
    }

    // ── Place ───────────────────────────────────────────────────────────────

    public static async Task<(string? Error, JaminPlotHold? Hold)> PlaceAsync(
        ApplicationDbContext db, JaminPlot plot, HoldPlotRequestDto dto, HoldActor actor, DateTime now, CancellationToken ct)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(dto.CustomerName)) missing.Add("customer name");
        if (string.IsNullOrWhiteSpace(dto.CustomerPhone)) missing.Add("customer phone");

        DateTime expiresAt;
        var explicitExpiry = dto.ExpiresAt ?? dto.HoldUntil;   // HoldUntil: older clients
        if (explicitExpiry.HasValue) expiresAt = DateTime.SpecifyKind(explicitExpiry.Value, DateTimeKind.Utc).ToUniversalTime();
        else if (dto.HoldDays is >= 1 and <= MaxHoldDays) expiresAt = now.AddDays(dto.HoldDays);
        else { expiresAt = default; missing.Add("hold expiry date and time"); }

        var amount = dto.AmountPaid ?? 0m;
        if (amount < 0) return ("The hold amount cannot be negative.", null);
        if (amount > 0)
        {
            if (string.IsNullOrWhiteSpace(dto.PaymentMode)) missing.Add("payment mode");
            if (string.IsNullOrWhiteSpace(dto.PaymentReference)) missing.Add("payment reference / transaction id");
        }
        if (missing.Count > 0) return ($"Missing required hold details: {string.Join(", ", missing)}.", null);

        if (expiresAt <= now.AddMinutes(1)) return ("The hold expiry must be in the future.", null);
        if (expiresAt > now.AddDays(MaxHoldDays)) return ($"A hold cannot be longer than {MaxHoldDays} days.", null);

        if (plot.Status != "Available") return ("Only available plots can be placed on hold.", null);

        // An agent may hold only for their own leads / customers; admins for anyone.
        if (!actor.IsAdmin)
        {
            if (dto.HeldByLeadId.HasValue)
            {
                var ownLead = await db.Leads.AsNoTracking().AnyAsync(l => l.Id == dto.HeldByLeadId.Value && l.CompanyId == plot.CompanyId && l.AssignedAgentId == actor.Id, ct);
                if (!ownLead) return ("You can hold plots only for leads assigned to you.", null);
            }
            if (dto.HeldByCustomerId.HasValue)
            {
                var ownCust = await db.Customers.AsNoTracking().AnyAsync(c => c.Id == dto.HeldByCustomerId.Value && c.CompanyId == plot.CompanyId && c.AssignedAgentId == actor.Id, ct);
                if (!ownCust) return ("You can hold plots only for customers assigned to you.", null);
            }
        }
        else if (dto.HeldByLeadId.HasValue && !await db.Leads.AsNoTracking().AnyAsync(l => l.Id == dto.HeldByLeadId.Value && l.CompanyId == plot.CompanyId, ct))
            return ("Lead not found.", null);

        // The responsible agent: the caller, or (admin only) a chosen Jamin agent.
        int? agentId = actor.Id; string agentName = actor.Name;
        if (actor.IsAdmin && dto.HoldByAgentId.HasValue && dto.HoldByAgentId.Value > 0)
        {
            var agent = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == dto.HoldByAgentId.Value && u.CompanyId == plot.CompanyId, ct);
            if (agent == null) return ("The selected hold agent does not belong to Jamin.", null);
            agentId = agent.Id; agentName = agent.Name;
        }
        else if (!string.IsNullOrWhiteSpace(dto.HoldByAgent) && actor.IsAdmin) agentName = dto.HoldByAgent.Trim();

        var hold = new JaminPlotHold
        {
            CompanyId = plot.CompanyId, PlotId = plot.Id, ProjectId = plot.ProjectId,
            LeadId = dto.HeldByLeadId, CustomerId = dto.HeldByCustomerId,
            CustomerName = dto.CustomerName.Trim(), CustomerPhone = dto.CustomerPhone.Trim(),
            AgentId = agentId, AgentName = agentName,
            HoldStartAt = now, ExpiresAt = expiresAt, Reason = dto.Notes?.Trim(),
            Amount = amount,
            PaymentMode = amount > 0 ? dto.PaymentMode!.Trim() : null,
            PaymentReference = amount > 0 ? dto.PaymentReference!.Trim() : null,
            PaymentDate = amount > 0 ? (dto.PaymentDate ?? now) : null,
            PaymentProofUrl = amount > 0 ? dto.PaymentProofUrl?.Trim() : null,
            PaymentStatus = amount > 0 ? PaymentPending : PaymentNone,
            Status = Active, CreatedAt = now
        };
        AddEvent(hold, "Placed", $"Hold placed for {hold.CustomerName} until {Fmt(expiresAt)} by {actor.Name}.", actor, now, null, expiresAt);
        if (amount > 0)
            AddEvent(hold, "PaymentRecorded", $"Hold payment of {amount:N0} recorded ({hold.PaymentMode}, ref {hold.PaymentReference}); awaiting finance verification.", actor, now);
        db.JaminPlotHolds.Add(hold);

        plot.Status = "Hold";
        plot.HeldByLeadId = dto.HeldByLeadId; plot.HeldByCustomerId = dto.HeldByCustomerId;
        plot.HeldByCustomerName = hold.CustomerName; plot.HeldByCustomerPhone = hold.CustomerPhone;
        plot.HoldByAgent = agentName; plot.HoldAgentId = agentId;
        plot.HoldExpiresAt = expiresAt;
        plot.HoldAmount = amount > 0 ? amount : null; plot.HoldPaymentStatus = hold.PaymentStatus;
        plot.UpdatedAt = now;
        return (null, hold);
    }

    // ── Extend / modify ─────────────────────────────────────────────────────

    public static async Task<string?> ExtendAsync(
        ApplicationDbContext db, JaminPlot plot, ExtendHoldRequestDto dto, HoldActor actor, DateTime now, CancellationToken ct)
    {
        if (plot.Status != "Hold" || !plot.HoldExpiresAt.HasValue) return "This plot is not on hold.";
        if (plot.HoldExpiresAt.Value <= now) return "This hold has already expired.";

        var hold = await GetActiveAsync(db, plot.Id, ct);
        if (!CanManage(hold, actor)) return "Only the agent responsible for this hold (or an admin) can change it.";

        DateTime newExpiry;
        if (dto.NewExpiresAt.HasValue) newExpiry = DateTime.SpecifyKind(dto.NewExpiresAt.Value, DateTimeKind.Utc).ToUniversalTime();
        else if (dto.AddDays is >= 1 and <= MaxHoldDays) newExpiry = plot.HoldExpiresAt.Value.AddDays(dto.AddDays.Value);
        else return "Choose a new expiry date and time (or the number of days to add).";

        if (newExpiry <= now.AddMinutes(1)) return "The new expiry must be in the future.";
        if (newExpiry > now.AddDays(MaxHoldDays)) return $"A hold cannot run longer than {MaxHoldDays} days from today.";
        if (newExpiry == plot.HoldExpiresAt.Value) return "That is already the hold expiry.";

        var old = plot.HoldExpiresAt.Value;
        var extended = newExpiry > old;
        plot.HoldExpiresAt = newExpiry;
        plot.UpdatedAt = now;
        if (hold != null)
        {
            hold.ExpiresAt = newExpiry; hold.UpdatedAt = now;
            if (extended) hold.ExtensionCount++;
            var why = string.IsNullOrWhiteSpace(dto.Reason) ? string.Empty : $" Reason: {dto.Reason.Trim()}";
            AddEvent(hold, extended ? "Extended" : "Modified",
                $"Hold {(extended ? "extended" : "shortened")} from {Fmt(old)} to {Fmt(newExpiry)} by {actor.Name}.{why}", actor, now, old, newExpiry);
        }
        return null;
    }

    // ── Payment verification ────────────────────────────────────────────────

    public static async Task<string?> VerifyPaymentAsync(
        ApplicationDbContext db, JaminPlot plot, bool approve, string? notes, HoldActor actor, DateTime now, CancellationToken ct)
    {
        if (!actor.IsAdmin) return "Only finance / admin users can verify a hold payment.";
        var hold = await GetActiveAsync(db, plot.Id, ct);
        if (hold == null || plot.Status != "Hold") return "This plot has no active hold.";
        if (hold.PaymentStatus != PaymentPending) return "There is no hold payment waiting for verification.";

        hold.PaymentStatus = approve ? PaymentVerified : PaymentRejected;
        hold.VerifiedById = actor.Id; hold.VerifiedByName = actor.Name; hold.VerifiedAt = now;
        hold.VerificationNotes = notes?.Trim(); hold.UpdatedAt = now;
        plot.HoldPaymentStatus = hold.PaymentStatus; plot.UpdatedAt = now;
        AddEvent(hold, approve ? "PaymentVerified" : "PaymentRejected",
            approve ? $"Hold payment verified by {actor.Name}; hold confirmed." : $"Hold payment rejected by {actor.Name}; the hold stays unconfirmed and will expire on schedule.", actor, now);
        return null;
    }

    // ── Closing ─────────────────────────────────────────────────────────────

    /// <summary>Closes the plot's active hold row (Released / Expired / Converted) and logs it.</summary>
    public static async Task CloseActiveAsync(ApplicationDbContext db, int plotId, string closedStatus, HoldActor actor, DateTime now, string? note, CancellationToken ct)
    {
        var rows = await db.JaminPlotHolds.Include(h => h.Events)
            .Where(h => h.PlotId == plotId && h.Status == Active).ToListAsync(ct);
        foreach (var hold in rows)
        {
            hold.Status = closedStatus; hold.ClosedAt = now; hold.ClosedByName = actor.Name; hold.UpdatedAt = now;
            var text = closedStatus switch
            {
                "Released" => $"Hold released by {actor.Name}.",
                "Expired" => "Hold expired and the plot returned to Available.",
                "Converted" => $"Hold converted to a booking by {actor.Name}.",
                _ => $"Hold {closedStatus}."
            };
            AddEvent(hold, closedStatus, string.IsNullOrWhiteSpace(note) ? text : $"{text} {note}", actor, now);
        }
    }

    /// <summary>Returns an expired hold's plot to Available - never a plot that was booked or changed in the meantime.</summary>
    public static async Task<bool> ExpireIfDueAsync(ApplicationDbContext db, JaminPlot plot, DateTime now, CancellationToken ct)
    {
        if (plot.Status != "Hold" || !plot.HoldExpiresAt.HasValue || plot.HoldExpiresAt.Value > now) return false;
        await CloseActiveAsync(db, plot.Id, "Expired", new HoldActor(null, "System", false), now, null, ct);
        ClearPlotHold(plot, now);
        return true;
    }

    public static void ReleasePlot(JaminPlot plot, DateTime now) => ClearPlotHold(plot, now);

    // ── History ─────────────────────────────────────────────────────────────

    public static async Task<List<PlotHoldDto>> HistoryAsync(ApplicationDbContext db, int plotId, int companyId, CancellationToken ct)
    {
        var rows = await db.JaminPlotHolds.AsNoTracking().Include(h => h.Events)
            .Where(h => h.PlotId == plotId && h.CompanyId == companyId)
            .OrderByDescending(h => h.Id).ToListAsync(ct);
        return rows.Select(h => new PlotHoldDto
        {
            Id = h.Id, PlotId = h.PlotId, LeadId = h.LeadId, CustomerId = h.CustomerId,
            CustomerName = h.CustomerName, CustomerPhone = h.CustomerPhone, AgentId = h.AgentId, AgentName = h.AgentName,
            HoldStartAt = h.HoldStartAt, ExpiresAt = h.ExpiresAt, ExtensionCount = h.ExtensionCount, Reason = h.Reason,
            Amount = h.Amount, PaymentMode = h.PaymentMode, PaymentReference = h.PaymentReference, PaymentDate = h.PaymentDate,
            PaymentProofUrl = h.PaymentProofUrl, PaymentStatus = h.PaymentStatus, Confirmed = h.PaymentStatus == PaymentVerified,
            VerifiedByName = h.VerifiedByName, VerifiedAt = h.VerifiedAt, VerificationNotes = h.VerificationNotes,
            Status = h.Status, ClosedAt = h.ClosedAt, ClosedByName = h.ClosedByName,
            Events = h.Events.OrderBy(e => e.CreatedAt).ThenBy(e => e.Id).Select(e => new PlotHoldEventDto
            {
                Id = e.Id, EventType = e.EventType, Description = e.Description,
                OldExpiresAt = e.OldExpiresAt, NewExpiresAt = e.NewExpiresAt, ActorName = e.ActorName, CreatedAt = e.CreatedAt
            }).ToList()
        }).ToList();
    }
}
