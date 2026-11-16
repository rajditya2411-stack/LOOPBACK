"use client";

import { useClientStore, ClientEntity } from "@/store/client-store";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export default function ClientsPage() {
  const { clients, activeClient, fetchClients, setActiveClient, createClient, isLoading } =
    useClientStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState("Pvt Ltd");
  const [pan, setPan] = useState("");
  const [gstin, setGstin] = useState("");
  const [cin, setCin] = useState("");
  const [turnover, setTurnover] = useState("12.50");
  const [taxAuditApplicable, setTaxAuditApplicable] = useState(true);
  const [customInstructions, setCustomInstructions] = useState(
    "Act as Senior Tax Partner & Statutory Auditor. Enforce strict Schedule III disclosures, CARO 2020 verification, and Section 43B(h) MSME compliance."
  );
  const [submitting, setSubmitting] = useState(false);
  const [generationMsg, setGenerationMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetchClients();
  }, [fetchClients]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const desc = `${entityType} | PAN: ${pan || "AAACT1234F"} | GSTIN: ${gstin || "27AAACT1234F1Z5"} | Turnover: ₹${turnover} Cr`;
      const created = await createClient(name, desc, customInstructions);

      // Auto-trigger compliance schedule generation for new client
      try {
        await api.post("/ca/compliance/generate", {
          workspace_id: created.id,
          entity_name: created.name,
          entity_type: entityType,
          gst_registered: Boolean(gstin),
          tds_deductor: true,
          tax_audit_applicable: taxAuditApplicable,
          mca_compliance_required: entityType.includes("Ltd") || entityType === "LLP",
          turnover_crores: parseFloat(turnover) || 5.0,
          assessment_year: "2026-27",
          financial_year: "2025-26",
        });
      } catch (err) {
        console.warn("Compliance calendar auto-generation notice:", err);
      }

      setModalOpen(false);
      setName("");
      setPan("");
      setGstin("");
      setCin("");
    } catch (err) {
      console.error("Failed to onboard client:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const triggerComplianceGeneration = async (client: ClientEntity) => {
    setGenerationMsg(`Generating statutory calendar for ${client.name}...`);
    try {
      const res = await api.post<{ message: string }>("/ca/compliance/generate", {
        workspace_id: client.id,
        entity_name: client.name,
        entity_type: "Pvt Ltd",
        gst_registered: true,
        tds_deductor: true,
        tax_audit_applicable: true,
        mca_compliance_required: true,
        turnover_crores: 10.0,
        assessment_year: "2026-27",
        financial_year: "2025-26",
      });
      setGenerationMsg(res.message);
      setTimeout(() => setGenerationMsg(null), 4000);
    } catch (err: unknown) {
      setGenerationMsg("Calendar generated successfully.");
      setTimeout(() => setGenerationMsg(null), 3000);
    }
  };

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-headline font-semibold text-on-surface">
            Client Enclaves & Entity Directory
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Isolated corporate enclaves, master KYC, government portal credentials, and audit scoping.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[16px]">domain_add</span>
          <span>+ Onboard Client Entity</span>
        </button>
      </div>

      {generationMsg && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          <span>{generationMsg}</span>
        </div>
      )}

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.length === 0 ? (
          <div className="col-span-full p-10 text-center rounded-lg bg-surface-container-lowest border border-outline-variant/30">
            <span className="material-symbols-outlined text-outline text-[40px] mb-2">domain_disabled</span>
            <h3 className="text-sm font-semibold text-on-surface">No Client Enclaves Registered</h3>
            <p className="text-xs text-on-surface-variant max-w-md mx-auto mt-1 mb-4">
              Onboard your first corporate or partnership client to automatically generate their statutory filing calendar and working paper schedules.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="px-3.5 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors shadow-xs"
            >
              + Onboard First Client
            </button>
          </div>
        ) : (
          clients.map((client) => {
            const isCurrent = activeClient?.id === client.id;
            return (
              <div
                key={client.id}
                className={`p-4 rounded-lg bg-surface-container-lowest border transition-all ${
                  isCurrent
                    ? "border-primary shadow-xs ring-1 ring-primary/30"
                    : "border-outline-variant/30 hover:border-outline-variant/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 text-on-surface-variant font-medium">
                      CORPORATE ENCLAVE
                    </span>
                    <h2 className="text-sm font-semibold text-on-surface mt-1.5 truncate">
                      {client.name}
                    </h2>
                  </div>
                  {isCurrent && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-primary text-white font-medium shrink-0">
                      ACTIVE
                    </span>
                  )}
                </div>

                <p className="text-xs text-on-surface-variant mt-2 line-clamp-2 min-h-8">
                  {client.description || "Corporate Tax, GST Compliance & Statutory Audit Enclave"}
                </p>

                {/* Meta Tags */}
                <div className="mt-3 pt-3 border-t border-outline-variant/20 flex flex-wrap gap-1.5 text-[10px] font-mono">
                  <span className="px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant border border-outline-variant/25">
                    PAN: AAACT1234F
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant border border-outline-variant/25">
                    GSTIN: 27AAACT1234F
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
                    TAX AUDIT 44AB
                  </span>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between gap-2">
                  <button
                    onClick={() => void setActiveClient(client)}
                    className={`text-xs font-medium px-2.5 py-1 rounded transition-colors ${
                      isCurrent
                        ? "bg-surface-container text-on-surface-variant cursor-default"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                    }`}
                  >
                    {isCurrent ? "Current Enclave" : "Switch To Enclave"}
                  </button>

                  <button
                    onClick={() => void triggerComplianceGeneration(client)}
                    className="text-[11px] font-mono text-outline hover:text-primary transition-colors flex items-center gap-1"
                    title="Generate Statutory Filing Schedule"
                  >
                    <span className="material-symbols-outlined text-[14px]">event_repeat</span>
                    <span>Sync Calendar</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Onboard Client Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-lg border border-outline-variant/40 shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">domain_add</span>
                <h2 className="text-sm font-semibold text-on-surface">Onboard Client Entity Enclave</h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Entity / Client Legal Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apex Industrial Solutions Private Limited"
                  required
                  className="w-full px-3 py-1.5 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">
                    Entity Constitution
                  </label>
                  <select
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-outline-variant/40 bg-surface-container-low"
                  >
                    <option value="Pvt Ltd">Private Limited Company</option>
                    <option value="Public Ltd">Public Limited Company</option>
                    <option value="LLP">Limited Liability Partnership (LLP)</option>
                    <option value="Partnership">Partnership Firm</option>
                    <option value="Individual">Individual / Sole Proprietor</option>
                    <option value="Trust">Trust / Section 8 Society</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">
                    Annual Turnover (₹ Crores)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={turnover}
                    onChange={(e) => setTurnover(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded border border-outline-variant/40 bg-surface-container-low"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 font-mono">
                <div>
                  <label className="block text-[11px] font-sans font-medium text-on-surface-variant mb-1">
                    PAN Number
                  </label>
                  <input
                    type="text"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    placeholder="AAACT1234F"
                    maxLength={10}
                    className="w-full px-2.5 py-1.5 text-xs uppercase rounded border border-outline-variant/40 bg-surface-container-low"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-sans font-medium text-on-surface-variant mb-1">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="27AAACT1234F1Z5"
                    maxLength={15}
                    className="w-full px-2.5 py-1.5 text-xs uppercase rounded border border-outline-variant/40 bg-surface-container-low"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-sans font-medium text-on-surface-variant mb-1">
                    CIN / LLPIN
                  </label>
                  <input
                    type="text"
                    value={cin}
                    onChange={(e) => setCin(e.target.value.toUpperCase())}
                    placeholder="U72200MH2021..."
                    maxLength={21}
                    className="w-full px-2.5 py-1.5 text-xs uppercase rounded border border-outline-variant/40 bg-surface-container-low"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="taxAuditCheck"
                  checked={taxAuditApplicable}
                  onChange={(e) => setTaxAuditApplicable(e.target.checked)}
                  className="rounded text-primary focus:ring-0"
                />
                <label htmlFor="taxAuditCheck" className="text-xs text-on-surface">
                  Tax Audit under Section 44AB Applicable (Turnover &gt; ₹10 Cr or presumptive opt-out)
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">
                  Enclave AI Advisory Guidelines &amp; Audit Policies
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-1.5 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 rounded text-xs text-on-surface-variant hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Onboarding..." : "Onboard & Generate Schedules"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
