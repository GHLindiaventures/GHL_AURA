using System.Text.Json;
using backend.Data;
using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace backend.Services.Implementations.Jamin;

/// <summary>Jamin-only lead rules shared by the lead, call and startup code.</summary>
public static class JaminLeadRules
{
    public const int JaminCompanyId = 2;
    public const string JunkStatus = "Junk";
    public const string JunkReasonKey = "junkReason";
    public const string NotInterestedReason = "Not Interested";

    public static bool IsJamin(int? companyId) => companyId == JaminCompanyId;

    /// <summary>Jamin keeps one clean status: a lead that is not interested becomes Junk with the reason "Not Interested".</summary>
    public static bool IsNotInterested(string? status) =>
        string.Equals(status?.Trim(), "Not Interested", StringComparison.OrdinalIgnoreCase);

    public static void SetJunkReason(Lead lead, string reason)
    {
        Dictionary<string, string> cf;
        try
        {
            cf = string.IsNullOrWhiteSpace(lead.CustomFieldsJson)
                ? new Dictionary<string, string>()
                : JsonSerializer.Deserialize<Dictionary<string, string>>(lead.CustomFieldsJson) ?? new Dictionary<string, string>();
        }
        catch
        {
            cf = new Dictionary<string, string>();
        }
        cf[JunkReasonKey] = reason;
        lead.CustomFieldsJson = JsonSerializer.Serialize(cf);
    }

    /// <summary>One-time startup clean-up: existing Jamin "Not Interested" leads become Junk with that reason.</summary>
    public static int MigrateNotInterestedToJunk(ApplicationDbContext db)
    {
        var rows = db.Leads.Where(l => l.CompanyId == JaminCompanyId && l.Status == "Not Interested").ToList();
        foreach (var lead in rows)
        {
            lead.Status = JunkStatus;
            SetJunkReason(lead, NotInterestedReason);
            lead.UpdatedAt = DateTime.UtcNow;
        }
        if (rows.Count > 0) db.SaveChanges();
        return rows.Count;
    }
}
