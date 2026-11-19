using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace backend.Data.Configurations;

public class SiteVisitHistoryConfiguration : IEntityTypeConfiguration<SiteVisitHistory>
{
    public void Configure(EntityTypeBuilder<SiteVisitHistory> builder)
    {
        builder.ToTable("site_visit_history");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.EventType).HasMaxLength(40).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(500).IsRequired();
        builder.Property(x => x.FromAgentName).HasMaxLength(150);
        builder.Property(x => x.ToAgentName).HasMaxLength(150);
        builder.Property(x => x.FromStatus).HasMaxLength(40);
        builder.Property(x => x.ToStatus).HasMaxLength(40);
        builder.Property(x => x.ActorName).HasMaxLength(150);
        builder.HasIndex(x => x.SiteVisitId);

        builder.HasOne(x => x.SiteVisit)
            .WithMany(v => v.History)
            .HasForeignKey(x => x.SiteVisitId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
