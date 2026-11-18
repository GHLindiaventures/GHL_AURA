namespace backend.Models.Entities;

/// <summary>
/// Jamin Bazaar — Land Development Project.
/// Each project contains multiple plots that can be booked by customers.
/// </summary>
public class JaminProject
{
    public int Id { get; set; }

    public int CompanyId { get; set; }
    public Tenant? Company { get; set; }

    /// <summary>Project name, e.g. "Jamin Garden — Shastri Nagar".</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Physical location, e.g. "Old Chennimalai Road, Shastri Nagar, Erode, Tamil Nadu".</summary>
    public string Location { get; set; } = string.Empty;

    /// <summary>Active | Upcoming | Completed | On Hold.</summary>
    public string Status { get; set; } = "Active";

    /// <summary>Marketing description for the project.</summary>
    public string Description { get; set; } = string.Empty;

    public int TotalPlots { get; set; }
    public int AvailablePlots { get; set; }
    public int BookedPlots { get; set; }

    /// <summary>Display string like "₹45 Lakhs - ₹75 Lakhs".</summary>
    public string PriceRange { get; set; } = string.Empty;

    /// <summary>Optional image/brochure URL.</summary>
    public string? ImageUrl { get; set; }

    /// <summary>Approved layout drawing (static image) shown by "View on Layout"; null until one is loaded.</summary>
    public string? LayoutImageUrl { get; set; }

    /// <summary>What to search on the map: a place name ("Varapatty, Sulur, Coimbatore") or exact coordinates ("11.0123, 77.1234").</summary>
    public string? MapQuery { get; set; }

    /// <summary>Version of the layout data last applied by the startup sync, so manual edits are not overwritten on every restart.</summary>
    public string? LayoutVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // Navigation
    public ICollection<JaminPlot> Plots { get; set; } = new List<JaminPlot>();
    public ICollection<JaminBooking> Bookings { get; set; } = new List<JaminBooking>();
    public ICollection<SiteVisit> SiteVisits { get; set; } = new List<SiteVisit>();
}
