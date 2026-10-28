import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DataTable, Column, RowAction } from '../components/common/DataTable';

interface MockItem {
  id: string;
  name: string;
  category: string;
  amount: number;
}

const mockData: MockItem[] = [
  { id: '1', name: 'Alpha Project', category: 'Commercial', amount: 1000 },
  { id: '2', name: 'Beta Heights', category: 'Residential', amount: 2500 },
  { id: '3', name: 'Gamma Villa', category: 'Plots', amount: 1500 },
];

const mockColumns: Column<MockItem>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'category', header: 'Category' },
  {
    key: 'amount',
    header: 'Amount',
    sortable: true,
    render: (item) => `₹${item.amount}`,
  },
];

describe('DataTable Component Tests', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders table headers and rows accurately', () => {
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        keyExtractor={(item) => item.id}
      />
    );

    expect(screen.getByText('Name')).toBeDefined();
    expect(screen.getByText('Category')).toBeDefined();
    expect(screen.getByText('Amount')).toBeDefined();

    expect(screen.getByText('Alpha Project')).toBeDefined();
    expect(screen.getByText('Beta Heights')).toBeDefined();
    expect(screen.getByText('Gamma Villa')).toBeDefined();
    expect(screen.getByText('₹1000')).toBeDefined();
  });

  it('renders loading state when isLoading is true', () => {
    render(
      <DataTable
        columns={mockColumns}
        data={[]}
        keyExtractor={(item) => item.id}
        isLoading={true}
      />
    );

    expect(screen.getByText('Loading records...')).toBeDefined();
  });

  it('renders empty state when data is empty', () => {
    const onAction = vi.fn();
    render(
      <DataTable
        columns={mockColumns}
        data={[]}
        keyExtractor={(item) => item.id}
        emptyTitle="No Projects Found"
        emptyDescription="Create your first project"
        emptyActionLabel="Add Project"
        onEmptyAction={onAction}
      />
    );

    expect(screen.getByText('No Projects Found')).toBeDefined();
    expect(screen.getByText('Create your first project')).toBeDefined();
    const actionBtn = screen.getByText('Add Project');
    fireEvent.click(actionBtn);
    expect(onAction).toHaveBeenCalled();
  });

  it('filters data using search query and searchFilter prop', () => {
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        keyExtractor={(item) => item.id}
        searchFilter={(item, q) => item.name.toLowerCase().includes(q.toLowerCase())}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search records...');
    fireEvent.change(searchInput, { target: { value: 'Beta' } });

    expect(screen.getByText('Beta Heights')).toBeDefined();
    expect(screen.queryByText('Alpha Project')).toBeNull();
  });

  it('sorts data when clicking sortable column headers', () => {
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        keyExtractor={(item) => item.id}
      />
    );

    const nameHeader = screen.getByText('Name');
    // Ascending sort
    fireEvent.click(nameHeader);
    const rowsAsc = screen.getAllByRole('row');
    expect(rowsAsc[1].textContent).toContain('Alpha Project');

    // Descending sort
    fireEvent.click(nameHeader);
    const rowsDesc = screen.getAllByRole('row');
    expect(rowsDesc[1].textContent).toContain('Gamma Villa');
  });

  it('handles row selection and bulk actions', () => {
    const bulkActionSpy = vi.fn();
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        keyExtractor={(item) => item.id}
        bulkActions={[
          { label: 'Archive Selected', onClick: bulkActionSpy },
        ]}
      />
    );

    // Select all checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    const selectAll = checkboxes[0];
    fireEvent.click(selectAll);

    const bulkBtn = screen.getByText('Archive Selected');
    fireEvent.click(bulkBtn);

    expect(bulkActionSpy).toHaveBeenCalledWith(mockData);
  });

  it('triggers onRowClick and opens row actions menu', () => {
    const onRowClick = vi.fn();
    const editAction = vi.fn();
    const actions: RowAction<MockItem>[] = [
      { label: 'Edit Project', onClick: editAction },
    ];

    const { container } = render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        keyExtractor={(item) => item.id}
        onRowClick={onRowClick}
        rowActions={actions}
      />
    );

    const row = screen.getByText('Alpha Project');
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledWith(mockData[0]);

    // Open row actions dropdown via action button
    const actionButtons = container.querySelectorAll('.btn-icon');
    expect(actionButtons.length).toBeGreaterThan(0);
    fireEvent.click(actionButtons[0]);

    const editBtn = screen.getByText('Edit Project');
    fireEvent.click(editBtn);
    expect(editAction).toHaveBeenCalledWith(mockData[0]);
  });

  it('supports pagination with prev and next buttons', () => {
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        keyExtractor={(item) => item.id}
        pageSize={2}
      />
    );

    expect(screen.getByText('Alpha Project')).toBeDefined();
    expect(screen.getByText('Beta Heights')).toBeDefined();
    expect(screen.queryByText('Gamma Villa')).toBeNull();

    // Next page
    const nextBtn = screen.getByText(/Next/i);
    fireEvent.click(nextBtn);

    expect(screen.getByText('Gamma Villa')).toBeDefined();
    expect(screen.queryByText('Alpha Project')).toBeNull();

    // Prev page
    const prevBtn = screen.getByText(/Previous/i);
    fireEvent.click(prevBtn);
    expect(screen.getByText('Alpha Project')).toBeDefined();
  });
});
