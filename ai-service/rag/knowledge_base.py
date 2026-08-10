"""
Starter medical knowledge base for MediAssist AI's vector store.

IMPORTANT — placeholder content, not a real clinical corpus: the blueprint
calls for the vector DB to be pre-populated with licensed/openly-available
sources (Harrison's, Oxford Handbook, WHO guidelines, Ghana Standard
Treatment Guidelines, drug references). This project has no license to
redistribute those copyrighted textbooks, so the entries below are original,
concise clinical reference notes written from general medical knowledge —
enough to make the RAG pipeline actually retrieve and reason over real
content for development and demo purposes. Before the final submission,
replace/extend this with properly licensed or openly-available source
material (e.g. the actual Ghana Standard Treatment Guidelines, which are
published for public health use) and re-run the seeding step.

Each entry becomes one retrievable document, tagged with a `title` used as
the "source" shown to the doctor alongside the AI's answer.
"""

DOCUMENTS: list[dict[str, str]] = [
    {
        "title": "Pulmonary Tuberculosis — Presentation & Approach",
        "text": (
            "Classic presentation: cough >2-3 weeks (may be productive or with "
            "haemoptysis), unintentional weight loss, night sweats, low-grade "
            "fever, and fatigue. Risk factors include HIV co-infection, close "
            "contact with a known TB case, overcrowded living conditions, and "
            "malnutrition. Initial workup: sputum smear microscopy (or "
            "GeneXpert MTB/RIF where available) x2-3 samples, chest X-ray "
            "looking for upper-lobe infiltrates or cavitation, and HIV testing "
            "(TB/HIV co-infection is common and changes management). Empiric "
            "antibiotics for a presumed bacterial pneumonia that fail to "
            "resolve symptoms after 1-2 weeks should raise suspicion for TB. "
            "Confirmed cases are managed with the standard 6-month "
            "multi-drug regimen (2 months HRZE intensive phase, 4 months HR "
            "continuation phase) per national TB programme guidelines, with "
            "directly observed therapy where feasible."
        ),
    },
    {
        "title": "Malaria — Presentation & Approach",
        "text": (
            "Presents with fever (often cyclical), chills/rigors, headache, "
            "myalgia, and fatigue; in endemic areas (including Ghana) it is a "
            "leading cause of febrile illness and must be excluded early. "
            "Danger signs suggesting severe/complicated malaria include "
            "altered consciousness, repeated vomiting, seizures, jaundice, "
            "dark urine, severe anaemia, and respiratory distress — these "
            "require urgent parenteral treatment and referral. Diagnosis: "
            "rapid diagnostic test (RDT) or microscopy (thick and thin blood "
            "films) to confirm parasitaemia and identify species. "
            "Uncomplicated P. falciparum malaria is first-line treated with "
            "an artemisinin-based combination therapy (ACT) per national "
            "malaria treatment guidelines; severe malaria requires IV "
            "artesunate and inpatient management."
        ),
    },
    {
        "title": "Typhoid Fever — Presentation & Approach",
        "text": (
            "Presents with sustained/step-ladder fever, headache, malaise, "
            "abdominal pain, and constipation or diarrhoea; relative "
            "bradycardia for the degree of fever and rose spots (faint truncal "
            "rash) are classic but often absent. Complications in untreated or "
            "late disease include intestinal perforation and GI bleeding. "
            "Diagnosis is supported by blood culture (most sensitive early in "
            "illness) or Widal serology (limited specificity, interpret with "
            "caution in endemic areas). Empiric treatment while awaiting "
            "culture is typically a fluoroquinolone or third-generation "
            "cephalosporin depending on local resistance patterns; always "
            "correlate with local antimicrobial resistance data."
        ),
    },
    {
        "title": "Hypertension — Diagnosis & Initial Management",
        "text": (
            "Diagnosed on repeated elevated readings (commonly systolic "
            ">=140 mmHg and/or diastolic >=90 mmHg on at least two separate "
            "occasions, not a single reading) after excluding white-coat "
            "effect where possible. Assess for end-organ damage (fundoscopy, "
            "renal function, ECG/LVH) and cardiovascular risk factors "
            "(diabetes, smoking, dyslipidaemia, family history). First-line "
            "pharmacologic options commonly include a thiazide-like diuretic, "
            "calcium channel blocker, or ACE inhibitor/ARB, chosen based on "
            "comorbidities, age, and local availability; lifestyle "
            "modification (salt reduction, weight management, physical "
            "activity) is recommended alongside pharmacotherapy at diagnosis."
        ),
    },
    {
        "title": "Type 2 Diabetes Mellitus — Diagnosis & Initial Management",
        "text": (
            "Diagnostic criteria include fasting plasma glucose >=126 mg/dL "
            "(7.0 mmol/L), random plasma glucose >=200 mg/dL (11.1 mmol/L) "
            "with classic symptoms (polyuria, polydipsia, weight loss), or "
            "HbA1c >=6.5%, confirmed on a repeat test unless unequivocal "
            "hyperglycaemia is present. Initial management combines lifestyle "
            "modification (diet, physical activity, weight loss where "
            "relevant) with metformin as first-line pharmacotherapy in most "
            "patients, titrated as tolerated. Screen at diagnosis and "
            "periodically thereafter for complications: retinopathy "
            "(fundoscopy), nephropathy (urine albumin, renal function), and "
            "neuropathy (foot exam)."
        ),
    },
    {
        "title": "Community-Acquired Pneumonia — Presentation & Approach",
        "text": (
            "Presents with fever, productive cough, pleuritic chest pain, "
            "dyspnoea, and focal chest signs (crackles, bronchial breathing, "
            "dullness to percussion) on examination. Assess severity to guide "
            "admission decisions (e.g. CURB-65: Confusion, Urea, Respiratory "
            "rate >=30, Blood pressure low, Age >=65 — higher scores favour "
            "admission). Chest X-ray supports diagnosis and can reveal "
            "complications (effusion, cavitation). Empiric antibiotic choice "
            "depends on severity and local resistance patterns — commonly a "
            "beta-lactam with or without a macrolide for outpatient "
            "management, broader coverage for inpatient/severe disease."
        ),
    },
    {
        "title": "Urinary Tract Infection — Presentation & Approach",
        "text": (
            "Lower UTI (cystitis) presents with dysuria, urinary frequency and "
            "urgency, and suprapubic discomfort, usually without fever. "
            "Upper UTI (pyelonephritis) adds fever, rigors, and flank pain/"
            "costovertebral angle tenderness, and represents a more serious "
            "infection requiring closer monitoring. Urinalysis (leukocyte "
            "esterase, nitrites) supports diagnosis; urine culture confirms "
            "the organism and guides therapy, especially in recurrent or "
            "complicated cases. Uncomplicated cystitis is typically treated "
            "with a short course of an appropriate oral antibiotic per local "
            "resistance patterns; pyelonephritis often warrants a longer "
            "course and closer follow-up, with admission considered if "
            "systemically unwell or unable to tolerate oral therapy."
        ),
    },
    {
        "title": "Acute Gastroenteritis — Presentation & Approach",
        "text": (
            "Presents with diarrhoea (with or without vomiting), abdominal "
            "cramping, and variable fever; the primary early concern is "
            "assessing and correcting dehydration, which can progress quickly "
            "in young children and the elderly. Look for signs of moderate-"
            "severe dehydration: sunken eyes, reduced skin turgor, "
            "tachycardia, reduced urine output, lethargy. Most cases are "
            "viral and self-limiting, managed with oral rehydration therapy; "
            "bloody diarrhoea, high fever, or signs of severe dehydration "
            "warrant further evaluation (stool studies) and consideration of "
            "antimicrobial therapy or IV rehydration/admission."
        ),
    },
    {
        "title": "Acute Asthma Exacerbation — Assessment & Approach",
        "text": (
            "Presents with wheeze, chest tightness, dyspnoea, and cough, "
            "often triggered by infection, allergen exposure, or poor "
            "medication adherence. Assess severity using ability to speak in "
            "full sentences, respiratory rate, accessory muscle use, oxygen "
            "saturation, and peak flow where available — a silent chest or "
            "exhaustion signals life-threatening asthma requiring immediate "
            "escalation. Initial management: repeated/nebulised short-acting "
            "beta-agonist, systemic corticosteroids, and supplemental oxygen "
            "to target saturation; escalate to senior review and consider ICU "
            "involvement for severe or life-threatening features that don't "
            "respond promptly to initial treatment."
        ),
    },
    {
        "title": "Iron-Deficiency Anaemia — Presentation & Approach",
        "text": (
            "Presents with fatigue, pallor, dyspnoea on exertion, and "
            "sometimes pica or koilonychia in longstanding cases; symptoms "
            "correlate with the degree and rate of onset of anaemia. Full "
            "blood count typically shows a microcytic, hypochromic picture; "
            "ferritin (interpreted cautiously as an acute-phase reactant), "
            "iron studies, and reticulocyte count help confirm iron "
            "deficiency versus other causes of microcytic anaemia. In adults, "
            "iron deficiency should prompt evaluation for an underlying "
            "source of blood loss (e.g. GI, menstrual) rather than treating "
            "with iron supplementation alone. Oral iron replacement is "
            "first-line where tolerated; investigate and treat the underlying cause."
        ),
    },
]
