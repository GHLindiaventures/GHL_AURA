namespace backend.Models.Entities;

/// <summary>
/// A plot a customer will see on a site visit. A visit can cover several plots when the customer's
/// requirement fits more than one. <see cref="SiteVisit.PlotId"/> keeps the first one for older readers.
/// </summary>
public class SiteVisitPlot
{
    public int Id { get; set; }

    public int SiteVisitId { get; set; }
    public SiteVisit? SiteVisit { get; set; }

    public int PlotId { get; set; }
    public JaminPlot? Plot { get; set; }

    /// <summary>Plot label copied at scheduling time, e.g. "Plot #113".</summary>
    public string PlotNumber { get; set; } = string.Empty;
}
