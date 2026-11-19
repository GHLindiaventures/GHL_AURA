using backend.Data;
using backend.DTOs.Jamin;
using backend.Models.Entities;
using backend.Models.Enums;
using Microsoft.EntityFrameworkCore;

namespace backend.Services.Implementations.Jamin;

/// <summary>Booking rules shared by the booking endpoint and its tests.</summary>
public static class JaminBookingRules
{
    private static string PhoneKey(string? phone)
    {
        var digits = new string((phone ?? string.Empty).Where(char.IsDigit).ToArray());
        return digits.Length > 10 ? digits[^10..] : digits;
    }

    /// <summary>The booking amount of a plot: its rate per sq.ft x its area (the stored price when no rate is recorded).</summary>
    public static decimal CalculatedPlotAmount(JaminPlot plot)
    {
        if (plot.PricePerSqft > 0 && plot.AreaSqFt > 0) return Math.Round(plot.PricePerSqft * plot.AreaSqFt, 2);
        return plot.Price;
    }

    public static bool IsCash(string? mode) =>
        !string.IsNullOrWhiteSpace(mode) && mode.Contains("cash", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Mandatory details for confirming a booking. Returns what is missing or invalid, by name,
    /// so the form can show exactly which details are incomplete.
    /// </summary>
    public static List<string> MissingBookingDetails(CreateJaminBookingDto dto, decimal totalPrice, bool agentResolved)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(dto.CustomerName)) missing.Add("buyer name");
        if (PhoneKey(dto.CustomerPhone).Length < 10) missing.Add("buyer phone (10 digits)");
        if (!dto.ProjectId.HasValue || dto.ProjectId.Value <= 0) missing.Add("project");
        if (!dto.PlotId.HasValue || dto.PlotId.Value <= 0) missing.Add("plot");
        if (totalPrice <= 0) missing.Add("total agreement value");
        if (dto.TokenAmountPaid <= 0) missing.Add("token amount");
        if (string.IsNullOrWhiteSpace(dto.PaymentMode)) missing.Add("payment mode");
        else if (!IsCash(dto.PaymentMode) && string.IsNullOrWhiteSpace(dto.TransactionReference)) missing.Add("payment reference / transaction id");
        if (!agentResolved) missing.Add("responsible agent");
        return missing;
    }

    /// <summary>The buyer has booked: their pending follow-ups are done and must leave the Follow-ups list.</summary>
    public static async Task<int> CompleteFollowupsForBuyerAsync(
        ApplicationDbContext db, int companyId, int? leadId, int? customerId, string? phone,
        string plotNumber, string projectName, CancellationToken ct)
    {
        var phoneKey = PhoneKey(phone);
        var pending = await db.Followups
            .Where(f => f.CompanyId == companyId && f.Status == FollowupStatus.Pending)
            .ToListAsync(ct);

        var now = DateTime.UtcNow;
        var completed = 0;
        foreach (var f in pending)
        {
            var matches = (leadId.HasValue && f.LeadId == leadId)
                || (customerId.HasValue && f.CustomerId == customerId)
                || (phoneKey.Length >= 10 && PhoneKey(f.ContactPhone) == phoneKey);
            if (!matches) continue;

            f.Status = FollowupStatus.Completed;
            f.CompletedAt = now;
            f.UpdatedAt = now;
            var note = $"Plot {plotNumber} booked ({projectName}).";
            f.OutcomeNotes = string.IsNullOrWhiteSpace(f.OutcomeNotes) ? note : $"{f.OutcomeNotes} | {note}";
            completed++;
        }
        return completed;
    }
}
