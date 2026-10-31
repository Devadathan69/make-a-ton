"use client";

import { useCallback, useState } from "react";
import { Badge, PageHeader, Panel, ResourceState, Table } from "@/components/ui";
import { api } from "@/lib/api";
import type { QuoteTemplate, Subscription } from "@/lib/contracts";
import { formatDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { TemplateDialog } from "./template-dialog";
import { QuoteComposer } from "./quote-composer";
import { getTodayDateString } from "./quote-helpers";
import styles from "./subscriptions.module.css";

type ActiveTab = "quotes" | "composer" | "templates";

export function QuotesPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("quotes");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("QUOTATION");
  const [page, setPage] = useState(1);

  // Draft being continued in Composer
  const [draftToContinue, setDraftToContinue] = useState<Subscription | null>(null);
  const [presetTemplateId, setPresetTemplateId] = useState<string | undefined>(undefined);

  // Template editor modal
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<QuoteTemplate | null>(null);

  // Load subscriptions for quotations tab
  const quotesLoader = useCallback(
    () =>
      api.subscriptions.list({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        search: search.trim() || undefined,
        page,
        pageSize: 10,
      }),
    [statusFilter, search, page]
  );
  const quotesResource = useResource(quotesLoader);

  // Load templates for templates tab
  const templatesLoader = useCallback(() => api.templates.list({ pageSize: 100 }), []);
  const templatesResource = useResource(templatesLoader);

  const todayStr = getTodayDateString();

  const handleStartNewQuote = (template?: QuoteTemplate) => {
    setDraftToContinue(null);
    setPresetTemplateId(template?.id);
    setActiveTab("composer");
  };

  const handleContinueDraft = (subscription: Subscription) => {
    setDraftToContinue(subscription);
    setPresetTemplateId(undefined);
    setActiveTab("composer");
  };

  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    setIsTemplateDialogOpen(true);
  };

  const handleOpenEditTemplate = (tmpl: QuoteTemplate) => {
    setEditingTemplate(tmpl);
    setIsTemplateDialogOpen(true);
  };

  const handleQuoteSuccess = () => {
    quotesResource.refresh();
    setDraftToContinue(null);
    setPresetTemplateId(undefined);
    setActiveTab("quotes");
  };

  const handleTemplateSaved = () => {
    templatesResource.refresh();
  };

  const quotesTotal = quotesResource.data?.total ?? 0;
  const quotesPages = Math.max(1, Math.ceil(quotesTotal / 10));

  return (
    <>
      <PageHeader
        eyebrow="Workspace / Quotations"
        title="From a conversation to a contract."
        description="Start with a template, assemble product lines, and send a clear offer."
        action={
          <div style={{ display: "flex", gap: 10 }}>
            {activeTab !== "composer" && (
              <button
                type="button"
                className="button"
                onClick={() => handleStartNewQuote()}
              >
                + New Quotation
              </button>
            )}
            {activeTab === "templates" && (
              <button
                type="button"
                className="button button-secondary"
                onClick={handleOpenCreateTemplate}
              >
                + New Template
              </button>
            )}
          </div>
        }
      />

      <div className={styles.tabsBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "quotes" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("quotes")}
        >
          Quotations & Drafts
          {quotesResource.data && (
            <span className={styles.tabBadge}>{quotesResource.data.total}</span>
          )}
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "composer" ? styles.tabBtnActive : ""}`}
          onClick={() => {
            setDraftToContinue(null);
            setActiveTab("composer");
          }}
        >
          Quotation Composer
          {draftToContinue && <span className={styles.tabBadge}>Continuing {draftToContinue.number}</span>}
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "templates" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("templates")}
        >
          Quotation Templates
          {templatesResource.data && (
            <span className={styles.tabBadge}>{templatesResource.data.total}</span>
          )}
        </button>
      </div>

      {/* Tab 1: Quotations list */}
      {activeTab === "quotes" && (
        <Panel
          title="Quotations & In-Progress Drafts"
          aside={
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by stage"
              >
                <option value="QUOTATION">Quotations Only</option>
                <option value="DRAFT">Drafts Only</option>
                <option value="ALL">All Stages</option>
              </select>
              <button
                type="button"
                className="button button-secondary"
                style={{ padding: "6px 10px", fontSize: 11 }}
                onClick={quotesResource.refresh}
              >
                ↻
              </button>
            </div>
          }
        >
          <div className={styles.toolbar}>
            <div className={styles.searchGroup}>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search by quote reference, customer, or plan..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                aria-label="Search quotations"
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
          </div>

          <ResourceState
            loading={quotesResource.loading}
            error={quotesResource.error}
            empty={!quotesResource.loading && quotesTotal === 0}
          />

          {quotesResource.data && quotesResource.data.items.length > 0 && (
            <>
              <Table headings={["Reference", "Customer", "Plan", "Valid Until", "Stage", "Actions"]}>
                {quotesResource.data.items.map((subscription) => {
                  const isExpired =
                    subscription.quotationValidUntil &&
                    subscription.quotationValidUntil < todayStr &&
                    subscription.status === "QUOTATION";

                  return (
                    <tr key={subscription.id}>
                      <td>
                        <strong>{subscription.number}</strong>
                      </td>
                      <td>{subscription.customerName}</td>
                      <td>{subscription.planName}</td>
                      <td>
                        {subscription.quotationValidUntil ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {formatDate(subscription.quotationValidUntil)}
                            {isExpired && (
                              <span
                                className="badge badge-cancelled"
                                style={{ fontSize: 9, padding: "2px 5px" }}
                                title="This quotation is past its validity date"
                              >
                                Expired
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <Badge value={subscription.status} />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {subscription.status === "DRAFT" ? (
                            <button
                              type="button"
                              className="button"
                              style={{ padding: "4px 8px", fontSize: 11 }}
                              onClick={() => handleContinueDraft(subscription)}
                            >
                              Continue Draft
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="button button-secondary"
                              style={{ padding: "4px 8px", fontSize: 11 }}
                              onClick={() => handleContinueDraft(subscription)}
                            >
                              Inspect / Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>

              <div className={styles.pagination}>
                <span>
                  Showing {quotesResource.data.items.length} of {quotesTotal} records
                </span>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || quotesResource.loading}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page} of {quotesPages}
                  </span>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.min(quotesPages, p + 1))}
                    disabled={page >= quotesPages || quotesResource.loading}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </Panel>
      )}

      {/* Tab 2: Quotation Composer */}
      {activeTab === "composer" && (
        <Panel
          title={draftToContinue ? `Edit Draft (${draftToContinue.number})` : "Compose New Quotation"}
          aside={
            draftToContinue ? (
              <span className="badge badge-quotation">Editing Draft</span>
            ) : (
              <small>Creates an independent draft and transitions to quotation</small>
            )
          }
        >
          <div style={{ padding: 20 }}>
            <QuoteComposer
              initialDraft={draftToContinue}
              initialTemplateId={presetTemplateId}
              onSuccess={handleQuoteSuccess}
              onCancel={() => {
                setDraftToContinue(null);
                setPresetTemplateId(undefined);
                setActiveTab("quotes");
              }}
            />
          </div>
        </Panel>
      )}

      {/* Tab 3: Quotation Templates */}
      {activeTab === "templates" && (
        <Panel
          title="Quotation Templates"
          aside={
            <button
              type="button"
              className="button"
              onClick={handleOpenCreateTemplate}
            >
              + New Template
            </button>
          }
        >
          <ResourceState
            loading={templatesResource.loading}
            error={templatesResource.error}
            empty={!templatesResource.loading && (templatesResource.data?.total ?? 0) === 0}
          />

          {templatesResource.data && templatesResource.data.items.length > 0 && (
            <Table headings={["Template Name", "Validity", "Product Lines", "Actions"]}>
              {templatesResource.data.items.map((tmpl) => (
                <tr key={tmpl.id}>
                  <td>
                    <strong>{tmpl.name}</strong>
                  </td>
                  <td>{tmpl.validDays} days</td>
                  <td>{tmpl.lines.length} configured items</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        onClick={() => handleOpenEditTemplate(tmpl)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        onClick={() => {
                          handleStartNewQuote(tmpl);
                        }}
                      >
                        Use in Quotation
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      )}

      <TemplateDialog
        isOpen={isTemplateDialogOpen}
        template={editingTemplate}
        onClose={() => {
          setIsTemplateDialogOpen(false);
          setEditingTemplate(null);
        }}
        onSuccess={handleTemplateSaved}
      />
    </>
  );
}
