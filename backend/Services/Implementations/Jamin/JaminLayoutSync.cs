using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using backend.Data;
using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace backend.Services.Implementations.Jamin;

/// <summary>
/// Loads the approved layout data (areas from the area statements, layout image, plot positions on the image)
/// from <c>Data/JaminLayouts/*.json</c> into the Jamin projects and plots.
/// Each file carries a version; a project is only touched when its stored version differs, so edits made in the
/// app are not overwritten on every restart. Booked, held and sold plots keep their status and price.
/// </summary>
public static class JaminLayoutSync
{
    private const int JaminTenantId = 2;

    public sealed class LayoutFile
    {
        public string Key { get; set; } = string.Empty;
        public string Version { get; set; } = string.Empty;
        public string NameContains { get; set; } = string.Empty;
        public ProjectInfo? Project { get; set; }
        public string? LayoutImageUrl { get; set; }
        public string? MapQuery { get; set; }
        public string? Description { get; set; }
        public List<PlotInfo> Plots { get; set; } = new();
    }

    public sealed class ProjectInfo
    {
        public string Name { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;
        public string Status { get; set; } = "Upcoming";
    }

    public sealed class PlotInfo
    {
        public string N { get; set; } = string.Empty;
        public double? Sqm { get; set; }
        public int? Sqft { get; set; }
        public string? Dim { get; set; }
        /// <summary>Facing derived from the road the plot fronts on the drawing (the documents print none).</summary>
        public string? Facing { get; set; }
        /// <summary>Optional note, e.g. that the plot is also a corner plot.</summary>
        public string? Note { get; set; }
        public double? X { get; set; }
        public double? Y { get; set; }
        public double? W { get; set; }
        public double? H { get; set; }
    }

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static List<LayoutFile> LoadFiles(string directory)
    {
        var result = new List<LayoutFile>();
        if (!Directory.Exists(directory)) return result;
        foreach (var path in Directory.GetFiles(directory, "*.json").OrderBy(p => p))
        {
            var file = JsonSerializer.Deserialize<LayoutFile>(File.ReadAllText(path), JsonOptions);
            if (file != null && !string.IsNullOrWhiteSpace(file.NameContains)) result.Add(file);
        }
        return result;
    }

    /// <summary>Applies every layout file. Returns one human-readable line per project that changed.</summary>
    public static List<string> Apply(ApplicationDbContext db, IEnumerable<LayoutFile> files)
    {
        var log = new List<string>();
        foreach (var file in files)
        {
            var project = db.JaminProjects.FirstOrDefault(p => p.CompanyId == JaminTenantId && p.Name.Contains(file.NameContains));
            if (project == null)
            {
                if (file.Project == null) { log.Add($"{file.Key}: project not found and no definition to create it, skipped."); continue; }
                project = new JaminProject
                {
                    CompanyId = JaminTenantId, Name = file.Project.Name, Location = file.Project.Location,
                    Status = file.Project.Status, Description = file.Description ?? string.Empty, PriceRange = string.Empty,
                    CreatedAt = DateTime.UtcNow
                };
                db.JaminProjects.Add(project);
                db.SaveChanges();
            }
            // The map search text is filled in once and never overwritten, whatever the layout version
            // (an admin may later replace it with exact coordinates).
            if (string.IsNullOrWhiteSpace(project.MapQuery) && !string.IsNullOrWhiteSpace(file.MapQuery))
            {
                project.MapQuery = file.MapQuery;
                db.SaveChanges();
            }

            if (string.Equals(project.LayoutVersion, file.Version, StringComparison.Ordinal)) continue;

            log.Add(ApplyOne(db, project, file));
        }
        return log;
    }

    private static string ApplyOne(ApplicationDbContext db, JaminProject project, LayoutFile file)
    {
        var plots = db.JaminPlots.Where(p => p.ProjectId == project.Id && p.CompanyId == JaminTenantId).ToList();
        var byNumber = new Dictionary<int, JaminPlot>();
        foreach (var p in plots)
            if (TryNumber(p.PlotNumber, out var n) && !byNumber.ContainsKey(n)) byNumber[n] = p;

        var useWord = plots.Count == 0 || plots.Any(p => p.PlotNumber.StartsWith("Plot", StringComparison.OrdinalIgnoreCase));
        var rates = plots.Where(p => p.PricePerSqft > 0).Select(p => p.PricePerSqft).OrderBy(r => r).ToList();
        var defaultRate = rates.Count > 0 ? rates[rates.Count / 2] : 0m;

        int updated = 0, added = 0, removed = 0, kept = 0;
        var docNumbers = new HashSet<int>();

        foreach (var info in file.Plots)
        {
            if (!TryNumber(info.N, out var number)) continue;
            docNumbers.Add(number);

            var sqft = info.Sqft ?? (info.Sqm.HasValue ? (int?)Math.Round(info.Sqm.Value * 10.7639) : null);
            if (!byNumber.TryGetValue(number, out var plot))
            {
                plot = new JaminPlot
                {
                    CompanyId = JaminTenantId, ProjectId = project.Id,
                    PlotNumber = useWord ? $"Plot {number}" : number.ToString(CultureInfo.InvariantCulture),
                    Status = "Available", Facing = string.Empty, Dimensions = string.Empty,
                    PricePerSqft = defaultRate, CreatedAt = DateTime.UtcNow
                };
                db.JaminPlots.Add(plot);
                plots.Add(plot);
                byNumber[number] = plot;
                added++;
            }
            else updated++;

            if (sqft.HasValue) plot.AreaSqFt = sqft.Value;
            plot.AreaSqM = info.Sqm;
            plot.LayoutX = info.X; plot.LayoutY = info.Y; plot.LayoutW = info.W; plot.LayoutH = info.H;

            // Placeholder values from the old demo seed (formula sizes, invented facing/notes) are cleared;
            // anything an admin typed is kept.
            if (!string.IsNullOrWhiteSpace(info.Dim)) plot.Dimensions = info.Dim!;
            else if (IsPlaceholderDimension(plot.Dimensions)) plot.Dimensions = string.Empty;
            if (IsPlaceholderFacing(plot.Facing, number)) plot.Facing = string.Empty;
            if (IsPlaceholderNote(plot.Notes)) plot.Notes = null;

            // Derived facing / corner note fill blanks only, so anything an admin entered stays.
            if (!string.IsNullOrWhiteSpace(info.Facing) && string.IsNullOrWhiteSpace(plot.Facing)) plot.Facing = info.Facing!;
            if (!string.IsNullOrWhiteSpace(info.Note) && string.IsNullOrWhiteSpace(plot.Notes)) plot.Notes = info.Note;

            if (plot.Status == "Available" && plot.PricePerSqft > 0 && plot.AreaSqFt > 0)
                plot.Price = Math.Round(plot.AreaSqFt * plot.PricePerSqft);
            plot.UpdatedAt = DateTime.UtcNow;
        }

        // Plots in the app that are not on the approved layout: remove only when nothing depends on them.
        foreach (var plot in plots.Where(p => TryNumber(p.PlotNumber, out var n) && !docNumbers.Contains(n)).ToList())
        {
            var inUse = plot.Id > 0 && (
                plot.Status != "Available" ||
                db.JaminBookings.Any(b => b.PlotId == plot.Id) ||
                db.SiteVisits.Any(s => s.PlotId == plot.Id) ||
                db.SiteVisitPlots.Any(vp => vp.PlotId == plot.Id));
            if (inUse) { kept++; continue; }
            if (plot.Id > 0) db.JaminPlots.Remove(plot);
            else db.JaminPlots.Local.Remove(plot);
            plots.Remove(plot);
            removed++;
        }

        // Project summary
        if (!string.IsNullOrWhiteSpace(file.LayoutImageUrl)) project.LayoutImageUrl = file.LayoutImageUrl;
        if (!string.IsNullOrWhiteSpace(file.Description)) project.Description = file.Description!;
        project.TotalPlots = plots.Count;
        project.AvailablePlots = plots.Count(p => p.Status == "Available");
        project.BookedPlots = plots.Count(p => p.Status is "Booked" or "Registered" or "Sold");
        var priced = plots.Where(p => p.Price > 0).Select(p => p.Price).ToList();
        if (priced.Count > 0)
            project.PriceRange = $"₹{(priced.Min() / 100000m).ToString("0.#", CultureInfo.InvariantCulture)} Lakhs - ₹{(priced.Max() / 100000m).ToString("0.#", CultureInfo.InvariantCulture)} Lakhs";
        project.LayoutVersion = file.Version;
        project.UpdatedAt = DateTime.UtcNow;
        db.SaveChanges();

        return $"{project.Name}: layout v{file.Version} applied — {updated} plots updated, {added} added, {removed} removed" +
               (kept > 0 ? $", {kept} extra plot(s) kept because they are booked/held or have visits" : string.Empty) + ".";
    }

    private static bool TryNumber(string? text, out int number)
    {
        number = 0;
        if (string.IsNullOrWhiteSpace(text)) return false;
        var m = Regex.Match(text, @"\d+");
        return m.Success && int.TryParse(m.Value, out number);
    }

    private static bool IsPlaceholderDimension(string? d) =>
        string.IsNullOrWhiteSpace(d) || Regex.IsMatch(d.Trim(), @"^\d+(\.\d+)?\s*x\s*\d+(\.\d+)?$", RegexOptions.IgnoreCase) ||
        d.Trim().Equals("Corner Cut", StringComparison.OrdinalIgnoreCase);

    /// <summary>The demo seed gave generated projects East/West/North by plot number (1→East, 2→West, 0→North).</summary>
    private static bool IsPlaceholderFacing(string? facing, int number)
    {
        if (string.IsNullOrWhiteSpace(facing)) return true;
        var generated = number % 3 == 0 ? "North" : number % 3 == 1 ? "East" : "West";
        return facing.Trim().Equals(generated, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsPlaceholderNote(string? note) =>
        !string.IsNullOrWhiteSpace(note) &&
        (note.Contains("DTCP", StringComparison.OrdinalIgnoreCase) || note.Contains("Sheet:", StringComparison.OrdinalIgnoreCase) ||
         note.Contains("KamanaickenPalayam", StringComparison.OrdinalIgnoreCase));
}
