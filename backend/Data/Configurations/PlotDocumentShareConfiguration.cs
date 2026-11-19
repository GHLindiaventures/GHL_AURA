using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace backend.Data.Configurations;

public class PlotDocumentShareConfiguration : IEntityTypeConfiguration<PlotDocumentShare>
{
    public void Configure(EntityTypeBuilder<PlotDocumentShare> builder)
    {
        builder.ToTable("plot_document_shares");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.RecipientName).HasMaxLength(150).IsRequired();
        builder.Property(x => x.RecipientPhone).HasMaxLength(50).IsRequired();
        builder.Property(x => x.RecipientEmail).HasMaxLength(200);
        builder.Property(x => x.Channel).HasMaxLength(20).IsRequired();
        builder.Property(x => x.Token).HasMaxLength(64).IsRequired();
        builder.Property(x => x.DocumentIdsJson).IsRequired();
        builder.Property(x => x.Message).HasMaxLength(2000);
        builder.Property(x => x.SharedByName).HasMaxLength(150).IsRequired();
        builder.Property(x => x.Status).HasMaxLength(50).IsRequired();
        builder.Property(x => x.StatusNote).HasMaxLength(2000);
        builder.Property(x => x.StatusUpdatedByName).HasMaxLength(150);

        builder.HasIndex(x => x.Token).IsUnique();
        builder.HasIndex(x => x.PlotId);
        builder.HasIndex(x => x.LeadId);

        builder.HasOne(x => x.Plot)
            .WithMany()
            .HasForeignKey(x => x.PlotId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
