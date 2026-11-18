using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace backend.Data.Configurations;

public class SiteVisitPlotConfiguration : IEntityTypeConfiguration<SiteVisitPlot>
{
    public void Configure(EntityTypeBuilder<SiteVisitPlot> builder)
    {
        builder.ToTable("site_visit_plots");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.PlotNumber).HasMaxLength(100).IsRequired();

        builder.HasIndex(x => new { x.SiteVisitId, x.PlotId }).IsUnique();
        builder.HasIndex(x => x.PlotId);

        builder.HasOne(x => x.SiteVisit)
            .WithMany(v => v.VisitPlots)
            .HasForeignKey(x => x.SiteVisitId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.Plot)
            .WithMany()
            .HasForeignKey(x => x.PlotId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
