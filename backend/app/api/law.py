"""
Legal Practice & Law Firm domain API endpoints (/api/law).
Provides Limitation Period calculations under Limitation Act 1963 and Commercial Courts Act 2015,
Landmark Case Law Precedents lookup, Cause List hearing trackers, and
automated procedural litigation schedules.
"""

from datetime import date, datetime, timedelta
import copy
import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.workspace import Workspace
from app.models.goal import Goal
from app.models.task import Task

router = APIRouter(prefix="/law", tags=["Law & Legal Practice"])


# ---------------------------------------------------------
# Master Data: Limitation Act 1963 & Procedural Rules
# ---------------------------------------------------------

LIMITATION_CATEGORIES = [
    {
        "id": "lim-contract-debt",
        "title": "Suits Relating to Contracts & Debt Recovery",
        "statute": "Limitation Act, 1963 - Articles 14, 15, 18, 55",
        "period_years": 3.0,
        "period_days": 1095,
        "court_forum": "Civil Court / Commercial Court",
        "applies_sec_5": False,  # Section 5 does NOT apply to original suits
        "description": "3 years from when the debt becomes payable, breach of contract occurs, or last part-payment / written acknowledgment under Section 18.",
        "key_principles": [
            "Section 18 Limitation Act: Fresh period of limitation begins from valid written acknowledgment of liability.",
            "Section 19 Limitation Act: Fresh period starts upon part-payment of debt by debtor before expiration of limitation.",
            "Section 5 (Condonation of Delay) DOES NOT apply to original suits; suit must be dismissed under Section 3 even if limitation not pleaded."
        ]
    },
    {
        "id": "lim-specific-perf",
        "title": "Specific Performance of Contract",
        "statute": "Limitation Act, 1963 - Article 54",
        "period_years": 3.0,
        "period_days": 1095,
        "court_forum": "Civil Court / Commercial Court",
        "applies_sec_5": False,
        "description": "3 years from the date fixed for performance, or if no date is fixed, when the plaintiff has notice that performance is refused.",
        "key_principles": [
            "Part 1: If agreement specifies fixed date for execution, 3 years starts strictly from that calendar date.",
            "Part 2: If no date fixed, starts from unequivocal refusal by defendant.",
            "Readiness and willingness (Sec 16(c) Specific Relief Act) must be maintained throughout."
        ]
    },
    {
        "id": "lim-commercial-suit",
        "title": "Commercial Suit (Commercial Courts Act, 2015)",
        "statute": "Commercial Courts Act 2015 (Sec 12A) & Order VIII Rule 1 CPC Amendment",
        "period_years": 3.0,
        "period_days": 1095,
        "court_forum": "Designated Commercial Court / Commercial Division High Court",
        "applies_sec_5": False,
        "description": "3 years for suit; 120-day absolute ceiling for filing Written Statement from date of summons; mandatory Sec 12A mediation exclusion.",
        "key_principles": [
            "SCG Contracts India v. K.S. Chamankar Infrastructure (2019 SC): 120-day outer limit for Written Statement is mandatory with forfeiture of defense.",
            "Section 12A: Mandatory Pre-Institution Mediation tolls limitation period during mediation pendency (excluded from calculation).",
            "Specified value threshold must be met (ordinarily Rs. 3 Lakhs or higher)."
        ]
    },
    {
        "id": "lim-immovable-property",
        "title": "Recovery of Possession of Immovable Property",
        "statute": "Limitation Act, 1963 - Articles 64 & 65",
        "period_years": 12.0,
        "period_days": 4380,
        "court_forum": "Civil Court",
        "applies_sec_5": False,
        "description": "12 years for recovery of possession based on proprietary title, running from when possession of defendant becomes adverse to plaintiff.",
        "key_principles": [
            "Article 65 applies to title-based ejectment; burden is on defendant to prove open, continuous, and hostile adverse possession for 12 years.",
            "Article 64 applies to suits based on previous dispossession (runs from dispossession date)."
        ]
    },
    {
        "id": "lim-tort-defamation",
        "title": "Compensation for Defamation & Civil Wrong",
        "statute": "Limitation Act, 1963 - Articles 75 & 76",
        "period_years": 1.0,
        "period_days": 365,
        "court_forum": "Civil Court",
        "applies_sec_5": False,
        "description": "1 year from when the libel is published or words spoken, or when injury accrues.",
        "key_principles": [
            "Strict 1-year window from date of defamatory publication.",
            "In continuing wrong (Sec 22), fresh period of limitation begins at every moment."
        ]
    },
    {
        "id": "lim-appeal-hc",
        "title": "First Appeal / Regular Appeal to High Court",
        "statute": "Limitation Act, 1963 - Article 116(a)",
        "period_years": 0.25,
        "period_days": 90,
        "court_forum": "High Court (Appellate Jurisdiction)",
        "applies_sec_5": True,
        "description": "90 days from the date of the decree or order appealed against under Section 96 or Order 41 CPC.",
        "key_principles": [
            "Section 12 Limitation Act: Time requisite for obtaining certified copy of judgment/decree is excluded.",
            "Section 5 (Condonation of Delay) is applicable upon showing sufficient cause (Collector Land Acquisition v. Katiji)."
        ]
    },
    {
        "id": "lim-appeal-district",
        "title": "Appeal to District Court / Sessions Court",
        "statute": "Limitation Act, 1963 - Article 116(b)",
        "period_years": 0.08,
        "period_days": 30,
        "court_forum": "District Court",
        "applies_sec_5": True,
        "description": "30 days from decree or order of trial court subordinate to District Court.",
        "key_principles": [
            "Certified copy calculation under Section 12 applies.",
            "Section 5 condonation application supported by affidavit must accompany delayed memo of appeal."
        ]
    },
    {
        "id": "lim-slp-sc",
        "title": "Special Leave Petition (SLP) to Supreme Court",
        "statute": "Supreme Court Rules, 2013 & Limitation Act - Article 133",
        "period_years": 0.25,
        "period_days": 90,
        "court_forum": "Supreme Court of India",
        "applies_sec_5": True,
        "description": "90 days from the date of High Court judgment or order; 60 days if High Court certificate of fitness is refused.",
        "key_principles": [
            "Exclusion of certified copy application period under Supreme Court Rules Order XXI.",
            "Section 5 condonation petition requires day-to-day explanation of delay."
        ]
    },
    {
        "id": "lim-sec34-arbitration",
        "title": "Setting Aside Arbitral Award (Section 34)",
        "statute": "Arbitration and Conciliation Act, 1996 - Section 34(3)",
        "period_years": 0.25,
        "period_days": 90,
        "court_forum": "Commercial Court / High Court Original Side",
        "applies_sec_5": False,  # Strict statutory grace of 30 days only; Sec 5 excluded
        "description": "3 months from receipt of signed arbitral award, with a maximum discretionary condonable extension of 30 days only.",
        "key_principles": [
            "Union of India v. Popular Construction Co. (2001 SC): Section 5 Limitation Act excluded by necessary implication.",
            "Court has NO jurisdiction to condone delay beyond 30 days after the 3 months period."
        ]
    },
    {
        "id": "lim-ibc-petition",
        "title": "Insolvency Petition under Section 7 or 9 IBC",
        "statute": "Insolvency and Bankruptcy Code, 2016 & Limitation Act Article 137",
        "period_years": 3.0,
        "period_days": 1095,
        "court_forum": "National Company Law Tribunal (NCLT)",
        "applies_sec_5": True,
        "description": "3 years from the date of financial or operational default (Article 137 Limitation Act applicable per Section 238A IBC).",
        "key_principles": [
            "B.K. Educational Services v. Parag Gupta & Associates (2018 SC): Article 137 applies from date of default.",
            "Section 18 acknowledgment in balance sheets extends limitation (Asset Reconstruction Co v. Bishal Homes)."
        ]
    },
    {
        "id": "lim-sec138-ni",
        "title": "Cheque Bounce Complaint (Section 138 NI Act)",
        "statute": "Negotiable Instruments Act, 1881 - Section 138 & 142",
        "period_years": 0.08,
        "period_days": 30,
        "court_forum": "Judicial Magistrate / Metropolitan Magistrate",
        "applies_sec_5": True,
        "description": "Notice within 30 days of memo of dishonour; 15 days payment window; complaint within 30 days of cause of action.",
        "key_principles": [
            "Statutory notice under Sec 138(b) must be issued within 30 days of intimation from bank.",
            "Cause of action arises on 16th day after receipt of notice (if unpaid).",
            "Section 142(1)(b) proviso allows magistrate to condone delay upon sufficient cause."
        ]
    }
]


# ---------------------------------------------------------
# Master Data: Landmark Case Law Precedents
# ---------------------------------------------------------

LANDMARK_PRECEDENTS = [
    {
        "id": "prec-kesavananda",
        "case_name": "Kesavananda Bharati Sripadagalvaru v. State of Kerala",
        "citation": "(1973) 4 SCC 225",
        "neutral_citation": "1973 INSC 258",
        "court": "Supreme Court of India",
        "year": 1973,
        "bench_size": 13,
        "practice_area": "Constitutional Law",
        "ratio_decidendi": "Parliament has wide power to amend the Constitution under Article 368, but this amending power cannot be used to alter, damage, or destroy the 'Basic Structure' of the Constitution.",
        "principles": [
            "Basic Structure Doctrine established.",
            "Judicial review is an integral part of the basic structure.",
            "Rule of law, separation of powers, and supremacy of Constitution cannot be abrogated."
        ],
        "status": "Binding Landmark Law",
        "key_passages": "The power of amendment under Article 368 does not include the power to alter the basic structure or framework of the Constitution."
    },
    {
        "id": "prec-maneka-gandhi",
        "case_name": "Maneka Gandhi v. Union of India",
        "citation": "(1978) 1 SCC 248",
        "neutral_citation": "1978 INSC 16",
        "court": "Supreme Court of India",
        "year": 1978,
        "bench_size": 7,
        "practice_area": "Constitutional Law",
        "ratio_decidendi": "Procedure depriving personal liberty under Article 21 must be 'just, fair, and reasonable' and not fanciful, oppressive, or arbitrary. Articles 14, 19, and 21 form an interlinked 'Golden Triangle'.",
        "principles": [
            "Post-decisional hearing and Audi Alteram Partem.",
            "Substantive due process recognized within Article 21.",
            "Natural justice principles read into administrative action."
        ],
        "status": "Binding Landmark Law",
        "key_passages": "Procedure established by law must answer the test of reasonableness in order to be in conformity with Article 14."
    },
    {
        "id": "prec-puttaswamy",
        "case_name": "Justice K.S. Puttaswamy (Retd.) v. Union of India",
        "citation": "(2017) 10 SCC 1",
        "neutral_citation": "2017 INSC 752",
        "court": "Supreme Court of India",
        "year": 2017,
        "bench_size": 9,
        "practice_area": "Constitutional Law & Privacy",
        "ratio_decidendi": "The right to privacy is a fundamental right protected as an intrinsic part of the right to life and personal liberty under Article 21 and Part III of the Constitution. Any encroachment must satisfy the 3-fold proportionality test: legality, legitimate state aim, and proportionality.",
        "principles": [
            "Privacy includes bodily autonomy, informational privacy, and privacy of choice.",
            "Overruled M.P. Sharma (1954) and Kharak Singh (1962) to the extent of privacy denial.",
            "Strict proportionality standard applied to state intrusions."
        ],
        "status": "Binding Landmark Law",
        "key_passages": "Privacy is the ultimate guarantee against encroachment of personal autonomy by the State."
    },
    {
        "id": "prec-vidya-drolia",
        "case_name": "Vidya Drolia and Others v. Durga Trading Corporation",
        "citation": "(2021) 2 SCC 1",
        "neutral_citation": "2020 INSC 697",
        "court": "Supreme Court of India",
        "year": 2020,
        "bench_size": 3,
        "practice_area": "Arbitration & Dispute Resolution",
        "ratio_decidendi": "Established the definitive 4-fold test for non-arbitrability of disputes (rights in rem, affects third party rights, sovereign/public interest functions, and disputes covered by specialized statutory tribunals). Landlord-tenant disputes under Transfer of Property Act are arbitrable.",
        "principles": [
            "Section 8 & 11 referral court standard: 'Prima facie' review only; when in doubt, refer to arbitration.",
            "Competence-Competence: Arbitral Tribunal has primary jurisdiction to rule on jurisdiction and validity.",
            "Arbitrability of tenancy and commercial lease claims upheld."
        ],
        "status": "Binding Landmark Law",
        "key_passages": "The court at the referral stage must only see whether the arbitration agreement prima facie exists. Full merits examination belongs to the arbitrator."
    },
    {
        "id": "prec-scg-contracts",
        "case_name": "SCG Contracts (India) Pvt. Ltd. v. K.S. Chamankar Infrastructure",
        "citation": "(2019) 12 SCC 210",
        "neutral_citation": "2019 INSC 182",
        "court": "Supreme Court of India",
        "year": 2019,
        "bench_size": 2,
        "practice_area": "Commercial Litigation & CPC",
        "ratio_decidendi": "In commercial suits governed by the Commercial Courts Act 2015, the 120-day outer ceiling for filing a Written Statement under Order VIII Rule 1 CPC is mandatory and non-extendable. Courts have no inherent power under Section 151 CPC to condone delay beyond 120 days.",
        "principles": [
            "Right to file Written Statement is forfeited immediately upon expiration of 120 days from summons service.",
            "Inherent power under Section 151 CPC cannot bypass express statutory prohibition.",
            "Applies strictly to all commercial suits above specified value."
        ],
        "status": "Binding Landmark Law",
        "key_passages": "Beyond 120 days from the date of service of summons, the defendant shall forfeit the right to file the written statement and the Court shall not allow the written statement to be taken on record."
    },
    {
        "id": "prec-innoventive",
        "case_name": "Innoventive Industries Ltd. v. ICICI Bank",
        "citation": "(2018) 1 SCC 407",
        "neutral_citation": "2017 INSC 863",
        "court": "Supreme Court of India",
        "year": 2017,
        "bench_size": 2,
        "practice_area": "Insolvency & Bankruptcy",
        "ratio_decidendi": "Under Section 7 of IBC, the Adjudicating Authority (NCLT) only needs to verify whether a 'default' of financial debt has occurred. Once default is established and application is complete, admission of CIRP is mandatory regardless of disputes on liability or counterclaims.",
        "principles": [
            "Scheme of Section 7 vs Section 9 IBC distinguished.",
            "Speedy resolution and timeline discipline under IBC.",
            "State relief undertaking statutes subordinate to non-obstante clause of Section 238 IBC."
        ],
        "status": "Binding Landmark Law",
        "key_passages": "For a financial creditor, the moment the adjudicating authority is satisfied that a default has occurred, the application must be admitted unless it is incomplete."
    },
    {
        "id": "prec-arnesh-kumar",
        "case_name": "Arnesh Kumar v. State of Bihar",
        "citation": "(2014) 8 SCC 273",
        "neutral_citation": "2014 INSC 492",
        "court": "Supreme Court of India",
        "year": 2014,
        "bench_size": 2,
        "practice_area": "Criminal Procedure & Bail",
        "ratio_decidendi": "Arrest should not be made routinely in offences punishable with imprisonment up to 7 years. Police officers must serve Notice of Appearance under Section 41A CrPC (now Section 35 BNSS) and record reasons before arrest.",
        "principles": [
            "Strict compliance with Section 41 and 41A CrPC checklist required.",
            "Magistrates must not authorize mechanical detention under Section 167.",
            "Contempt proceedings against errant police officers failing to comply."
        ],
        "status": "Binding Landmark Law",
        "key_passages": "Arrest brings humiliation, curtails freedom and casts scars forever. No arrest should be made without reasonable satisfaction reached after some investigation."
    },
    {
        "id": "prec-babu-lal",
        "case_name": "Babu Lal v. Hazari Lal Kishori Lal",
        "citation": "(1982) 1 SCC 525",
        "neutral_citation": "1982 INSC 38",
        "court": "Supreme Court of India",
        "year": 1982,
        "bench_size": 3,
        "practice_area": "Civil Procedure & Specific Relief",
        "ratio_decidendi": "In a decree for specific performance of sale of immovable property, the relief of possession is inherent. Under Section 22(2) of Specific Relief Act, plaintiff can amend the plaint to claim possession at any stage of proceedings, including in execution.",
        "principles": [
            "Specific Relief Act Section 22(2) liberal interpretation.",
            "Execution court power to deliver possession incidental to specific performance decree.",
            "Multiplicity of proceedings to be strictly avoided."
        ],
        "status": "Binding Landmark Law",
        "key_passages": "The expression 'at any stage of proceeding' in Section 22(2) includes execution proceedings and the court can permit amendment even at the appellate stage."
    },
    {
        "id": "prec-balco",
        "case_name": "Bharat Aluminium Co. (BALCO) v. Kaiser Aluminium Technical Services",
        "citation": "(2012) 9 SCC 552",
        "neutral_citation": "2012 INSC 370",
        "court": "Supreme Court of India",
        "year": 2012,
        "bench_size": 5,
        "practice_area": "Arbitration & International Law",
        "ratio_decidendi": "Part I of the Arbitration and Conciliation Act, 1996 applies only where the seat of arbitration is in India. Indian courts have no jurisdiction to entertain Section 9 interim relief or Section 34 challenges in foreign-seated arbitrations.",
        "principles": [
            "Overruled Bhatia International (2002) and Venture Global (2008) prospectively.",
            "Territoriality principle of arbitration seat enshrined.",
            "Choice of foreign seat excludes supervisory jurisdiction of Indian courts."
        ],
        "status": "Binding Landmark Law",
        "key_passages": "Part I of the Arbitration Act, 1996 is inapplicable to foreign-seated international commercial arbitrations."
    },
    {
        "id": "prec-lalita-kumari",
        "case_name": "Lalita Kumari v. Government of U.P.",
        "citation": "(2014) 2 SCC 1",
        "neutral_citation": "2013 INSC 790",
        "court": "Supreme Court of India",
        "year": 2013,
        "bench_size": 5,
        "practice_area": "Criminal Law & Procedure",
        "ratio_decidendi": "Registration of FIR is mandatory under Section 154 of CrPC if information discloses commission of a cognizable offence and no preliminary inquiry is permissible in such situation.",
        "principles": [
            "Mandatory FIR registration upon disclosure of cognizable offence.",
            "Preliminary inquiry limited to medical negligence, matrimonial, corruption, commercial disputes, and abnormal delay.",
            "Preliminary inquiry time capped at 7 to 15 days."
        ],
        "status": "Binding Landmark Law",
        "key_passages": "The use of the word 'shall' in Section 154(1) of the Code clearly shows the legislative intent that it is mandatory to register an FIR upon receipt of cognizable information."
    }
]


# ---------------------------------------------------------
# Master Data: Live Cause List Sample Data
# ---------------------------------------------------------

INITIAL_CAUSE_LIST = [
    {
        "id": "cl-1",
        "item_number": 4,
        "case_number": "W.P.(C) 4120/2025",
        "parties": "Apex Logistics Infrastructure Ltd. v. Union of India & Ors.",
        "court_name": "High Court of Delhi",
        "bench": "Hon'ble Mr. Justice Yashwant Varma & Hon'ble Mr. Justice Dharmesh Sharma",
        "court_room": "Court Room No. 3",
        "stage": "Admission & Interim Relief",
        "list_type": "Daily Board (Morning)",
        "hearing_date": "2026-11-18",
        "session": "10:30 AM",
        "advocate_counsel": "Senior Adv. Siddharth Aggarwal / Adv. Rohan Sharma",
        "status": "Item in Progress",
        "notes": "Matter called out; Senior counsel addressing court on tender disqualification grounds."
    },
    {
        "id": "cl-2",
        "item_number": 12,
        "case_number": "CS(COMM) 105/2026",
        "parties": "Zenith Pharmaceutical Corp v. Biocure Lifesciences Pvt. Ltd.",
        "court_name": "High Court of Delhi",
        "bench": "Hon'ble Ms. Justice Prathiba M. Singh",
        "court_room": "Court Room No. 24",
        "stage": "Framing of Issues & Interim Injunction (Order 39)",
        "list_type": "Regular List",
        "hearing_date": "2026-11-18",
        "session": "11:30 AM",
        "advocate_counsel": "Adv. Meenakshi Sundaram / Adv. Ananya Roy",
        "status": "Next Item",
        "notes": "Patent infringement suit. Caveat entered by defendant. Technical expert affidavit filed."
    },
    {
        "id": "cl-3",
        "item_number": 21,
        "case_number": "ARB.P. 892/2024",
        "parties": "Metro Engineering Consortium v. Delhi Metro Rail Corporation",
        "court_name": "High Court of Delhi",
        "bench": "Hon'ble Mr. Justice Sanjeev Sachdeva",
        "court_room": "Court Room No. 11",
        "stage": "Section 11 Appointment of Sole Arbitrator",
        "list_type": "Supplementary List",
        "hearing_date": "2026-11-18",
        "session": "02:00 PM",
        "advocate_counsel": "Senior Adv. Arvind Nigam / Adv. Gaurav Jain",
        "status": "Passed Over",
        "notes": "Passed over on first call on joint request of parties to verify tribunal nominee pool."
    },
    {
        "id": "cl-4",
        "item_number": 2,
        "case_number": "SLP(C) 19283/2025",
        "parties": "National Highways Authority of India v. Oriental Structural Engineers",
        "court_name": "Supreme Court of India",
        "bench": "Hon'ble The Chief Justice of India & Hon'ble Mr. Justice J.B. Pardiwala",
        "court_room": "Court No. 1",
        "stage": "Notice Returnable / Final Disposal",
        "list_type": "Motion Hearing",
        "hearing_date": "2026-11-18",
        "session": "10:30 AM",
        "advocate_counsel": "Senior Adv. Tushar Mehta (SG) / Adv. M.V. Kini",
        "status": "Heard & Reserved",
        "notes": "Arguments concluded on Section 34 patent illegality ground; judgment reserved."
    },
    {
        "id": "cl-5",
        "item_number": 35,
        "case_number": "CP(IB) 450/ND/2025",
        "parties": "State Bank of India v. Horizon Steel & Power Ltd.",
        "court_name": "NCLT New Delhi (Principal Bench)",
        "bench": "Hon'ble Chief Justice (Retd.) Ramalingam Sudhakar & Hon'ble Member (T) Avinash Srivastava",
        "court_room": "Court Room No. 1",
        "stage": "Section 7 CIRP Admission",
        "list_type": "Daily Board",
        "hearing_date": "2026-11-18",
        "session": "02:30 PM",
        "advocate_counsel": "Adv. Bishwajit Dubey / Adv. Anupm Prakash",
        "status": "Scheduled",
        "notes": "Financial creditor debt default Rs. 142 Crores. OTS proposal rejected."
    },
    {
        "id": "cl-6",
        "item_number": 8,
        "case_number": "CRL.A. 219/2024",
        "parties": "Vikramaditya Roy v. State (NCT of Delhi)",
        "court_name": "High Court of Delhi",
        "bench": "Hon'ble Mr. Justice Suresh Kumar Kait & Hon'ble Ms. Justice Neena Bansal Krishna",
        "court_room": "Court Room No. 6",
        "stage": "Suspension of Sentence (Sec 389 CrPC / 430 BNSS)",
        "list_type": "Criminal Regular Board",
        "hearing_date": "2026-11-18",
        "session": "12:00 PM",
        "advocate_counsel": "Senior Adv. Kapil Sibal / Adv. Tara Narula",
        "status": "Adjourned",
        "notes": "Adjourned to 25.11.2026 on request of State counsel to file status report."
    }
]

# In-memory storage for newly tracked cause list matters during runtime
live_cause_list: List[Dict[str, Any]] = copy.deepcopy(INITIAL_CAUSE_LIST)


# ---------------------------------------------------------
# Pydantic Request / Response Models
# ---------------------------------------------------------

class LimitationCalculationRequest(BaseModel):
    category_id: str
    cause_of_action_date: str  # YYYY-MM-DD
    acknowledgment_date: Optional[str] = None  # YYYY-MM-DD (Section 18 Limitation Act)
    pre_institution_mediation_days: int = 0  # Section 12A Commercial Courts Act
    court_forum: Optional[str] = None

class LimitationCalculationResult(BaseModel):
    category_id: str
    category_title: str
    statute_reference: str
    cause_of_action_date: str
    acknowledgment_date: Optional[str]
    acknowledgment_valid: Optional[bool] = None
    effective_start_date: str
    pre_institution_mediation_days_excluded: int
    statutory_limitation_days: int
    computed_deadline: str
    days_remaining: int
    is_barred_by_limitation: bool
    condonation_available_under_sec_5: bool
    urgency_tier: str  # "Safe", "Approaching Limitation", "Critical", "Time-Barred"
    commercial_ws_120_day_deadline: Optional[str] = None
    legal_rules: List[str]
    action_recommendation: str

class PrecedentSearchQuery(BaseModel):
    query: Optional[str] = None
    practice_area: Optional[str] = None
    court: Optional[str] = None

class PrecedentMatchRequest(BaseModel):
    facts_or_proposition: str
    practice_area: Optional[str] = None

class PrecedentMatchResult(BaseModel):
    matched_precedents: List[Dict[str, Any]]
    suggested_argument_framing: str

class CauseListTrackRequest(BaseModel):
    item_number: int
    case_number: str
    parties: str
    court_name: str
    bench: str
    court_room: str
    stage: str
    list_type: str = "Daily Board"
    hearing_date: str
    session: str = "10:30 AM"
    advocate_counsel: str
    notes: Optional[str] = None

class CauseListStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

class LitigationScheduleRequest(BaseModel):
    matter_name: str
    case_type: str  # Commercial Suit, Civil Regular Suit, Arbitration, Criminal Appeal, Writ Petition
    court_forum: str
    filing_date: str  # YYYY-MM-DD
    client_name: str
    workspace_id: Optional[str] = "default"


# ---------------------------------------------------------
# Endpoints: Limitation Calculator
# ---------------------------------------------------------

@router.get("/limitation/categories", response_model=List[Dict[str, Any]])
async def get_limitation_categories(current_user: User = Depends(get_current_user)):
    """Return the master list of statutory limitation schedules and articles."""
    return LIMITATION_CATEGORIES


@router.post("/limitation/calculate", response_model=LimitationCalculationResult)
async def calculate_limitation_period(
    payload: LimitationCalculationRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Computes precise limitation deadlines under the Limitation Act 1963,
    incorporating Section 18 acknowledgments and Section 12A mediation tolling.
    """
    category = next((c for c in LIMITATION_CATEGORIES if c["id"] == payload.category_id), None)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Limitation category '{payload.category_id}' not found."
        )

    try:
        coa_dt = datetime.strptime(payload.cause_of_action_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cause_of_action_date format. Must be YYYY-MM-DD."
        )

    statutory_days = category["period_days"]
    original_deadline = coa_dt + timedelta(days=statutory_days)

    # Check for Section 18 acknowledgment
    # Under Section 18(1) Limitation Act, acknowledgment must be made *before* the expiration of the prescribed period
    effective_start = coa_dt
    ack_dt = None
    ack_valid: Optional[bool] = None

    if payload.acknowledgment_date:
        try:
            ack_dt = datetime.strptime(payload.acknowledgment_date, "%Y-%m-%d").date()
            if ack_dt <= coa_dt:
                ack_valid = False
            elif ack_dt > original_deadline:
                # Acknowledgment executed after the original limitation period expired cannot revive a barred claim
                ack_valid = False
                effective_start = coa_dt
            else:
                ack_valid = True
                effective_start = ack_dt
        except ValueError:
            pass

    mediation_days = max(0, payload.pre_institution_mediation_days)

    # Base deadline calculation
    if ack_valid is False and ack_dt and ack_dt > original_deadline:
        base_deadline = original_deadline
    else:
        base_deadline = effective_start + timedelta(days=statutory_days)

    final_deadline = base_deadline + timedelta(days=mediation_days)

    today = date.today()
    days_remaining = (final_deadline - today).days
    is_barred = days_remaining < 0

    if ack_valid is False and ack_dt and ack_dt > original_deadline:
        is_barred = True
        urgency = "Time-Barred"
    elif is_barred:
        urgency = "Time-Barred"
    elif days_remaining <= 15:
        urgency = "Critical"
    elif days_remaining <= 60:
        urgency = "Approaching Limitation"
    else:
        urgency = "Safe"

    # Commercial Court 120-day Written Statement outer limit if applicable
    commercial_ws_deadline = None
    if category["id"] == "lim-commercial-suit":
        ws_deadline = effective_start + timedelta(days=120)
        commercial_ws_deadline = ws_deadline.strftime("%Y-%m-%d")

    # Recommendation
    if ack_valid is False and ack_dt and ack_dt > original_deadline:
        rec = (
            f"CRITICAL: The written acknowledgment dated {ack_dt.strftime('%Y-%m-%d')} was executed after the "
            f"original limitation period expired on {original_deadline.strftime('%Y-%m-%d')}. "
            f"Under Section 18(1) Limitation Act 1963, an acknowledgment must be signed before limitation expires "
            f"to start a fresh period. It cannot revive a time-barred debt (Sampuran Singh v. Niranjan Kaur). Plaint barred under Section 3."
        )
    elif is_barred:
        if category["applies_sec_5"]:
            rec = "Statutory period expired. File application under Section 5 Limitation Act with day-to-day condonation affidavit establishing sufficient cause."
        else:
            rec = "CRITICAL: Original suit time-barred. Section 5 does NOT apply to original suits. Plaint liable to rejection under Order VII Rule 11(d) CPC."
    elif days_remaining <= 15:
        rec = f"EMERGENT ACTION: Only {days_remaining} days left. Finalize plaint, verify statement of truth, and file caveat/e-filing immediately."
    elif days_remaining <= 60:
        rec = "Begin drafting pleadings, secure documentary exhibits and advocate power of attorney (Vakalatnama)."
    else:
        rec = "Limitation is well within statutory timeline. Proceed with normal evidence collation."

    return LimitationCalculationResult(
        category_id=category["id"],
        category_title=category["title"],
        statute_reference=category["statute"],
        cause_of_action_date=coa_dt.strftime("%Y-%m-%d"),
        acknowledgment_date=ack_dt.strftime("%Y-%m-%d") if ack_dt else None,
        acknowledgment_valid=ack_valid,
        effective_start_date=effective_start.strftime("%Y-%m-%d"),
        pre_institution_mediation_days_excluded=mediation_days,
        statutory_limitation_days=statutory_days,
        computed_deadline=final_deadline.strftime("%Y-%m-%d"),
        days_remaining=days_remaining,
        is_barred_by_limitation=is_barred,
        condonation_available_under_sec_5=category["applies_sec_5"],
        urgency_tier=urgency,
        commercial_ws_120_day_deadline=commercial_ws_deadline,
        legal_rules=category["key_principles"],
        action_recommendation=rec
    )


# ---------------------------------------------------------
# Endpoints: Case Law Precedents
# ---------------------------------------------------------

@router.get("/precedents", response_model=List[Dict[str, Any]])
async def get_precedents(
    q: Optional[str] = Query(None, description="Search keyword in case name, citation, or ratio"),
    practice_area: Optional[str] = Query(None, description="Filter by legal practice area"),
    court: Optional[str] = Query(None, description="Filter by court"),
    current_user: User = Depends(get_current_user)
):
    """Search and retrieve landmark Supreme Court and High Court precedents."""
    results = list(LANDMARK_PRECEDENTS)

    if practice_area and practice_area != "All":
        results = [p for p in results if practice_area.lower() in p["practice_area"].lower()]

    if court and court != "All":
        results = [p for p in results if court.lower() in p["court"].lower()]

    if q:
        kw = q.strip().lower()
        results = [
            p for p in results
            if kw in p["case_name"].lower()
            or kw in p["citation"].lower()
            or kw in p["ratio_decidendi"].lower()
            or any(kw in rule.lower() for rule in p["principles"])
        ]

    return results


@router.get("/precedents/{precedent_id}", response_model=Dict[str, Any])
async def get_precedent_by_id(
    precedent_id: str,
    current_user: User = Depends(get_current_user)
):
    """Retrieve full ratio and analytical details of a specific precedent."""
    precedent = next((p for p in LANDMARK_PRECEDENTS if p["id"] == precedent_id), None)
    if not precedent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Precedent '{precedent_id}' not found."
        )
    return precedent


@router.post("/precedents/match", response_model=PrecedentMatchResult)
async def match_precedents_to_case_facts(
    payload: PrecedentMatchRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Matches input propositions or client factual matrix against precedent database,
    identifying binding ratios and suggested advocacy framing.
    """
    text = payload.facts_or_proposition.lower()
    matched: List[Dict[str, Any]] = []

    for prec in LANDMARK_PRECEDENTS:
        score = 0
        if any(w in text for w in ["constitution", "basic structure", "amendment"]) and "kesavananda" in prec["id"]:
            score += 3
        if any(w in text for w in ["liberty", "personal liberty", "article 21", "natural justice", "audi alteram"]) and "maneka" in prec["id"]:
            score += 3
        if any(w in text for w in ["privacy", "aadhaar", "surveillance", "data", "proportionality"]) and "puttaswamy" in prec["id"]:
            score += 3
        if any(w in text for w in ["arbitrat", "arbitral", "tenancy", "section 11", "competence"]) and "vidya-drolia" in prec["id"]:
            score += 3
        if any(w in text for w in ["commercial suit", "written statement", "120 days", "order viii", "scg"]) and "scg" in prec["id"]:
            score += 3
        if any(w in text for w in ["insolvency", "ibc", "section 7", "default", "nclt", "financial creditor"]) and "innoventive" in prec["id"]:
            score += 3
        if any(w in text for w in ["arrest", "41a", "bail", "7 years", "crpc"]) and "arnesh" in prec["id"]:
            score += 3
        if any(w in text for w in ["specific performance", "possession", "execution", "section 22"]) and "babu-lal" in prec["id"]:
            score += 3
        if any(w in text for w in ["foreign seat", "seat", "part i", "balco"]) and "balco" in prec["id"]:
            score += 3
        if any(w in text for w in ["fir", "cognizable", "mandatory fir", "section 154"]) and "lalita" in prec["id"]:
            score += 3

        if score > 0:
            matched.append(prec)

    # If no strict match, return top 3 relevant precedents by practice area
    if not matched:
        if payload.practice_area:
            matched = [p for p in LANDMARK_PRECEDENTS if payload.practice_area.lower() in p["practice_area"].lower()][:3]
        if not matched:
            matched = LANDMARK_PRECEDENTS[:3]

    framing = (
        f"Counsel should place primary reliance on the binding dictum of the Supreme Court in {matched[0]['case_name']} "
        f"({matched[0]['citation']}). Frame the proposition: 'It is a settled proposition of law that {matched[0]['ratio_decidendi']}' "
        f"and demonstrate how the opposing party's contention runs counter to this established ratio."
    )

    return PrecedentMatchResult(
        matched_precedents=matched,
        suggested_argument_framing=framing
    )


# ---------------------------------------------------------
# Endpoints: Cause List Hearing Tracker
# ---------------------------------------------------------

@router.get("/causelist", response_model=List[Dict[str, Any]])
async def get_cause_list(
    court: Optional[str] = Query(None, description="Filter by court name"),
    status: Optional[str] = Query(None, description="Filter by hearing status"),
    search: Optional[str] = Query(None, description="Keyword search in case number or parties"),
    current_user: User = Depends(get_current_user)
):
    """Retrieve active cause list items and hearing schedules."""
    items = list(live_cause_list)

    if court and court != "All":
        items = [i for i in items if court.lower() in i["court_name"].lower()]

    if status and status != "All":
        items = [i for i in items if status.lower() in i["status"].lower()]

    if search:
        s = search.strip().lower()
        items = [
            i for i in items
            if s in i["case_number"].lower()
            or s in i["parties"].lower()
            or s in i["bench"].lower()
            or s in i["advocate_counsel"].lower()
        ]

    return items


@router.post("/causelist/track", response_model=Dict[str, Any])
async def track_matter_in_cause_list(
    payload: CauseListTrackRequest,
    current_user: User = Depends(get_current_user)
):
    """Add a new matter to the live hearing board and tracker."""
    import uuid
    new_item = {
        "id": f"cl-{uuid.uuid4().hex[:8]}",
        "item_number": payload.item_number,
        "case_number": payload.case_number,
        "parties": payload.parties,
        "court_name": payload.court_name,
        "bench": payload.bench,
        "court_room": payload.court_room,
        "stage": payload.stage,
        "list_type": payload.list_type,
        "hearing_date": payload.hearing_date,
        "session": payload.session,
        "advocate_counsel": payload.advocate_counsel,
        "status": "Scheduled",
        "notes": payload.notes or "Added to docket tracking."
    }
    live_cause_list.insert(0, new_item)
    return new_item


@router.put("/causelist/{item_id}/status", response_model=Dict[str, Any])
async def update_cause_list_status(
    item_id: str,
    payload: CauseListStatusUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update live board status (Passed Over, Heard & Reserved, Item in Progress, etc.)."""
    item = next((i for i in live_cause_list if i["id"] == item_id), None)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cause list item '{item_id}' not found."
        )

    item["status"] = payload.status
    if payload.notes:
        item["notes"] = payload.notes
    return item


# ---------------------------------------------------------
# Endpoints: Procedural Litigation Schedule Generator
# ---------------------------------------------------------

@router.post("/cases/generate-schedule")
async def generate_litigation_schedule(
    payload: LitigationScheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Auto-generates procedural litigation milestones (Goals) and
    statutory filing/hearing tasks (Tasks) in the database for a legal matter.
    """
    # 1. Resolve or create Workspace for the matter
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
        res = await db.execute(
            select(Workspace).where(Workspace.owner_id == current_user.id).order_by(Workspace.created_at.desc())
        )
        workspace = res.scalars().first()

    if not workspace:
        workspace = Workspace(
            owner_id=current_user.id,
            name=payload.matter_name or "New Case Matter Enclave",
            description=f"Matter enclave for {payload.client_name}: {payload.matter_name}",
        )
        db.add(workspace)
        await db.commit()
        await db.refresh(workspace)

    # 2. Build procedural stages based on Case Type
    stages: List[Dict[str, Any]] = []

    if payload.case_type == "Commercial Suit":
        stages = [
            {
                "title": f"Stage 1: Plaint Drafting, Verification & Summons ({payload.matter_name})",
                "description": "Filing of Plaint with Statement of Truth, Caveat Search, and Summons Service.",
                "target_date": "2026-12-01",
                "tasks": [
                    "Draft Plaint with Statement of Truth under Order VI Rule 15A CPC",
                    "Conduct Caveat Search in jurisdictional Registry",
                    "Affidavit of Admission & Denial of Documents",
                    "Filing of Summons for Service via Dasti and Speed Post"
                ]
            },
            {
                "title": f"Stage 2: 120-Day Written Statement & Case Management ({payload.matter_name})",
                "description": "Statutory defense tracking under SCG Contracts mandate.",
                "target_date": "2027-01-30",
                "tasks": [
                    "Track 30-day and 120-day outer limitation for Written Statement",
                    "Draft Replication and counter affidavit to interim relief (Order 39)",
                    "Attend Case Management Hearing under Order XV-A CPC",
                    "Framing of Issues with agreed draft issues"
                ]
            },
            {
                "title": f"Stage 3: Evidence by Affidavit & Cross-Examination ({payload.matter_name})",
                "description": "Witness statements and trial court cross-examination.",
                "target_date": "2027-03-31",
                "tasks": [
                    "Draft Evidence Affidavit of PW-1 and tender documentary exhibits",
                    "Prepare Cross-Examination Questionnaire for Defendant's witness",
                    "Tender Section 65B Indian Evidence Act / BSA electronic certificate",
                    "Local Commissioner hearing for recording evidence"
                ]
            },
            {
                "title": f"Stage 4: Final Arguments & Written Submissions ({payload.matter_name})",
                "description": "Oral address and compilation of binding case law precedents.",
                "target_date": "2027-05-15",
                "tasks": [
                    "Prepare Written Synopsis with paragraph citations",
                    "Compile Indexed Precedent Dossier (Supreme Court & High Court)",
                    "Final Oral Hearing address before Commercial Bench",
                    "Obtain certified copy of judgment and decree"
                ]
            }
        ]
    elif payload.case_type == "Arbitration":
        stages = [
            {
                "title": f"Phase 1: Notice of Invocation & Section 11 Petition ({payload.matter_name})",
                "description": "Section 21 invocation notice and tribunal constitution.",
                "target_date": "2026-12-15",
                "tasks": [
                    "Draft Notice Invoking Arbitration under Section 21 of 1996 Act",
                    "File Section 11 Petition for appointment of Arbitrator before High Court",
                    "File Section 9 Petition for urgent interim protective orders",
                    "Verification of Arbitrator disclosure under Fifth and Seventh Schedules"
                ]
            },
            {
                "title": f"Phase 2: Statement of Claim & Pleadings Schedule ({payload.matter_name})",
                "description": "Procedural Order No. 1 compliance and claim submissions.",
                "target_date": "2027-02-28",
                "tasks": [
                    "Draft Statement of Claim with quantum quantification and interest claims",
                    "Respond to Statement of Defense and Counter-Claim",
                    "Filing of joint compilation of documents and admissions"
                ]
            },
            {
                "title": f"Phase 3: Arbitral Award & Section 34 Scrutiny ({payload.matter_name})",
                "description": "Receipt of signed award and limitation monitoring.",
                "target_date": "2027-06-30",
                "tasks": [
                    "Final Arbitral Hearing oral arguments",
                    "Receipt of Signed Arbitral Award under Section 31",
                    "Evaluate grounds for Section 34 Setting Aside (Patent Illegality / Public Policy)",
                    "Track strict 3-month + 30-day limitation for Section 34 challenge"
                ]
            }
        ]
    else:  # Civil Regular Suit / Writ Petition / Criminal Appeal
        stages = [
            {
                "title": f"Procedural Phase 1: Institution & Interim Relief ({payload.matter_name})",
                "description": "Initial filing, registry scrutiny, and preliminary hearing.",
                "target_date": "2026-12-10",
                "tasks": [
                    "Curing Registry defects and objections in filing",
                    "Urgent listing before Vacation / Motion Bench",
                    "Service of dasti copies on Standing Counsel / Opposite Counsel",
                    "Arguing Ad-interim stay / injunction application"
                ]
            },
            {
                "title": f"Procedural Phase 2: Counter-Affidavit & Hearing ({payload.matter_name})",
                "description": "Pleadings completion and final argument preparation.",
                "target_date": "2027-02-20",
                "tasks": [
                    "Review Counter-Affidavit / Status Report filed by Respondent",
                    "Draft Rejoinder Affidavit rebutting new factual averments",
                    "Prepare Case Law Precedent Compendium for Bench",
                    "Final hearing arguments and judgment tracking"
                ]
            }
        ]

    # 3. Create Goals & Tasks in Database
    created_goals_count = 0
    created_tasks_count = 0

    for stage in stages:
        goal = Goal(
            title=f"[{payload.matter_name}] {stage['title']}",
            description=stage['description'],
            user_id=current_user.id,
            progress=0.0,
            status="active"
        )
        db.add(goal)
        await db.flush()
        created_goals_count += 1

        for task_title in stage["tasks"]:
            task = Task(
                title=f"{payload.matter_name}: {task_title}",
                description=f"[{workspace.name} | {goal.title}] Procedural litigation item under {stage['title']}",
                user_id=current_user.id,
                status="todo",
                priority="high" if "Limitation" in task_title or "Urgent" in task_title or "120-Day" in task_title else "medium"
            )
            db.add(task)
            created_tasks_count += 1

    await db.commit()

    return {
        "status": "success",
        "matter_name": payload.matter_name,
        "case_type": payload.case_type,
        "goals_created": created_goals_count,
        "tasks_created": created_tasks_count,
        "message": f"Successfully generated {created_goals_count} procedural phases and {created_tasks_count} filing/hearing tasks for {payload.matter_name}."
    }
