using backend.Models.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace backend.Data.Configurations;

public class LeadConfiguration : IEntityTypeConfiguration<Lead>
{
    public void Configure(EntityTypeBuilder<Lead> builder)
    {
        builder.ToTable("leads");

        builder.HasKey(l => l.Id);

        builder.Property(l => l.Name)
            .HasMaxLength(150)
            .IsRequired();

        builder.Property(l => l.Email)
            .HasMaxLength(256);

        builder.Property(l => l.Phone)
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(l => l.Status)
            .HasMaxLength(50)
            .HasDefaultValue("New")
            .IsRequired();

        builder.Property(l => l.Source)
            .HasMaxLength(100)
            .HasDefaultValue("Website Inbound")
            .IsRequired();

        builder.Property(l => l.Priority)
            .HasMaxLength(50)
            .HasDefaultValue("Medium")
            .IsRequired();

        builder.Property(l => l.CreatedAt)
            .HasDefaultValueSql("NOW()");

        builder.Property(l => l.Location)
            .HasMaxLength(150);

        builder.Property(l => l.InvestmentCapacity)
            .HasMaxLength(50);

        builder.Property(l => l.Notes)
            .HasColumnType("text");

        builder.Property(l => l.CustomFieldsJson)
            .HasColumnType("jsonb");

        // Indexes for performance
        builder.HasIndex(l => l.CompanyId);
        builder.HasIndex(l => l.Status);
        builder.HasIndex(l => l.CreatedAt);
        builder.HasIndex(l => new { l.CompanyId, l.Status });
        builder.HasIndex(l => new { l.CompanyId, l.Phone });

        // Relationships
        builder.HasOne(l => l.Company)
            .WithMany()
            .HasForeignKey(l => l.CompanyId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(l => l.AssignedAgentId)
            .IsRequired(false);

        builder.HasOne(l => l.AssignedAgent)
            .WithMany()
            .HasForeignKey(l => l.AssignedAgentId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne(l => l.AssignedBy)
            .WithMany()
            .HasForeignKey(l => l.AssignedById)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(l => new { l.CompanyId, l.AssignedAgentId });
        
        builder.Property<uint>("xmin").IsRowVersion();
    }
}
