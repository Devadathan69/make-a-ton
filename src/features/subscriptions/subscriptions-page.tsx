"use client";

import { useCallback, useState } from "react";
import { Badge, PageHeader, Panel, ResourceState, Table } from "@/components/ui";
import { api } from "@/lib/api";
import type { Subscription } from "@/lib/contracts";
import { formatDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { SubscriptionDetailDrawer } from "./subscription-detail-drawer";
import styles from "./subscriptions.module.css";

const PAGE_SIZE = 10;

export function SubscriptionsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const loader = useCallback(
    () =>
      api.subscriptions.list({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        search: search.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [statusFilter, search, page]
  );

  const { data, loading, error, refresh } = useResource(loader);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        eyebrow="Workspace / Subscriptions"
        title="Every subscription, in sync."
        description="Follow the full journey from first draft to the final billing cycle."
      />

      <Panel
        title="Subscriptions Directory"
        aside={<small>{total} total contracts</small>}
      >
        <div className={styles.toolbar}>
          <div className={styles.searchGroup}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search by reference, customer name, or plan..."
              value={search}
              onChange={handleSearchChange}
              aria-label="Search subscriptions"
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
            <select
              className={styles.filterSelect}
              value={statusFilter}
              onChange={handleStatusFilterChange}
              aria-label="Filter subscriptions by status"
            >
              <option value="ALL">All Stages</option>
              <option value="DRAFT">DRAFT</option>
              <option value="QUOTATION">QUOTATION</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PAUSED">PAUSED</option>
              <option value="CLOSED">CLOSED</option>
            </select>

            <button
              type="button"
              className="button button-secondary"
              style={{ padding: "8px 12px", fontSize: 12 }}
              onClick={refresh}
              disabled={loading}
              title="Refresh subscriptions list"
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
              Retry Loading Subscriptions
            </button>
          </div>
        )}

        {data && data.items.length > 0 && (
          <>
            <Table headings={["Subscription", "Customer", "Plan", "Start Date", "Next Billing", "Stage", "Actions"]}>
              {data.items.map((subscription: Subscription) => (
                <tr
                  key={subscription.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedSubId(subscription.id)}
                >
                  <td>
                    <strong>{subscription.number}</strong>
                  </td>
                  <td>{subscription.customerName}</td>
                  <td>{subscription.planName}</td>
                  <td>{formatDate(subscription.startDate)}</td>
                  <td>
                    {subscription.nextBillingDate ? (
                      formatDate(subscription.nextBillingDate)
                    ) : (
                      <span style={{ color: "var(--muted)" }}>Not scheduled</span>
                    )}
                  </td>
                  <td>
                    <Badge value={subscription.status} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ padding: "5px 10px", fontSize: 11 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSubId(subscription.id);
                      }}
                      aria-label={`View details for ${subscription.number}`}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </Table>

            <div className={styles.pagination}>
              <span>
                Showing <strong>{startIndex}</strong> to <strong>{endIndex}</strong> of{" "}
                <strong>{total}</strong> subscriptions
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

      {/* Subscription Detail Drawer */}
      <SubscriptionDetailDrawer
        subscriptionId={selectedSubId}
        onClose={() => setSelectedSubId(null)}
        onRefreshList={refresh}
      />
    </>
  );
}
