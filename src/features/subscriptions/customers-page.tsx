"use client";

import { useCallback, useState } from "react";
import { PageHeader, Panel, ResourceState, Table } from "@/components/ui";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/contracts";
import { useResource } from "@/lib/use-resource";
import { CustomerDialog } from "./customer-dialog";
import styles from "./subscriptions.module.css";

const PAGE_SIZE = 10;

export function CustomersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const loader = useCallback(
    () => api.customers.list({ page, pageSize: PAGE_SIZE, search: search.trim() || undefined }),
    [page, search]
  );

  const { data, loading, error, refresh } = useResource(loader);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCustomer(null);
  };

  const handleCustomerSaved = () => {
    refresh();
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        eyebrow="Workspace / Customers"
        title="Good relationships start here."
        description="A shared customer directory for your subscription team. Create and manage customer accounts."
        action={
          <button type="button" className="button" onClick={handleOpenCreate}>
            + New Customer
          </button>
        }
      />

      <Panel
        title="Customers"
        aside={<small>{total} total registered</small>}
      >
        <div className={styles.toolbar}>
          <div className={styles.searchGroup}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search by company, contact name, or email..."
              value={search}
              onChange={handleSearchChange}
              aria-label="Search customers"
            />
            {search && (
              <button
                type="button"
                className="button button-secondary"
                style={{ padding: "6px 10px", fontSize: 11 }}
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div className={styles.toolbarActions}>
            <button
              type="button"
              className="button button-secondary"
              style={{ padding: "8px 12px", fontSize: 12 }}
              onClick={refresh}
              disabled={loading}
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        <ResourceState
          loading={loading}
          error={error}
          empty={!loading && total === 0}
        />

        {error && (
          <div style={{ padding: "16px 20px" }}>
            <button type="button" className="button" onClick={refresh}>
              Retry Loading Customers
            </button>
          </div>
        )}

        {data && data.items.length > 0 && (
          <>
            <Table headings={["Company", "Contact", "Email", "Address", "Actions"]}>
              {data.items.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <strong>{customer.company}</strong>
                  </td>
                  <td>{customer.name}</td>
                  <td>
                    <a
                      href={`mailto:${customer.email}`}
                      className="text-link"
                      style={{ fontSize: "inherit" }}
                    >
                      {customer.email}
                    </a>
                  </td>
                  <td style={{ maxWidth: 300, whiteSpace: "normal" }}>{customer.address}</td>
                  <td>
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ padding: "5px 10px", fontSize: 11 }}
                      onClick={() => handleOpenEdit(customer)}
                      aria-label={`Edit ${customer.company}`}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </Table>

            <div className={styles.pagination}>
              <span>
                Showing <strong>{startIndex}</strong> to <strong>{endIndex}</strong> of{" "}
                <strong>{total}</strong> customers
              </span>
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>

      <CustomerDialog
        isOpen={isDialogOpen}
        customer={editingCustomer}
        onClose={handleCloseDialog}
        onSuccess={handleCustomerSaved}
      />
    </>
  );
}
