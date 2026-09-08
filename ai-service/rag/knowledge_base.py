"""
Medical knowledge base for Sana AI's vector store.

This is based on the Ghana Standard Treatment Guidelines (STG), 7th
edition (2017, published by the Ghana Health Service and Ministry of
Health for public health use). This project doesn't have a license to
reproduce the STG's full text word for word, so each entry below is an
original, concise summary that reflects the STG's actual recommendations
for Ghana specifically — which drug classes are used first, when to refer
a patient elsewhere, and locally common disease patterns — rather than a
direct copy. It covers a representative set of conditions across every
major area the STG addresses: infectious disease, cardiovascular,
respiratory, digestive/liver, kidney/urinary, endocrine, neurology,
psychiatry, dermatology, ear/nose/throat and eye, musculoskeletal,
obstetrics and gynaecology, paediatrics, emergencies and poisoning, and
nutrition/blood conditions. This is meant to be broad, but it's dozens of
representative conditions, not every single condition in the full document.

Each entry below becomes one document that can be retrieved by the search,
and its `title` is shown as the source next to the AI's answer.
"""

DOCUMENTS: list[dict[str, str]] = [
    {
        "title": "Ghana STG — Pulmonary Tuberculosis",
        "text": (
            "Classic presentation: cough >2-3 weeks (may be productive or with haemoptysis), unintentional weight "
            "loss, night sweats, low-grade fever, and fatigue. Risk factors include HIV co-infection, close contact "
            "with a known case, overcrowding, and malnutrition. Initial workup: sputum smear microscopy or GeneXpert "
            "MTB/RIF where available (x2 samples), chest X-ray for upper-lobe infiltrates or cavitation, and HIV "
            "testing — co-infection is common in Ghana and changes management. Confirmed cases are managed under the "
            "national TB programme's DOTS strategy with the standard regimen (2 months HRZE intensive phase, "
            "4 months HR continuation phase), with treatment supporters/directly observed therapy to support "
            "adherence and contact tracing for household members."
        ),
    },
    {
        "title": "Ghana STG — Malaria",
        "text": (
            "Presents with fever (often cyclical), chills/rigors, headache, myalgia, and fatigue; in Ghana it is a "
            "leading cause of febrile illness and must be excluded early with a confirmatory test before treatment — "
            "presumptive treatment without testing is discouraged. Diagnosis: rapid diagnostic test (RDT) or "
            "microscopy (thick and thin films). Danger signs suggesting severe/complicated malaria — altered "
            "consciousness, repeated vomiting, seizures, jaundice, dark urine, severe anaemia, respiratory distress "
            "— require urgent IV artesunate and admission. Uncomplicated confirmed P. falciparum malaria is "
            "first-line treated with an artemisinin-based combination therapy (ACT), e.g. artesunate-amodiaquine or "
            "artemether-lumefantrine; ACTs are considered safe in the second and third trimester of pregnancy, with "
            "quinine reserved for the first trimester per national guidance."
        ),
    },
    {
        "title": "Ghana STG — Typhoid Fever",
        "text": (
            "Presents with sustained/step-ladder fever, headache, malaise, abdominal pain, and constipation or "
            "diarrhoea; relative bradycardia for the degree of fever and rose spots are classic but often absent. "
            "Complications in untreated or late disease include intestinal perforation and GI bleeding — a rigid, "
            "peritonitic abdomen in a febrile patient warrants urgent surgical review. Diagnosis is supported by "
            "blood culture (most sensitive early in illness); Widal serology has limited specificity in endemic "
            "areas and should be interpreted cautiously alongside the clinical picture. Empiric treatment while "
            "awaiting culture is typically a fluoroquinolone or third-generation cephalosporin, adjusted to local "
            "resistance patterns and culture results once available."
        ),
    },
    {
        "title": "Ghana STG — HIV/AIDS: Initial Assessment and Care Entry",
        "text": (
            "Diagnosis follows the national HIV testing algorithm (serial rapid tests, confirmatory testing per "
            "protocol) with pre- and post-test counselling. On confirmed diagnosis: stage clinically (WHO clinical "
            "staging), check baseline CD4 and viral load where available, screen for TB (a leading cause of death in "
            "untreated HIV in Ghana — always actively screen for cough, fever, weight loss, night sweats), and "
            "screen for other opportunistic infections and pregnancy. Ghana follows a 'test and treat' policy — "
            "antiretroviral therapy (ART) is offered to everyone diagnosed regardless of CD4 count or clinical "
            "stage, typically started promptly after diagnosis and TB screening, with adherence counselling and a "
            "clear follow-up/refill plan given at the same visit."
        ),
    },
    {
        "title": "Ghana STG — Acute Bacterial Meningitis",
        "text": (
            "Presents with fever, severe headache, neck stiffness, photophobia, and altered consciousness; in "
            "infants, signs may be nonspecific (poor feeding, irritability, bulging fontanelle) rather than classic "
            "meningism. This is a medical emergency — do not delay empiric antibiotics awaiting investigations if "
            "meningitis is strongly suspected. Lumbar puncture (if no contraindication such as raised intracranial "
            "pressure signs or focal deficit) confirms diagnosis and guides organism-specific therapy. Empiric "
            "treatment is broad-spectrum IV antibiotics covering the likely bacterial causes for the patient's age "
            "group, started immediately in a facility that can give parenteral therapy, with urgent referral if "
            "the current level of care cannot manage a critically ill patient."
        ),
    },
    {
        "title": "Ghana STG — Measles",
        "text": (
            "Presents with fever, cough, coryza, conjunctivitis, and the characteristic maculopapular rash starting "
            "on the face/hairline and spreading downward, typically 3-5 days after fever onset; Koplik spots may "
            "precede the rash. A notifiable disease in Ghana requiring case reporting to public health authorities. "
            "Complications — pneumonia, otitis media, diarrhoea, and encephalitis — are more common and severe in "
            "malnourished or vitamin-A-deficient children. Management is supportive (fluids, antipyretics, treating "
            "secondary bacterial infections), plus vitamin A supplementation for all children with measles per "
            "national guidance, given its role in reducing complication severity and mortality."
        ),
    },
    {
        "title": "Ghana STG — Hypertension",
        "text": (
            "Diagnosed on repeated elevated readings (systolic >=140 mmHg and/or diastolic >=90 mmHg on at least two "
            "separate occasions) after excluding white-coat effect where possible. Assess for end-organ damage "
            "(fundoscopy, renal function, ECG) and cardiovascular risk factors. In the Ghanaian population, the STG "
            "favours a calcium channel blocker or thiazide-like diuretic as first-line pharmacotherapy — an ACE "
            "inhibitor is NOT first-line in this population due to typically lower renin profiles, though it remains "
            "an option in specific comorbidities (e.g. diabetic nephropathy). Target is generally <140/90 mmHg; "
            "lifestyle modification (salt reduction, weight management, physical activity) is recommended alongside "
            "pharmacotherapy at diagnosis."
        ),
    },
    {
        "title": "Ghana STG — Chest Pain / Ischaemic Heart Disease",
        "text": (
            "Assess chest pain systematically: character, radiation, associated symptoms (dyspnoea, sweating, "
            "nausea), and risk factors (hypertension, diabetes, smoking, family history). Cardiac-sounding pain — "
            "central/crushing, radiating to arm/jaw, with autonomic features — warrants urgent ECG and, where "
            "available, troponin. ST-elevation or a strongly suggestive history in a resource-limited setting "
            "justifies immediate aspirin, oxygen if hypoxic, nitrates if not hypotensive, and urgent referral to a "
            "facility capable of reperfusion therapy — do not delay transfer awaiting confirmatory tests if the "
            "clinical picture is convincing. Always consider and actively exclude other life-threatening causes of "
            "chest pain (pulmonary embolism, aortic dissection, pneumothorax) before settling on a cardiac cause."
        ),
    },
    {
        "title": "Ghana STG — Heart Failure",
        "text": (
            "Presents with dyspnoea (exertional, orthopnoea, paroxysmal nocturnal dyspnoea), fatigue, and fluid "
            "retention (peripheral oedema, raised JVP, basal crackles, hepatomegaly). In Ghana, common underlying "
            "causes include hypertensive heart disease, rheumatic valvular disease, and peripartum cardiomyopathy — "
            "actively consider these when identifying the underlying cause, not just treating symptoms. Acute "
            "decompensation is managed with oxygen, IV diuretics (e.g. furosemide), and treating the precipitant "
            "(arrhythmia, infection, non-adherence, uncontrolled hypertension). Chronic management combines a "
            "diuretic with an ACE inhibitor/ARB and a beta-blocker once stable, with dose titration guided by "
            "clinical response and tolerability."
        ),
    },
    {
        "title": "Ghana STG — Community-Acquired Pneumonia",
        "text": (
            "Presents with fever, productive cough, pleuritic chest pain, dyspnoea, and focal chest signs (crackles, "
            "bronchial breathing, dullness to percussion). Assess severity to guide admission decisions (e.g. "
            "CURB-65: Confusion, Urea, Respiratory rate >=30, Blood pressure low, Age >=65 — higher scores favour "
            "admission). Chest X-ray supports diagnosis and can reveal complications (effusion, cavitation, or "
            "findings suggesting TB in a subacute presentation — always keep TB in the differential in Ghana). "
            "Empiric antibiotic choice depends on severity and local resistance patterns — commonly a beta-lactam "
            "(e.g. amoxicillin) with or without a macrolide for outpatient management, broader IV coverage for "
            "inpatient/severe disease."
        ),
    },
    {
        "title": "Ghana STG — Acute Asthma Exacerbation",
        "text": (
            "Presents with wheeze, chest tightness, dyspnoea, and cough, often triggered by infection, allergen "
            "exposure, or poor medication adherence. Assess severity using ability to speak in full sentences, "
            "respiratory rate, accessory muscle use, oxygen saturation, and peak flow where available — a silent "
            "chest or exhaustion signals life-threatening asthma requiring immediate escalation. Initial management: "
            "repeated/nebulised short-acting beta-agonist (salbutamol), systemic corticosteroids, and supplemental "
            "oxygen to target saturation; escalate to senior review and consider referral for severe or "
            "life-threatening features that don't respond promptly to initial treatment. Reinforce inhaler technique "
            "and a maintenance plan before discharge to reduce recurrence."
        ),
    },
    {
        "title": "Ghana STG — Common Cold / Acute Upper Respiratory Tract Infection",
        "text": (
            "Presents with nasal congestion/discharge, sore throat, mild cough, and low-grade or no fever; usually "
            "viral and self-limiting over 7-10 days. Management is supportive — fluids, rest, paracetamol for "
            "discomfort/fever; antibiotics are not indicated for an uncomplicated viral URTI and their overuse "
            "contributes to resistance. Red flags that should prompt reassessment for a different or more serious "
            "diagnosis include high/persistent fever beyond a few days, difficulty breathing, drooling/inability to "
            "swallow (possible epiglottitis), or symptoms localising strongly to one ear/sinus with worsening pain "
            "(possible bacterial otitis media or sinusitis warranting targeted treatment)."
        ),
    },
    {
        "title": "Ghana STG — Acute Gastroenteritis",
        "text": (
            "Presents with diarrhoea (with or without vomiting), abdominal cramping, and variable fever; the "
            "primary early concern is assessing and correcting dehydration, which can progress quickly in young "
            "children and the elderly. Look for signs of moderate-severe dehydration: sunken eyes, reduced skin "
            "turgor, tachycardia, reduced urine output, lethargy. Most cases are viral/self-limiting and managed "
            "with oral rehydration solution (ORS) plus zinc supplementation in children per national guidance; "
            "bloody diarrhoea, high fever, or signs of severe dehydration warrant stool studies and consideration "
            "of antimicrobial therapy or IV rehydration/admission."
        ),
    },
    {
        "title": "Ghana STG — Peptic Ulcer Disease",
        "text": (
            "Presents with epigastric pain — classically relieved by food in duodenal ulcers, worsened by food in "
            "gastric ulcers — plus bloating, early satiety, or nausea; alarm features (GI bleeding, unintentional "
            "weight loss, dysphagia, persistent vomiting, age over 45-55 with new symptoms) warrant endoscopic "
            "referral rather than empiric treatment alone. H. pylori testing (where available) should guide "
            "management, since eradication therapy (a proton-pump inhibitor plus two antibiotics per local "
            "protocol) reduces recurrence versus acid suppression alone. NSAID use is a major contributing cause — "
            "review and stop if possible. Upper GI bleeding (haematemesis, melaena) is a medical emergency requiring "
            "resuscitation and urgent referral."
        ),
    },
    {
        "title": "Ghana STG — Viral Hepatitis",
        "text": (
            "Presents with fatigue, anorexia, nausea, right-upper-quadrant discomfort, dark urine, and jaundice; "
            "hepatitis B and C are of particular concern in Ghana given endemic prevalence and their chronic "
            "carriage/progression to cirrhosis and hepatocellular carcinoma. Acute viral hepatitis is largely "
            "managed supportively (rest, hydration, avoiding hepatotoxic drugs including unnecessary paracetamol "
            "doses); a very high or worsening prothrombin time/INR, encephalopathy, or persistent vomiting signals "
            "possible acute liver failure requiring urgent referral. All pregnant women should be screened for "
            "hepatitis B, and hepatitis B birth-dose vaccination given to newborns of positive mothers to interrupt "
            "vertical transmission."
        ),
    },
    {
        "title": "Ghana STG — Urinary Tract Infection",
        "text": (
            "Lower UTI (cystitis) presents with dysuria, urinary frequency and urgency, and suprapubic discomfort, "
            "usually without fever. Upper UTI (pyelonephritis) adds fever, rigors, and flank pain/costovertebral "
            "angle tenderness, and represents a more serious infection requiring closer monitoring. Urinalysis "
            "(leukocyte esterase, nitrites) supports diagnosis; urine culture confirms the organism and guides "
            "therapy, especially in recurrent, complicated, or pregnancy-associated cases (asymptomatic "
            "bacteriuria in pregnancy should still be treated, given the risk of progression to pyelonephritis and "
            "preterm labour). Uncomplicated cystitis is typically treated with a short course of an appropriate "
            "oral antibiotic per local resistance patterns; pyelonephritis often warrants a longer course, closer "
            "follow-up, and admission if systemically unwell."
        ),
    },
    {
        "title": "Ghana STG — Sexually Transmitted Infections: Syndromic Approach",
        "text": (
            "Ghana's STG follows syndromic management for STIs where laboratory confirmation isn't immediately "
            "available — treating based on the presenting symptom cluster rather than waiting for a specific "
            "pathogen result, since delayed treatment risks onward transmission and complications. Urethral/vaginal "
            "discharge syndrome, genital ulcer syndrome, and lower abdominal pain (suggesting pelvic inflammatory "
            "disease) each have a defined first-line antibiotic combination covering the most likely pathogens "
            "(e.g. gonorrhoea and chlamydia together for discharge syndromes). Always offer HIV testing and partner "
            "notification/treatment alongside index-case treatment — treating one partner without the other leads "
            "to reinfection."
        ),
    },
    {
        "title": "Ghana STG — Pelvic Inflammatory Disease",
        "text": (
            "Presents with lower abdominal/pelvic pain, abnormal vaginal discharge, and cervical motion/adnexal "
            "tenderness on examination, sometimes with fever; presentation can be subtle, so maintain a low "
            "threshold in a sexually active woman with pelvic pain. Usually ascending infection from an STI "
            "(gonorrhoea/chlamydia most common), though can be polymicrobial. Untreated or delayed treatment risks "
            "tubal damage, ectopic pregnancy, and infertility, so empiric broad-spectrum antibiotic treatment "
            "covering gonorrhoea, chlamydia, and anaerobes is started promptly per the syndromic STI approach once "
            "diagnosed clinically, without waiting for swab results. Treat sexual partner(s) too, and admit if "
            "pregnant, systemically unwell, unable to tolerate oral therapy, or a tubo-ovarian abscess is suspected."
        ),
    },
    {
        "title": "Ghana STG — Type 2 Diabetes Mellitus",
        "text": (
            "Diagnostic criteria include fasting plasma glucose >=126 mg/dL (7.0 mmol/L), random plasma glucose "
            ">=200 mg/dL (11.1 mmol/L) with classic symptoms (polyuria, polydipsia, weight loss), or HbA1c >=6.5%, "
            "confirmed on a repeat test unless unequivocal hyperglycaemia is present. Initial management combines "
            "lifestyle modification (diet, physical activity, weight loss where relevant) with metformin as "
            "first-line pharmacotherapy in most patients, titrated as tolerated and renal function permitting. "
            "Screen at diagnosis and periodically thereafter for complications: retinopathy (fundoscopy), "
            "nephropathy (urine albumin, renal function), and neuropathy (foot exam) — foot care education is "
            "particularly important given the burden of diabetic foot disease seen in Ghanaian practice."
        ),
    },
    {
        "title": "Ghana STG — Diabetic Ketoacidosis",
        "text": (
            "Presents with polyuria, polydipsia, vomiting, abdominal pain, Kussmaul breathing, and a fruity "
            "(acetone) breath odour, progressing to altered consciousness if untreated; can be the first "
            "presentation of previously undiagnosed diabetes or precipitated by infection, non-adherence, or acute "
            "illness in a known diabetic. Confirmed by hyperglycaemia, ketonaemia/ketonuria, and metabolic acidosis. "
            "This is a medical emergency: immediate IV fluid resuscitation, IV insulin infusion, and potassium "
            "replacement (monitored closely, since insulin drives potassium intracellularly and can precipitate "
            "dangerous hypokalaemia), with urgent referral to a facility able to provide continuous monitoring — "
            "do not attempt to manage DKA with subcutaneous insulin alone."
        ),
    },
    {
        "title": "Ghana STG — Acute Stroke",
        "text": (
            "Presents with sudden-onset focal neurological deficit — facial droop, arm/leg weakness, slurred "
            "speech, visual disturbance — assessed quickly using a tool like FAST (Face, Arms, Speech, Time). Time "
            "of onset (or last known well) is critical information to establish immediately, since it determines "
            "eligibility for time-sensitive interventions at a referral centre. Distinguishing ischaemic from "
            "haemorrhagic stroke clinically is unreliable — urgent imaging (CT) is needed wherever accessible before "
            "any decision on antiplatelet/anticoagulant therapy. Initial care at any level: protect the airway, "
            "check glucose (hypoglycaemia can mimic stroke), avoid aggressively lowering blood pressure acutely "
            "unless very high, and arrange urgent referral to a stroke-capable facility."
        ),
    },
    {
        "title": "Ghana STG — Epilepsy and Seizure Management",
        "text": (
            "A single seizure needs assessment for provoking causes (fever, hypoglycaemia, infection, metabolic "
            "derangement, alcohol withdrawal) before a diagnosis of epilepsy is made; epilepsy is a clinical "
            "diagnosis of recurrent, unprovoked seizures. Acute management of an active convulsive seizure: protect "
            "from injury, do not restrain forcefully or put anything in the mouth, position to protect the airway, "
            "and give a benzodiazepine (e.g. diazepam) if the seizure persists beyond a few minutes — a seizure "
            "lasting longer than 5 minutes or recurring without full recovery between episodes is status "
            "epilepticus, a medical emergency requiring urgent escalation. Long-term management uses an appropriate "
            "first-line anticonvulsant, with attention to adherence and, in women of childbearing age, teratogenicity "
            "counselling."
        ),
    },
    {
        "title": "Ghana STG — Depression",
        "text": (
            "Presents with persistent low mood, anhedonia, sleep and appetite disturbance, fatigue, poor "
            "concentration, and feelings of worthlessness or guilt lasting most of the day for at least two weeks; "
            "screen for suicidal ideation directly and specifically in every assessment — asking about it does not "
            "increase risk and is essential for safety planning. Mild cases may respond to psychosocial support and "
            "problem-solving counselling alone; moderate-severe cases benefit from a combination of psychotherapy "
            "where available and pharmacotherapy (an SSRI is typically first-line, given its more tolerable side-"
            "effect profile). Active suicidal intent, a plan, or psychotic features warrant urgent referral for "
            "specialist mental health assessment rather than management at the primary level alone."
        ),
    },
    {
        "title": "Ghana STG — Acute Psychosis",
        "text": (
            "Presents with hallucinations, delusions, disorganised thinking or behaviour, and impaired insight; "
            "first assess for and exclude an organic/medical cause (fever, substance intoxication or withdrawal, "
            "metabolic derangement, head injury) before assuming a primary psychiatric disorder, especially in a "
            "first presentation. Acute agitation is managed with a calm environment, verbal de-escalation first, and "
            "an antipsychotic (e.g. haloperidol, with caution regarding extrapyramidal side effects) if the patient "
            "poses a danger to themselves or others. Referral to a mental health facility or specialist is "
            "appropriate for ongoing management, diagnosis clarification, and family psychoeducation, since a first "
            "psychotic episode requires specialist follow-up beyond acute stabilisation."
        ),
    },
    {
        "title": "Ghana STG — Cellulitis",
        "text": (
            "Presents with a spreading area of erythema, warmth, swelling, and tenderness, usually on a limb, "
            "sometimes with fever and lymphangitic streaking; marking the border of erythema at initial assessment "
            "helps track response (or spread) over the following day. Common entry points include minor trauma, "
            "insect bites, fungal skin breaks (e.g. interdigital tinea), or an underlying ulcer. First-line "
            "treatment is an antibiotic active against streptococci and staphylococci (e.g. flucloxacillin or "
            "amoxicillin-clavulanate depending on local protocol), with elevation of the affected limb. Rapidly "
            "spreading erythema, severe pain out of proportion to exam findings, skin necrosis, or systemic sepsis "
            "signs should raise concern for necrotising fasciitis — a surgical emergency requiring urgent referral."
        ),
    },
    {
        "title": "Ghana STG — Scabies",
        "text": (
            "Presents with intense itching (typically worse at night) and a papular/burrow rash in classic "
            "distribution — finger webs, wrists, axillae, waistline, and genitals in adults; in infants, the face, "
            "scalp, palms, and soles can also be affected. Highly contagious via close skin contact, so household "
            "and close-contact members should be treated simultaneously even if asymptomatic, to prevent "
            "reinfestation. First-line treatment is topical permethrin cream applied to the whole body and washed "
            "off after the recommended duration, repeated after one to two weeks; oral ivermectin is an alternative "
            "in extensive or crusted scabies. Secondary bacterial infection from scratching (impetiginisation) "
            "should be assessed for and treated if present."
        ),
    },
    {
        "title": "Ghana STG — Acute Otitis Media",
        "text": (
            "Presents with ear pain, fever, and irritability in a young child, often following or alongside a viral "
            "URTI; otoscopy shows a bulging, erythematous, or perforated tympanic membrane with loss of the normal "
            "light reflex. Many cases in older children/adults are viral and self-limiting, managed with analgesia "
            "(paracetamol) alone with review if not improving; bacterial cases, especially in young children or "
            "with high fever/systemic illness, are treated with amoxicillin as first-line. A perforated tympanic "
            "membrane with discharge usually still resolves with the same antibiotic approach; recurrent or "
            "persistent cases beyond several weeks warrant ENT referral to assess for chronic otitis media or "
            "effusion affecting hearing."
        ),
    },
    {
        "title": "Ghana STG — Red Eye",
        "text": (
            "A red eye has a broad differential — conjunctivitis (bacterial, viral, or allergic), corneal abrasion "
            "or foreign body, keratitis, and acute angle-closure glaucoma or anterior uveitis at the more serious "
            "end. Distinguishing features matter: significant pain, photophobia, reduced visual acuity, or a fixed/"
            "irregular pupil point away from simple conjunctivitis toward a sight-threatening cause requiring urgent "
            "ophthalmology referral. Simple bacterial conjunctivitis (purulent discharge, minimal pain, normal "
            "vision) is treated with a topical antibiotic (e.g. chloramphenicol eye drops); viral and allergic "
            "conjunctivitis are managed supportively. Any history of chemical splash to the eye requires immediate, "
            "copious irrigation before anything else, including before formal assessment."
        ),
    },
    {
        "title": "Ghana STG — Acute Low Back Pain",
        "text": (
            "Most acute low back pain is mechanical/non-specific and improves within weeks with staying active, "
            "simple analgesia, and reassurance — prolonged bed rest is not recommended and can worsen outcomes. "
            "Screen for 'red flag' features at every assessment: saddle anaesthesia, new bladder/bowel dysfunction, "
            "bilateral leg weakness (possible cauda equina syndrome — a surgical emergency), unexplained weight "
            "loss, history of cancer, fever, IV drug use, or significant trauma, any of which warrant urgent further "
            "investigation rather than routine management. Radicular pain (shooting down the leg past the knee "
            "with dermatomal distribution) suggests nerve root involvement and may need imaging if it fails to "
            "improve with conservative management."
        ),
    },
    {
        "title": "Ghana STG — Antenatal Care",
        "text": (
            "Ghana's focused antenatal care schedule aims for at least eight contacts across pregnancy, front-loaded "
            "with more visits earlier, to catch complications early and deliver key interventions: iron/folic acid "
            "supplementation, intermittent preventive treatment of malaria in pregnancy (IPTp) with sulfadoxine-"
            "pyrimethamine from the second trimester, tetanus toxoid vaccination, HIV and syphilis screening, and "
            "insecticide-treated net provision. Blood pressure and urine protein should be checked at every visit to "
            "screen for pre-eclampsia; symphysis-fundal height and fetal heart assessment track growth. Any bleeding, "
            "severe headache, visual disturbance, reduced fetal movement, or reduced urine output at any point in "
            "pregnancy warrants prompt facility assessment rather than waiting for the next scheduled visit."
        ),
    },
    {
        "title": "Ghana STG — Pre-eclampsia",
        "text": (
            "Defined as new-onset hypertension (>=140/90 mmHg) after 20 weeks' gestation plus proteinuria or other "
            "evidence of end-organ involvement (renal, liver, neurological, or haematological); severe features — "
            "BP >=160/110, severe headache, visual disturbance, epigastric/right-upper-quadrant pain, or clonus — "
            "signal a much higher risk of progression to eclampsia (seizures) and warrant urgent admission. "
            "Magnesium sulfate is given for seizure prophylaxis in severe pre-eclampsia/eclampsia per protocol, "
            "along with antihypertensives to control severe blood pressure, and the definitive treatment is delivery "
            "once the mother is stabilised and gestational age/fetal status is weighed. Any pregnant woman with a new "
            "severe headache or visual symptoms should have blood pressure and urine protein checked immediately."
        ),
    },
    {
        "title": "Ghana STG — Postpartum Haemorrhage",
        "text": (
            "Defined as blood loss >=500 mL after vaginal delivery (or >=1000 mL after caesarean); a leading cause "
            "of maternal mortality in Ghana, so active management of the third stage of labour (uterotonic given "
            "with/immediately after delivery of the baby, controlled cord traction, uterine massage) is standard "
            "practice to reduce risk. Assess using the '4 Ts' framework — Tone (uterine atony, the most common "
            "cause), Tissue (retained placenta/products), Trauma (genital tract lacerations), Thrombin (coagulation "
            "disorder) — to guide targeted management. Immediate steps: call for help, IV access with fluid "
            "resuscitation, uterine massage, additional uterotonics, and identifying/addressing the specific cause, "
            "with urgent referral if bleeding is not controlled at the current level of care."
        ),
    },
    {
        "title": "Ghana STG — Severe Acute Malnutrition",
        "text": (
            "Identified in children by weight-for-height/length below -3 z-scores, mid-upper arm circumference "
            "(MUAC) <11.5 cm, or bilateral pitting oedema (kwashiorkor); any of these alone is sufficient for "
            "diagnosis. Children with complications (poor appetite, oedema plus another danger sign, or a medical "
            "complication like infection) require inpatient stabilisation following the WHO/Ghana protocol — "
            "cautious rehydration (severely malnourished children tolerate standard rehydration poorly), treating "
            "hypoglycaemia and hypothermia proactively, and starting therapeutic feeds only after initial "
            "stabilisation, with antibiotics given routinely since infection is often present without obvious signs. "
            "Uncomplicated cases with appetite intact can be managed in the community with ready-to-use therapeutic "
            "food (RUTF) and close follow-up."
        ),
    },
    {
        "title": "Ghana STG — Neonatal Sepsis",
        "text": (
            "Presents with nonspecific signs in a newborn — poor feeding, lethargy, temperature instability (fever "
            "or hypothermia), respiratory distress, irritability, or a bulging fontanelle — which makes a high index "
            "of suspicion essential, since neonates can deteriorate rapidly without classic localising signs. Risk "
            "factors include maternal fever in labour, prolonged rupture of membranes, prematurity, and low birth "
            "weight. Any suspected case warrants prompt empiric broad-spectrum IV antibiotics after basic "
            "investigations (and blood culture where available) without waiting for results, given how quickly "
            "neonatal sepsis can progress to death. Supportive care — maintaining temperature, glucose, and "
            "hydration — is given alongside antibiotics, with urgent referral to a facility capable of neonatal "
            "intensive care if the baby is critically unwell."
        ),
    },
    {
        "title": "Ghana STG — Fever in a Child Under 5",
        "text": (
            "Ghana's Integrated Management of Childhood Illness (IMCI) approach requires assessing every febrile "
            "child under 5 for general danger signs first (unable to drink/breastfeed, vomiting everything, "
            "convulsions, lethargic/unconscious) — any present means urgent referral regardless of the specific "
            "fever cause. Malaria must be excluded with a test (RDT or microscopy) in every febrile child in an "
            "endemic area before treatment, not presumed. Also assess for other common causes by system — ear pain "
            "(otitis media), fast breathing/chest indrawing (pneumonia), neck stiffness (meningitis), and measles "
            "rash — since fever in this age group is a nonspecific presenting sign for many distinct, differently-"
            "managed illnesses, and a structured system-by-system check avoids missing a serious cause."
        ),
    },
    {
        "title": "Ghana STG — Anaphylaxis",
        "text": (
            "A rapidly progressing, life-threatening allergic reaction — look for the combination of sudden onset, "
            "skin/mucosal signs (urticaria, angioedema, flushing) plus airway compromise (stridor, swelling), "
            "breathing difficulty (wheeze, hypoxia), or circulatory compromise (hypotension, collapse), though skin "
            "signs can occasionally be absent. Common triggers include drugs (especially antibiotics), insect "
            "stings, and food. Treatment is immediate intramuscular adrenaline (epinephrine) into the anterolateral "
            "thigh — this is the first-line, life-saving step and should not be delayed for IV access or other "
            "treatments; repeat every 5-15 minutes if no improvement. Supportive measures follow: high-flow oxygen, "
            "IV fluids for hypotension, and removing/stopping the trigger, with observation for a biphasic reaction "
            "even after apparent resolution."
        ),
    },
    {
        "title": "Ghana STG — Snake Bite",
        "text": (
            "Assess for local signs (pain, swelling, bruising, blistering, tissue necrosis) and systemic "
            "envenomation signs (bleeding from gums/venepuncture sites, ptosis and other neurotoxic signs, shock), "
            "since not every bite — even from a venomous species — results in significant envenomation. Do not use "
            "tourniquets, incision, or suction, which cause harm without proven benefit; instead immobilise the "
            "affected limb in a position of function and keep the patient calm and still to slow venom spread while "
            "arranging urgent transfer. The 20-minute whole blood clotting test is a simple bedside tool to detect "
            "coagulopathy from haemotoxic envenomation where lab testing isn't available. Antivenom, when indicated "
            "by signs of systemic envenomation, should be given at a facility equipped to manage anaphylactic "
            "reactions to it."
        ),
    },
    {
        "title": "Ghana STG — Acute Poisoning",
        "text": (
            "Initial management follows ABCDE regardless of the specific poison — securing the airway, breathing, "
            "and circulation takes priority over identifying the exact agent. Gather history on what, how much, and "
            "when the substance was taken, and look for toxidrome clues (pupil size, sweating, bowel sounds, heart "
            "rate) that can narrow the likely agent even without a clear history. Activated charcoal may reduce "
            "absorption if given within an hour of ingestion of an appropriate substance and the airway is protected "
            "— it is not universally indicated and is contraindicated for corrosives, hydrocarbons, and in a patient "
            "with reduced consciousness and an unprotected airway. Specific antidotes exist for certain poisonings "
            "(e.g. organophosphates, paracetamol) — identify early where possible, and refer urgently to a facility "
            "able to provide supportive/antidotal care."
        ),
    },
    {
        "title": "Ghana STG — Burns",
        "text": (
            "First aid: stop the burning process, cool the burn with clean running water for 20 minutes (not ice, "
            "which can worsen tissue damage), remove constricting clothing/jewellery before swelling develops, and "
            "cover with a clean, non-adherent dressing. Estimate burn size using the rule of nines (or the patient's "
            "palm as roughly 1% body surface area for smaller/irregular burns) and depth (superficial, partial, or "
            "full thickness) to guide management and referral decisions. Significant burns (large total body surface "
            "area, full-thickness, involving face/hands/genitals/airway, or in a child or elderly patient) need IV "
            "fluid resuscitation per a standard formula and urgent referral to a burns-capable facility; suspected "
            "airway burn (facial burns, singed nasal hair, hoarse voice) requires early, proactive airway management "
            "before swelling obstructs it."
        ),
    },
    {
        "title": "Ghana STG — Iron-Deficiency Anaemia",
        "text": (
            "Presents with fatigue, pallor, dyspnoea on exertion, and sometimes pica or koilonychia in longstanding "
            "cases; symptoms correlate with the degree and rate of onset of anaemia. Full blood count typically "
            "shows a microcytic, hypochromic picture; ferritin (interpreted cautiously as an acute-phase reactant), "
            "iron studies, and reticulocyte count help confirm iron deficiency versus other causes of microcytic "
            "anaemia (including thalassaemia trait, common in West Africa — worth considering if iron studies are "
            "normal). In adults, iron deficiency should prompt evaluation for an underlying source of blood loss "
            "(e.g. GI, menstrual) rather than treating with supplementation alone. Oral iron replacement is "
            "first-line where tolerated; investigate and treat the underlying cause."
        ),
    },
    {
        "title": "Ghana STG — Sickle Cell Disease: Acute Painful Crisis",
        "text": (
            "Sickle cell disease has a significant burden in Ghana, and an acute vaso-occlusive (painful) crisis is "
            "its most common presentation — sudden severe pain, often in the back, limbs, chest, or abdomen, "
            "sometimes precipitated by dehydration, infection, cold exposure, or hypoxia, though often with no "
            "identifiable trigger. Management prioritises early, adequate analgesia (patients are frequently "
            "under-treated for pain due to stigma — treat the reported pain severity), generous oral or IV "
            "hydration, and treating any precipitating infection. Chest pain with hypoxia or new infiltrate raises "
            "concern for acute chest syndrome — a life-threatening complication requiring urgent escalation, oxygen, "
            "and often transfusion. Known sickle cell patients should be on prophylactic folic acid and, in "
            "childhood, penicillin prophylaxis and pneumococcal vaccination given their functional asplenia risk."
        ),
    },
    {
        "title": "Ghana STG — Vitamin A Deficiency",
        "text": (
            "A public health concern in parts of Ghana, presenting with night blindness (earliest symptom), "
            "conjunctival/corneal dryness (xerophthalmia), Bitot's spots, and in severe, prolonged deficiency, "
            "corneal ulceration and irreversible blindness (keratomalacia) — a preventable emergency once corneal "
            "involvement appears. Children with measles, severe acute malnutrition, or persistent diarrhoea are at "
            "particularly high risk and should routinely receive vitamin A supplementation as part of their "
            "management per national protocol, alongside the broader national vitamin A supplementation programme "
            "for children under 5. Any eye finding suggesting xerophthalmia in a child warrants immediate "
            "high-dose vitamin A and urgent ophthalmology assessment if corneal involvement is present, given how "
            "quickly it can progress to permanent damage."
        ),
    },
]
