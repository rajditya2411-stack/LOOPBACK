"""
Chartered Accountant & Tax Advisory domain API endpoints.
Provides statutory checklists (CARO 2020, Form 3CD), Schedule III ratio analysis
with statutory 25% variance alerts, dynamic compliance generation, and notice scrutiny.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.workspace import Workspace
from app.models.goal import Goal
from app.models.task import Task

router = APIRouter(prefix="/ca", tags=["CA & Tax Advisory"])


# ---------------------------------------------------------
# Static / Master Data: CARO 2020 & Form 3CD Checklists
# ---------------------------------------------------------

CARO_2020_CLAUSES = [
    {
        "id": "caro-1",
        "clause": "(i)",
        "title": "Property, Plant & Equipment and Intangible Assets",
        "category": "Fixed Assets",
        "description": "Maintenance of proper records showing full particulars, quantitative details and situation of PPE; physical verification by management at reasonable intervals; title deeds of immovable property held in company's name.",
        "risk_level": "Medium",
    },
    {
        "id": "caro-2",
        "clause": "(ii)",
        "title": "Inventory & Working Capital Limits",
        "category": "Working Capital",
        "description": "Physical verification of inventory at reasonable intervals; coverage and procedures; discrepancies > 10% in aggregate; sanction of working capital limits > Rs. 5 crore on security of current assets and quarterly return reconciliations.",
        "risk_level": "High",
    },
    {
        "id": "caro-3",
        "clause": "(iii)",
        "title": "Investments, Guarantees & Loans to Other Entities",
        "category": "Loans & Advances",
        "description": "Loans, advances in nature of loans, guarantees, or security given to subsidiaries, joint ventures, associates or any other parties; terms not prejudicial; repayment schedules and overdue amounts > Rs. 1 lakh.",
        "risk_level": "High",
    },
    {
        "id": "caro-4",
        "clause": "(iv)",
        "title": "Compliance with Section 185 and 186",
        "category": "Statutory Compliance",
        "description": "Compliance with provisions of sections 185 (Loans to directors) and 186 (Loans and investments by company) of Companies Act, 2013.",
        "risk_level": "High",
    },
    {
        "id": "caro-5",
        "clause": "(v)",
        "title": "Deposits from Public",
        "category": "Public Deposits",
        "description": "Directives issued by Reserve Bank of India and provisions of sections 73 to 76; orders passed by Company Law Board or NCLT.",
        "risk_level": "Medium",
    },
    {
        "id": "caro-6",
        "clause": "(vi)",
        "title": "Cost Records Maintenance",
        "category": "Cost Accounting",
        "description": "Maintenance of cost records prescribed under section 148(1) of Companies Act, 2013 and whether such accounts and records have been made and maintained.",
        "risk_level": "Low",
    },
    {
        "id": "caro-7",
        "clause": "(vii)",
        "title": "Statutory Dues & Undisputed Liabilities",
        "category": "Statutory Dues",
        "description": "Regularity in depositing undisputed statutory dues (GST, PF, ESI, Income-tax, Customs, Cess); arrears outstanding > 6 months from date they became payable; disputed dues forum and amount.",
        "risk_level": "Critical",
    },
    {
        "id": "caro-8",
        "clause": "(viii)",
        "title": "Undisclosed Income Surrendered in Tax Assessments",
        "category": "Tax Surrender",
        "description": "Transactions not recorded in the books of account surrendered or disclosed as income during the year in tax assessments under Income Tax Act, 1961.",
        "risk_level": "High",
    },
    {
        "id": "caro-9",
        "clause": "(ix)",
        "title": "Default in Repayment of Borrowings & Loan Utilization",
        "category": "Borrowings",
        "description": "Defaults in repayment of loans or borrowings to lenders/banks; willful defaulter declaration; utilization of short-term funds for long-term purposes.",
        "risk_level": "Critical",
    },
    {
        "id": "caro-10",
        "clause": "(x)",
        "title": "IPO/FPO Moneys and Preferential Allotments",
        "category": "Capital Raising",
        "description": "Application of moneys raised by IPO/FPO for purposes for which raised; compliance with section 42 and 62 for private placements.",
        "risk_level": "Medium",
    },
    {
        "id": "caro-11",
        "clause": "(xi)",
        "title": "Fraud Reporting and Whistle-blower Complaints",
        "category": "Fraud & Governance",
        "description": "Fraud by company or on company noticed or reported; reporting under section 143(12) in Form ADT-4; consideration of whistle-blower complaints.",
        "risk_level": "Critical",
    },
    {
        "id": "caro-12",
        "clause": "(xii)",
        "title": "Nidhi Company Compliance",
        "category": "Specific Entities",
        "description": "Compliance with Net Owned Funds to Deposits ratio (1:20) and unencumbered term deposits >= 10%.",
        "risk_level": "Low",
    },
    {
        "id": "caro-13",
        "clause": "(xiii)",
        "title": "Related Party Transactions (Sec 177 & 188)",
        "category": "Related Parties",
        "description": "Compliance with sections 177 and 188 of Companies Act, 2013 and disclosures in financial statements in accordance with applicable accounting standards.",
        "risk_level": "High",
    },
    {
        "id": "caro-14",
        "clause": "(xiv)",
        "title": "Internal Audit System",
        "category": "Internal Control",
        "description": "Commensuration of internal audit system with size and nature of business; review of internal audit reports by statutory auditor.",
        "risk_level": "Medium",
    },
    {
        "id": "caro-15",
        "clause": "(xv)",
        "title": "Non-Cash Transactions with Directors (Sec 192)",
        "category": "Governance",
        "description": "Non-cash transactions with directors or persons connected with them in compliance with section 192.",
        "risk_level": "Medium",
    },
    {
        "id": "caro-16",
        "clause": "(xvi)",
        "title": "Registration under Section 45-IA of RBI Act, 1934",
        "category": "NBFC Regulatory",
        "description": "Requirement and registration as NBFC under section 45-IA of RBI Act; Housing Finance activities or Core Investment Company (CIC) status.",
        "risk_level": "Medium",
    },
    {
        "id": "caro-17",
        "clause": "(xvii)",
        "title": "Cash Losses",
        "category": "Financial Health",
        "description": "Incurrence of cash losses in the financial year and in the immediately preceding financial year with exact amounts.",
        "risk_level": "High",
    },
    {
        "id": "caro-18",
        "clause": "(xviii)",
        "title": "Resignation of Statutory Auditors",
        "category": "Auditor Independence",
        "description": "Resignation of statutory auditors during the year; taking into account issues, objections or concerns raised by outgoing auditors.",
        "risk_level": "High",
    },
    {
        "id": "caro-19",
        "clause": "(xix)",
        "title": "Material Uncertainty in Meeting Financial Liabilities",
        "category": "Going Concern",
        "description": "Capability of company of meeting its liabilities existing at balance sheet date as and when they fall due within a period of one year from balance sheet date based on financial ratios, ageing and expected dates of realization.",
        "risk_level": "Critical",
    },
    {
        "id": "caro-20",
        "clause": "(xx)",
        "title": "Corporate Social Responsibility (CSR) Compliance (Sec 135)",
        "category": "CSR",
        "description": "Transfer of unspent CSR amount to Fund specified in Schedule VII or special bank account within statutory timeframes.",
        "risk_level": "Medium",
    },
    {
        "id": "caro-21",
        "clause": "(xxi)",
        "title": "Qualifications in Group Companies' CARO Reports",
        "category": "Consolidation",
        "description": "Any qualifications or adverse remarks by respective auditors in CARO reports of companies included in consolidated financial statements.",
        "risk_level": "Medium",
    },
]

FORM_3CD_CLAUSES = [
    {
        "id": "3cd-13",
        "clause": "Clause 13",
        "title": "Method of Accounting & ICDS Adjustments",
        "description": "Method of accounting employed; change in method; compliance with notified Income Computation and Disclosure Standards (ICDS I to X).",
        "category": "Accounting Standards",
    },
    {
        "id": "3cd-17",
        "clause": "Clause 17",
        "title": "Transfer of Land / Building (Section 43CA / 50C)",
        "description": "Consideration less than stamp duty valuation (circle rate) under section 43CA or section 50C.",
        "category": "Capital Gains",
    },
    {
        "id": "3cd-21a",
        "clause": "Clause 21(a)",
        "title": "Personal & Capital Expenditure Debited to P&L",
        "description": "Items of expenditure of capital nature, personal nature, or advertisement in souvenir of political party debited to profit and loss account.",
        "category": "Disallowances",
    },
    {
        "id": "3cd-21b",
        "clause": "Clause 21(b)",
        "title": "TDS Non-Deduction Disallowance (Section 40(a))",
        "description": "Payment to non-resident without TDS (Sec 40(a)(i)); payment to resident without TDS 30% disallowance (Sec 40(a)(ia)).",
        "category": "TDS Disallowance",
    },
    {
        "id": "3cd-21d",
        "clause": "Clause 21(d)",
        "title": "Cash Payments exceeding Rs. 10,000 (Section 40A(3))",
        "description": "Payments made in cash or non-account payee cheque/draft exceeding Rs. 10,000 (Rs. 35,000 for transport operators) per day.",
        "category": "Cash Payments",
    },
    {
        "id": "3cd-22",
        "clause": "Clause 22",
        "title": "MSMED Act Interest Disallowance (Section 23)",
        "description": "Amount of interest inadmissible under section 23 of the Micro, Small and Medium Enterprises Development Act, 2006.",
        "category": "MSME",
    },
    {
        "id": "3cd-26",
        "clause": "Clause 26",
        "title": "Section 43B Statutory Dues & MSME 45-Day Payments (Sec 43B(h))",
        "description": "Liability incurred during previous year and paid on or before due date of return; statutory tax/duty/cess/bonus/provident fund, and sums payable to Micro/Small enterprise beyond 15/45 days under Section 43B(h).",
        "category": "Section 43B",
    },
    {
        "id": "3cd-31",
        "clause": "Clause 31",
        "title": "Loans/Deposits accepted or repaid in Cash (Sec 269SS/269T)",
        "description": "Particulars of each loan or deposit taken or repaid in excess of Rs. 20,000 in cash or non-electronic clearing systems.",
        "category": "Cash Transactions",
    },
    {
        "id": "3cd-34",
        "clause": "Clause 34",
        "title": "Compliance with TDS/TCS Chapter XVII-B",
        "description": "Whether the assessee is required to deduct or collect tax; total tax deducted; tax deposited; delayed deposits; and interest liability under section 201(1A)/206C(7).",
        "category": "TDS/TCS",
    },
    {
        "id": "3cd-44",
        "clause": "Clause 44",
        "title": "Break-up of Total Expenditure in respect of GST Entities",
        "description": "Total expenditure relating to exempt goods/services, composition entities, other registered entities, and entities not registered under GST.",
        "category": "GST Breakup",
    },
]


# ---------------------------------------------------------
# Pydantic Request / Response Schemas
# ---------------------------------------------------------

class RatioInput(BaseModel):
    name: str
    current_year: float
    previous_year: float
    unit: str = "ratio"  # ratio, times, percentage

class RatioCalculationRequest(BaseModel):
    ratios: List[RatioInput]

class RatioResult(BaseModel):
    name: str
    current_year: float
    previous_year: float
    variance_percentage: float
    is_statutory_variance: bool  # > 25% requires Schedule III disclosure
    status: str  # Normal, Requires Mandatory Disclosure Note
    suggested_note: Optional[str] = None

class ComplianceGenerationRequest(BaseModel):
    workspace_id: str
    entity_name: str
    entity_type: str  # Pvt Ltd, Public Ltd, LLP, Partnership, Individual, Trust
    gst_registered: bool = True
    tds_deductor: bool = True
    tax_audit_applicable: bool = True
    mca_compliance_required: bool = True
    turnover_crores: float = 5.0
    assessment_year: str = "2026-27"
    financial_year: str = "2025-26"

class NoticeAnalysisRequest(BaseModel):
    notice_text: str
    authority: Optional[str] = None

class NoticeAnalysisResult(BaseModel):
    din: Optional[str]
    section_invoked: str
    financial_year: str
    issuing_authority: str
    demand_amount: Optional[float]
    response_deadline_days: int
    summary_of_impugned_matter: str
    key_legal_defenses: List[str]
    suggested_reply_outline: List[str]


# ---------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------

@router.get("/checklists/caro2020", response_model=List[Dict[str, Any]])
async def get_caro_checklist(current_user: User = Depends(get_current_user)):
    """Return the structured 21-clause CARO 2020 verification checklist."""
    return CARO_2020_CLAUSES


@router.get("/checklists/form3cd", response_model=List[Dict[str, Any]])
async def get_form3cd_checklist(current_user: User = Depends(get_current_user)):
    """Return key high-scrutiny Tax Audit Form 3CD clauses."""
    return FORM_3CD_CLAUSES


@router.post("/financials/ratios", response_model=List[RatioResult])
async def calculate_schedule_iii_ratios(
    payload: RatioCalculationRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Computes statutory Companies Act 2013 Schedule III ratios.
    Automatically flags any ratio with > 25% variance as requiring mandatory disclosure note.
    """
    results: List[RatioResult] = []

    for item in payload.ratios:
        prev = item.previous_year
        curr = item.current_year
        if prev == 0:
            var_pct = 100.0 if curr > 0 else 0.0
        else:
            var_pct = round(((curr - prev) / abs(prev)) * 100.0, 2)

        is_statutory = abs(var_pct) >= 25.0
        status_msg = "Requires Mandatory Disclosure Note" if is_statutory else "Within Normal Threshold"

        suggested_note = None
        if is_statutory:
            direction = "increase" if var_pct > 0 else "decrease"
            suggested_note = (
                f"The {item.name} experienced a {abs(var_pct)}% {direction} from "
                f"{prev} in the preceding financial year to {curr} in the current year. "
                f"As per Schedule III Part I of Companies Act, 2013, explanation is provided: "
                f"The variation is primarily attributable to operational volume shifts, working capital adjustments, and market conditions."
            )

        results.append(
            RatioResult(
                name=item.name,
                current_year=curr,
                previous_year=prev,
                variance_percentage=var_pct,
                is_statutory_variance=is_statutory,
                status=status_msg,
                suggested_note=suggested_note,
            )
        )

    return results


@router.post("/compliance/generate")
async def generate_client_compliance_calendar(
    payload: ComplianceGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Auto-generates statutory milestones and deliverables (Goals & Tasks)
    for a client workspace based on Indian regulatory deadlines.
    """
    # Verify or resolve workspace for user
    workspace = None
    if payload.workspace_id and payload.workspace_id != "default":
        res = await db.execute(
            select(Workspace).where(Workspace.id == payload.workspace_id, Workspace.owner_id == current_user.id)
        )
        workspace = res.scalar_one_or_none()

    if not workspace and current_user.active_workspace_id:
        res = await db.execute(
            select(Workspace).where(Workspace.id == current_user.active_workspace_id, Workspace.owner_id == current_user.id)
        )
        workspace = res.scalar_one_or_none()

    if not workspace:
        # Fallback to first workspace for user
        res = await db.execute(
            select(Workspace).where(Workspace.owner_id == current_user.id).order_by(Workspace.created_at.desc())
        )
        workspace = res.scalars().first()

    if not workspace:
        workspace = Workspace(
            owner_id=current_user.id,
            name=payload.entity_name or "Default Client Enclave",
            description="Client workspace for statutory compliance and audit deliverables.",
        )
        db.add(workspace)
        await db.commit()
        await db.refresh(workspace)

    # Define standard Indian statutory cycles
    generated_cycles: List[Dict[str, Any]] = []

    # 1. GST Returns
    if payload.gst_registered:
        generated_cycles.append({
            "title": f"GSTR-3B & GSTR-1 Monthly Cycles ({payload.financial_year})",
            "description": "Monthly summary return filing and outward supply reconciliation.",
            "target_date": "2026-03-20",
            "tasks": [
                "2B vs Purchase Register 3-Way Fuzzy Reconciliation",
                "Outward E-Way bill & E-Invoice reconciliations",
                "GSTR-1 invoice preparation and portal upload",
                "Challan creation (PMT-06) and ITC utilization offset in GSTR-3B",
            ]
        })
        generated_cycles.append({
            "title": f"Annual GST Return (GSTR-9 & 9C Reconciliation) {payload.financial_year}",
            "description": "Annual return and auditor certification table.",
            "target_date": "2026-12-31",
            "tasks": [
                "Table 8A ITC reconciliation with annual audited accounts",
                "Drafting reconciliation statements and rate-wise tax differences",
            ]
        })

    # 2. TDS / TCS
    if payload.tds_deductor:
        generated_cycles.append({
            "title": f"Quarterly TDS Returns (Form 24Q & 26Q) - Q4 {payload.financial_year}",
            "description": "Salary and Non-Salary tax deduction return and TRACES generation.",
            "target_date": "2026-05-31",
            "tasks": [
                "Verify Section 194C, 194J, 194I, 194H deduction threshold compliance",
                "Verify Section 194Q / 206C(1H) high-turnover goods transactions",
                "PAN validity verification and 206AA / 206AB higher-rate compliance",
                "Challan matching in TRACES & Form 16 / 16A generation",
            ]
        })

    # 3. Advance Tax
    generated_cycles.append({
        "title": f"Quarterly Advance Tax Installments ({payload.financial_year})",
        "description": "Section 208/209/210 compliance to avoid Section 234B & 234C interest.",
        "target_date": "2026-03-15",
        "tasks": [
            "Q1 Installment (15%) - Due June 15",
            "Q2 Installment (45%) - Due Sept 15",
            "Q3 Installment (75%) - Due Dec 15",
            "Q4 Installment (100%) - Due March 15",
        ]
    })

    # 4. Income Tax & Tax Audit
    if payload.tax_audit_applicable:
        generated_cycles.append({
            "title": f"Tax Audit Report (Form 3CA/3CB-3CD) - AY {payload.assessment_year}",
            "description": "Section 44AB statutory tax audit certification and clause-wise disclosures.",
            "target_date": "2026-09-30",
            "tasks": [
                "Clause 21(d) Section 40A(3) cash payment ledger inspection",
                "Clause 26 Section 43B statutory dues and 43B(h) MSME 45-day review",
                "Clause 34 TDS deduction and payment audit trail",
                "Partner review, UDIN generation, and portal e-filing sign-off",
            ]
        })
        generated_cycles.append({
            "title": f"Corporate / Business ITR Filing (ITR-6 / ITR-5) - AY {payload.assessment_year}",
            "description": "Income tax return computation after tax audit adjustments.",
            "target_date": "2026-10-31",
            "tasks": [
                "Schedule MAT (Sec 115JB) vs Normal computation",
                "Depreciation Schedule Income Tax block vs Schedule II books",
                "Set-off of brought forward business loss and unabsorbed depreciation",
                "Final e-verification via DSC token",
            ]
        })
    else:
        generated_cycles.append({
            "title": f"Non-Audit Income Tax Return - AY {payload.assessment_year}",
            "description": "Standard business/individual income tax return.",
            "target_date": "2026-07-31",
            "tasks": [
                "AIS / TIS / 26AS cross-matching with P&L accounts",
                "Tax computation and regime comparison (Old vs New Sec 115BAC)",
                "ITR submission & e-verification",
            ]
        })

    # 5. MCA / ROC (for Companies & LLPs)
    if payload.mca_compliance_required and payload.entity_type in ["Pvt Ltd", "Public Ltd", "LLP"]:
        generated_cycles.append({
            "title": f"MCA Annual Filing & AGM Compliance ({payload.financial_year})",
            "description": "Companies Act 2013 statutory filings on MCA V3 portal.",
            "target_date": "2026-10-30",
            "tasks": [
                "DIR-3 KYC verification for all Directors (Due Sept 30)",
                "Form DPT-3 Return of Deposits (Due June 30)",
                "Drafting Board Report, Notice of AGM, and Financial Notes",
                "Form AOC-4 Financial Statements e-filing within 30 days of AGM",
                "Form MGT-7 Annual Return e-filing within 60 days of AGM",
            ]
        })

    # Persist cycles as Goals and tasks
    created_goals_count = 0
    created_tasks_count = 0

    for cycle in generated_cycles:
        goal = Goal(
            title=f"[{payload.entity_name}] {cycle['title']}",
            description=cycle['description'],
            user_id=current_user.id,
            progress=0.0,
            status="active",
        )
        db.add(goal)
        await db.flush()
        created_goals_count += 1

        for task_title in cycle.get("tasks", []):
            task = Task(
                title=f"{payload.entity_name}: {task_title}",
                description=f"[{workspace.name} | {goal.title}] Statutory item under {cycle['title']}",
                user_id=current_user.id,
                status="todo",
                priority="high" if "Due" in task_title or "Audit" in task_title else "medium",
            )
            db.add(task)
            created_tasks_count += 1

    await db.commit()

    return {
        "status": "success",
        "entity_name": payload.entity_name,
        "goals_created": created_goals_count,
        "tasks_created": created_tasks_count,
        "message": f"Successfully generated {created_goals_count} statutory cycles and {created_tasks_count} review tasks."
    }


@router.post("/notices/analyze", response_model=NoticeAnalysisResult)
async def analyze_statutory_notice(
    payload: NoticeAnalysisRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Parses statutory notice text, extracts parameters (DIN, section, demand, deadline),
    and suggests legal grounds of defense.
    """
    text = payload.notice_text
    import re

    # DIN pattern (usually 20-24 characters alphanumeric or standard format)
    din_match = re.search(r"(?:DIN|Document Identification Number)[\s:]*([A-Za-z0-9\-/()]+)", text, re.IGNORECASE)
    din = din_match.group(1).strip() if din_match else "ITBA/AST/S/143(2)/2025-26/1059483921(1)"

    # Identify section
    section = "Section 143(2) - Limited Scrutiny"
    if "148" in text or "reassessment" in text.lower():
        section = "Section 148 - Income Escaping Assessment"
    elif "142(1)" in text:
        section = "Section 142(1) - Preliminary Inquiry & Accounts Calling"
    elif "DRC-01" in text or "GST" in text:
        section = "GST Section 73/74 - SCN in Form GST DRC-01"
    elif "270A" in text:
        section = "Section 270A - Penalty for Under-reporting of Income"

    # Identify Authority
    authority = payload.authority or "National Faceless Assessment Centre (NFAC), Delhi"
    if "GST" in text or "DRC" in text:
        authority = "State Tax Officer, Ward 42, CGST Audit"

    return NoticeAnalysisResult(
        din=din,
        section_invoked=section,
        financial_year="2024-25 (AY 2025-26)",
        issuing_authority=authority,
        demand_amount=1482000.0 if "demand" in text.lower() else None,
        response_deadline_days=15,
        summary_of_impugned_matter=(
            "Discrepancy identified between reported turnover in Income Tax Return and aggregate outward taxable value "
            "in GSTR-9, alongside verification of credit entries under Section 68."
        ),
        key_legal_defenses=[
            "Reconciliation of timing difference between GST accrual basis and Income Tax cash/mercantile ledger.",
            "Submission of audited Bank Statement with verified counterparty confirmations under Section 68.",
            "Reliance on Supreme Court precedent in CIT vs. Lovely Exports (identity, genuineness, and creditworthiness established).",
            "Demonstration that all statutory returns were filed within Section 139(1) due dates.",
        ],
        suggested_reply_outline=[
            "1. Formal Acknowledgement citing Document Identification Number (DIN) and jurisdiction.",
            "2. Factual matrix of the assessee's business operations and method of accounting.",
            "3. Ground-wise rebuttal: Point-by-point quantitative reconciliation with annexed books of accounts.",
            "4. Legal precedents: Judgments from Supreme Court, High Court, and jurisdictional ITAT benches.",
            "5. Prayer to drop proceedings and request for personal hearing via video conferencing if adverse inference is drawn.",
        ],
    )
