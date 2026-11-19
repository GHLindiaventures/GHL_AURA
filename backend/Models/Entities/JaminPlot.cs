namespace backend.Models.Entities;

/// <summary>
/// Jamin Bazaar — Individual plot within a project layout.
/// Tracks dimensions, pricing, availability, and hold status.
/// </summary>
public class JaminPlot
{
    public int Id { get; set; }

    public int CompanyId { get; set; }
    public Tenant? Company { get; set; }

    public int ProjectId { get; set; }
    public JaminProject? Project { get; set; }

    /// <summary>Plot label, e.g. "Plot #14", "Plot #01 (Corner)".</summary>
    public string PlotNumber { get; set; } = string.Empty;

    /// <summary>Dimensions, e.g. "30 x 40".</summary>
    public string Dimensions { get; set; } = "30 x 40";

    /// <summary>Area in square feet.</summary>
    public int AreaSqFt { get; set; } = 1200;

    /// <summary>Area in square metres as printed on the approved area statement (null when not known).</summary>
    public double? AreaSqM { get; set; }

    // Position on the project layout image, as a fraction of the image size (0..1). Null when the plot is not marked.
    public double? LayoutX { get; set; }
    public double? LayoutY { get; set; }
    /// <summary>Width and height of the plot cell on the layout image (fractions), when its outline is known.</summary>
    public double? LayoutW { get; set; }
    public double? LayoutH { get; set; }

    /// <summary>Facing direction, e.g. "East", "North-East".</summary>
    public string Facing { get; set; } = "East";

    /// <summary>Available | Hold | Booked | Registered.</summary>
    public string Status { get; set; } = "Available";

    /// <summary>Plot price in INR.</summary>
    public decimal Price { get; set; }

    /// <summary>Price per square foot in INR.</summary>
    public decimal PricePerSqft { get; set; }

    // Hold tracking
    public int? HeldByCustomerId { get; set; }
    public Customer? HeldByCustomer { get; set; }
    public string? HeldByCustomerName { get; set; }
    public string? HeldByCustomerPhone { get; set; }

    /// <summary>Lead this plot is currently held for (null when held for a customer or a walk-in).</summary>
    public int? HeldByLeadId { get; set; }
    public string? HoldByAgent { get; set; }
    public DateTime? HoldExpiresAt { get; set; }
    /// <summary>Responsible agent, hold amount and payment status of the active hold (full detail is in jamin_plot_holds).</summary>
    public int? HoldAgentId { get; set; }
    public decimal? HoldAmount { get; set; }
    public string? HoldPaymentStatus { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // Navigation
    public ICollection<SiteVisit> SiteVisits { get; set; } = new List<SiteVisit>();
    public ICollection<JaminBooking> Bookings { get; set; } = new List<JaminBooking>();
}
