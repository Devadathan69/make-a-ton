"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Badge, PageHeader, Panel, ResourceState } from "@/components/ui";
import { api } from "@/lib/api";
import type { DashboardSummary } from "@/lib/contracts";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import styles from "./dashboard.module.css";

export function DashboardPage() {
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<{ from?: string; to?: string }>({});

  const loader = useCallback(async () => {
    return api.reports.summary(appliedFilters);
  }, [appliedFilters]);

  const { data, loading, error, refresh } = useResource<DashboardSummary>(loader);

  const handleApplyFilter = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (fromDate && toDate && fromDate > toDate) {
      setDateError("From date cannot be later than To date.");
      return;
    }
    setDateError(null);
    setAppliedFilters({
      from: fromDate || undefined,
      to: toDate || undefined,
    });
  };

  const handleResetFilter = () => {
    setFromDate("");
    setToDate("");
    setDateError(null);
    setAppliedFilters({});
  };

  const handlePreset = (preset: "this-month" | "last-30" | "ytd" | "all") => {
    setDateError(null);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

    if (preset === "all") {
      setFromDate("");
      setToDate("");
      setAppliedFilters({});
      return;
    }

    if (preset === "this-month") {
      const from = `${year}-${month}-01`;
      setFromDate(from);
      setToDate(todayStr);
      setAppliedFilters({ from, to: todayStr });
      return;
    }

    if (preset === "last-30") {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const pastFrom = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`;
      setFromDate(pastFrom);
      setToDate(todayStr);
      setAppliedFilters({ from: pastFrom, to: todayStr });
      return;
    }

    if (preset === "ytd") {
      const from = `${year}-01-01`;
      setFromDate(from);
      setToDate(todayStr);
      setAppliedFilters({ from, to: todayStr });
      return;
    }
  };

  // Determine highest monthly value for unified chart scale
  const chartMaxAmount = data?.monthly && data.monthly.length > 0
    ? Math.max(1, ...data.monthly.flatMap((m) => [m.billed, m.collected]))
    : 1;

  const hasActiveFilter = Boolean(appliedFilters.from || appliedFilters.to);

  return (
    <>
      <PageHeader
        eyebrow="Workspace / Overview"
        title="Finance & Billing Dashboard"
        description="Comprehensive summary of contracts, billings, cash collections, and outstanding liabilities."
        action={
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={refresh}
              disabled={loading}
              title="Reload report figures"
            >
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
            <Link href="/subscriptions" className="button">
              View subscriptions <span>↗</span>
            </Link>
          </div>
        }
      />

      {/* Date Filter Bar */}
      <form className={styles.filterBar} onSubmit={handleApplyFilter} aria-label="Date range filters">
        <div className={styles.filterGroup}>
          <label htmlFor="dashboard-from" className={styles.filterLabel}>
            From date
          </label>
          <input
            id="dashboard-from"
            type="date"
            className={styles.filterInput}
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setDateError(null);
            }}
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="dashboard-to" className={styles.filterLabel}>
            To date
          </label>
          <input
            id="dashboard-to"
            type="date"
            className={styles.filterInput}
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setDateError(null);
            }}
          />
        </div>

        <div className={styles.filterPresets} role="group" aria-label="Date range presets">
          <span className={styles.filterLabel} style={{ marginRight: 4 }}>
            Presets:
          </span>
          <button
            type="button"
            className={`${styles.presetButton} ${!hasActiveFilter ? styles.activePreset : ""}`}
            onClick={() => handlePreset("all")}
          >
            All time
          </button>
          <button
            type="button"
            className={styles.presetButton}
            onClick={() => handlePreset("this-month")}
          >
            This month
          </button>
          <button
            type="button"
            className={styles.presetButton}
            onClick={() => handlePreset("last-30")}
          >
            Last 30 days
          </button>
          <button
            type="button"
            className={styles.presetButton}
            onClick={() => handlePreset("ytd")}
          >
            Year to date
          </button>
        </div>

        <div className={styles.filterActions}>
          <button type="submit" className="button" disabled={loading}>
            Apply filters
          </button>
          {hasActiveFilter && (
            <button
              type="button"
              className="button button-secondary"
              onClick={handleResetFilter}
            >
              Reset
            </button>
          )}
        </div>

        {dateError && (
          <div className={styles.filterError} role="alert">
            <span>⚠</span> {dateError}
          </div>
        )}
      </form>

      <ResourceState loading={loading} error={error} />

      {data && (
        <>
          {/* KPI Statistics Grid */}
          <div className={styles.statsGrid}>
            <div className={`${styles.statCard} ${styles.statCardHighlight}`}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>Active subscriptions</span>
                <span className={styles.statBadge}>Current count</span>
              </div>
              <p className={styles.statValue}>{data.activeSubscriptions}</p>
              <p className={styles.statNote}>
                Active recurring contracts as of {formatDate(data.asOf)}
              </p>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>Billed in period</span>
                <span className={styles.statBadge}>Period total</span>
              </div>
              <p className={styles.statValue}>{formatMoney(data.billed)}</p>
              <p className={styles.statNote}>
                Total confirmed & paid invoices issued in selected range (includes taxes)
              </p>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>Payments collected</span>
                <span className={styles.statBadge}>Cash in</span>
              </div>
              <p className={styles.statValue}>{formatMoney(data.collected)}</p>
              <p className={styles.statNote}>
                Settled payment cash recorded within selected range
              </p>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>Current outstanding</span>
                <span className={styles.statBadge}>Live balance</span>
              </div>
              <p className={styles.statValue}>{formatMoney(data.outstanding)}</p>
              <p className={styles.statNote}>
                Current unpaid confirmed invoice balance (independent of date filter)
              </p>
            </div>

            <div className={`${styles.statCard} ${data.overdue > 0 ? styles.statCardAlert : ""}`}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>Current overdue</span>
                <span className={styles.statBadge}>Past due</span>
              </div>
              <p className={styles.statValue}>{formatMoney(data.overdue)}</p>
              <p className={styles.statNote}>
                Confirmed balances past payment terms (independent of date filter)
              </p>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>Normalized MRR</span>
                <span className={styles.statBadge}>Pre-tax run rate</span>
              </div>
              <p className={styles.statValue}>{formatMoney(data.mrr)}</p>
              <p className={styles.statNote}>
                Contractual recurring monthly value before tax (normalized, not cash)
              </p>
            </div>
          </div>

          {/* Drill-down Panels: Chart & Attention List */}
          <div className="dashboard-grid">
            <Panel
              title="Billing vs. Cash Collections"
              aside={<small>As of {formatDate(data.asOf)}</small>}
            >
              <div className={styles.chartContainer}>
                {/* Accessible Hidden Summary for Screen Readers */}
                <div className={styles.accessibleSummary}>
                  <table>
                    <caption>Monthly Billed and Collected breakdown</caption>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Billed</th>
                        <th>Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.monthly.map((m) => (
                        <tr key={m.month}>
                          <td>{m.month}</td>
                          <td>{formatMoney(m.billed)}</td>
                          <td>{formatMoney(m.collected)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Visible Legend */}
                <div className={styles.chartLegend}>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendSwatch} ${styles.legendBilled}`} />
                    <span>Billed (Invoice gross with tax)</span>
                  </div>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendSwatch} ${styles.legendCollected}`} />
                    <span>Collected (Cash received)</span>
                  </div>
                </div>

                {data.monthly.length === 0 ? (
                  <p className={styles.emptyState}>No monthly activity recorded in this period.</p>
                ) : (
                  data.monthly.map((month) => {
                    const billedWidth = Math.min(100, Math.round((month.billed / chartMaxAmount) * 100));
                    const collectedWidth = Math.min(100, Math.round((month.collected / chartMaxAmount) * 100));

                    return (
                      <div className={styles.monthBlock} key={month.month}>
                        <div className={styles.monthTitle}>{month.month}</div>

                        <div className={styles.barRow}>
                          <span className={styles.barLabel}>Billed</span>
                          <div className={styles.barTrack} title={`Billed: ${formatMoney(month.billed)}`}>
                            <div
                              className={styles.barFillBilled}
                              style={{ width: `${billedWidth}%` }}
                            />
                          </div>
                          <span className={styles.barAmount}>{formatMoney(month.billed)}</span>
                        </div>

                        <div className={styles.barRow}>
                          <span className={styles.barLabel}>Collected</span>
                          <div className={styles.barTrack} title={`Collected: ${formatMoney(month.collected)}`}>
                            <div
                              className={styles.barFillCollected}
                              style={{ width: `${collectedWidth}%` }}
                            />
                          </div>
                          <span className={styles.barAmount}>{formatMoney(month.collected)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Panel>

            <Panel
              title="Attention Needed"
              aside={<small>{data.attention.length} {data.attention.length === 1 ? "item" : "items"}</small>}
            >
              {data.attention.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>✔ All accounts are currently in good standing.</p>
                  <p style={{ marginTop: 6, fontSize: 11 }}>
                    No overdue invoices, expiring contracts, or failed billing runs require attention.
                  </p>
                </div>
              ) : (
                <div className="attention-list">
                  {data.attention.map((item) => (
                    <div className={styles.attentionItem} key={item.id}>
                      <div className={styles.attentionHeader}>
                        <Badge value={item.kind} />
                      </div>
                      <p className={styles.attentionTitle}>{item.title}</p>
                      <Link className={styles.attentionLink} href={item.href}>
                        Review record <span>→</span>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Finance Reconciliation Summary">
            <div className="summary-strip">
              <span>
                Normalized MRR: <strong>{formatMoney(data.mrr)}</strong>
              </span>
              <span>
                Total Overdue: <strong>{formatMoney(data.overdue)}</strong>
              </span>
              <span>
                Total Outstanding: <strong>{formatMoney(data.outstanding)}</strong>
              </span>
              <span>
                Base Currency: <strong>INR (₹)</strong>
              </span>
              <span>
                Effective Date: <strong>{formatDate(data.asOf)}</strong>
              </span>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
