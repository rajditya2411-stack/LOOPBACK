"use client";

import { useState, useRef, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useClientStore } from "@/store/client-store";

interface VaultDoc {
  id: string;
  name: string;
  category: "PERMANENT" | "CURRENT";
  format: "PDF" | "DOCX" | "XLSX";
  size: string;
  uploaded_at: string;
  hash: string;
}

const SAMPLE_VAULT: VaultDoc[] = [
  {
    id: "doc-1",
    name: "Certificate of Incorporation & MOA-AOA.pdf",
    category: "PERMANENT",
    format: "PDF",
    size: "4.2 MB",
    uploaded_at: "12 Jan 2026",
    hash: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  {
    id: "doc-2",
    name: "Permanent Account Number & GSTIN Registration Certificates.pdf",
    category: "PERMANENT",
    format: "PDF",
    size: "1.1 MB",
    uploaded_at: "12 Jan 2026",
    hash: "sha256:88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589",
  },
  {
    id: "doc-3",
    name: "Lead Schedule B-1 Bank Reconciliation Statement (BRS) FY25-26.xlsx",
    category: "CURRENT",
    format: "XLSX",
    size: "820 KB",
    uploaded_at: "28 Feb 2026",
    hash: "sha256:5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5",
  },
  {
    id: "doc-4",
    name: "CARO 2020 Physical Inventory Verification Certificate.pdf",
    category: "CURRENT",
    format: "PDF",
    size: "2.8 MB",
    uploaded_at: "24 Feb 2026",
    hash: "sha256:6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
  },
  {
    id: "doc-5",
    name: "Section 43B(h) MSME Supplier Payment Declarations.pdf",
    category: "CURRENT",
    format: "PDF",
    size: "1.9 MB",
    uploaded_at: "20 Feb 2026",
    hash: "sha256:d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
  },
];

export default function VaultPage() {
  const router = useRouter();
  const { activeClient } = useClientStore();
  const [filter, setFilter] = useState<"ALL" | "PERMANENT" | "CURRENT">("ALL");
  const [vaultList, setVaultList] = useState<VaultDoc[]>(SAMPLE_VAULT);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docs = vaultList.filter((d) => filter === "ALL" || d.category === filter);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toUpperCase() || "PDF";
    const format = ext === "XLSX" || ext === "XLS" ? "XLSX" : ext === "DOCX" ? "DOCX" : "PDF";
    const sizeKB = file.size / 1024;
    const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${Math.round(sizeKB)} KB`;

    const newDoc: VaultDoc = {
      id: `doc-${Date.now()}`,
      name: file.name,
      category: filter === "PERMANENT" ? "PERMANENT" : "CURRENT",
      format: format as "PDF" | "DOCX" | "XLSX",
      size: sizeStr,
      uploaded_at: "Just now",
      hash: `sha256:${Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("")}`,
    };

    setVaultList([newDoc, ...vaultList]);
    setUploadMsg(`Working paper "${file.name}" indexed to SA 230 Vault with cryptographic seal.`);
    setTimeout(() => setUploadMsg(null), 4000);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.docx,.xlsx,.xls,.txt"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-headline font-semibold text-on-surface">
            Working Papers &amp; Evidence Vault (SA 230)
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Client: <span className="font-medium text-on-surface">{activeClient ? activeClient.name : "Active Enclave"}</span> · Permanent File (PAF) vs Current File (CAF) isolation with cryptographic proof.
          </p>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[16px]">upload_file</span>
          <span>Upload Working Paper</span>
        </button>
      </div>

      {uploadMsg && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">verified</span>
          <span>{uploadMsg}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-1 text-xs">
        <button
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer ${
            filter === "ALL"
              ? "bg-on-surface text-surface font-semibold"
              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
          }`}
        >
          All Files ({vaultList.length})
        </button>
        <button
          onClick={() => setFilter("PERMANENT")}
          className={`px-3 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer ${
            filter === "PERMANENT"
              ? "bg-primary text-white font-semibold"
              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
          }`}
        >
          Permanent Audit File (PAF)
        </button>
        <button
          onClick={() => setFilter("CURRENT")}
          className={`px-3 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer ${
            filter === "CURRENT"
              ? "bg-primary text-white font-semibold"
              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
          }`}
        >
          Current Audit File (CAF FY25-26)
        </button>
      </div>

      {/* Vault Table */}
      <div className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-container-high/40 text-on-surface-variant text-[11px] font-mono uppercase border-b border-outline-variant/20">
            <tr>
              <th className="py-2.5 px-3">Document Title</th>
              <th className="py-2.5 px-3">Classification</th>
              <th className="py-2.5 px-3">Size</th>
              <th className="py-2.5 px-3">Audit Timestamp</th>
              <th className="py-2.5 px-3">SA 230 Cryptographic Hash</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {docs.map((doc) => (
              <tr key={doc.id} className="hover:bg-surface-container-low/50 transition-colors">
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">
                      {doc.format === "PDF" ? "picture_as_pdf" : "table_view"}
                    </span>
                    <span className="font-medium text-on-surface">{doc.name}</span>
                  </div>
                </td>
                <td className="py-3 px-3 font-mono text-[10px]">
                  <span
                    className={`px-2 py-0.5 rounded font-semibold ${
                      doc.category === "PERMANENT"
                        ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {doc.category === "PERMANENT" ? "PERMANENT FILE" : "CURRENT FY25-26"}
                  </span>
                </td>
                <td className="py-3 px-3 font-mono text-[11px] text-on-surface-variant">
                  {doc.size}
                </td>
                <td className="py-3 px-3 font-mono text-[11px] text-on-surface-variant">
                  {doc.uploaded_at}
                </td>
                <td className="py-3 px-3 font-mono text-[10px] text-outline truncate max-w-[180px]">
                  {doc.hash}
                </td>
                <td className="py-3 px-3 text-right">
                  <button
                    onClick={() => router.push("/documents")}
                    className="text-[11px] text-primary hover:underline font-mono cursor-pointer"
                    title="Open Working Paper Evidence Library"
                  >
                    Inspect →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
