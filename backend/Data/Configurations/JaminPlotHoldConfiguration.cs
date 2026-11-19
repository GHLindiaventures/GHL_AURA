using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace backend.Data.Configurations;

public class JaminPlotHoldConfiguration : IEntityTypeConfiguration<JaminPlotHold>
{
    public void Configure(EntityTypeBuilder<JaminPlotHold> builder)
    {
        builder.ToTable("jamin_plot_holds");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.CustomerName).HasMaxLength(200).IsRequired();
        builder.Property(x => x.CustomerPhone).HasMaxLength(50).IsRequired();
        builder.Property(x => x.AgentName).HasMaxLength(150);
        builder.Property(x => x.Reason).HasMaxLength(1000);
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.PaymentMode).HasMaxLength(60);
        builder.Property(x => x.PaymentReference).HasMaxLength(120);
        builder.Property(x => x.PaymentProofUrl).HasMaxLength(500);
        builder.Property(x => x.PaymentStatus).HasMaxLength(30).IsRequired();
        builder.Property(x => x.VerifiedByName).HasMaxLength(150);
        builder.Property(x => x.VerificationNotes).HasMaxLength(1000);
        builder.Property(x => x.Status).HasMaxLength(20).IsRequired();
        builder.Property(x => x.ClosedByName).HasMaxLength(150);
        builder.HasIndex(x => new { x.PlotId, x.Status });

        builder.HasOne(x => x.Plot).WithMany().HasForeignKey(x => x.PlotId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class JaminPlotHoldEventConfiguration : IEntityTypeConfiguration<JaminPlotHoldEvent>
{
    public void Configure(EntityTypeBuilder<JaminPlotHoldEvent> builder)
    {
        builder.ToTable("jamin_plot_hold_events");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.EventType).HasMaxLength(40).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(500).IsRequired();
        builder.Property(x => x.ActorName).HasMaxLength(150);
        builder.HasIndex(x => x.HoldId);
        builder.HasOne(x => x.Hold).WithMany(h => h.Events).HasForeignKey(x => x.HoldId).OnDelete(DeleteBehavior.Cascade);
    }
}
