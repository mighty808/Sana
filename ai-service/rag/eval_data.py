"""
The labelled query set used to measure retrieval quality.

This is the ground truth behind tests/test_retrieval.py's numbers. Each entry
pairs a question a real user might ask with the knowledge-base entries that
*should* come back for it. Titles are used as the label rather than an index,
because a title is stable across reordering the knowledge base and is the same
string shown to the user as the source.

Three kinds of query, deliberately:

  IN_KB          — squarely covered by the knowledge base. The named entry
                   should be retrieved, and the top passage should clear
                   MIN_RELEVANCE_SCORE so the model gets real grounding.

  OUT_OF_KB      — nothing in the knowledge base covers this. The measure of
                   success is a REFUSAL: nothing should clear the threshold,
                   so the pipeline tells the model it has no grounding and the
                   model says so rather than inventing an answer. This half
                   matters as much as the first — a retriever that always
                   returns something confident is worse than one that admits
                   a gap.

  Phrasing note  — questions are written the way a clinician would actually
                   type them, including the ones that avoid the entry's own
                   vocabulary ("bleeding heavily after giving birth" rather
                   than "postpartum haemorrhage"). Labelling only queries that
                   quote the source text back would measure string overlap,
                   not retrieval.
"""

# (question, titles that should be retrieved)
IN_KB_QUERIES: list[tuple[str, list[str]]] = [
    (
        "What's the management approach for severe malaria with danger signs?",
        ["Ghana STG — Malaria"],
    ),
    (
        "Patient has had a cough for three weeks with night sweats and weight loss",
        ["Ghana STG — Pulmonary Tuberculosis"],
    ),
    (
        "What's first-line treatment for hypertension?",
        ["Ghana STG — Hypertension"],
    ),
    (
        "What are the danger signs of pre-eclampsia I should watch for?",
        ["Ghana STG — Pre-eclampsia"],
    ),
    (
        "A woman is bleeding heavily after giving birth — what do I do?",
        ["Ghana STG — Postpartum Haemorrhage"],
    ),
    (
        "Child under five with a high fever, how should I work this up?",
        ["Ghana STG — Fever in a Child Under 5"],
    ),
    (
        "How do I manage diabetic ketoacidosis?",
        ["Ghana STG — Diabetic Ketoacidosis"],
    ),
    (
        "Patient presenting with chest pain and shortness of breath",
        ["Ghana STG — Chest Pain / Ischaemic Heart Disease"],
    ),
    (
        "Sudden weakness on one side of the body and slurred speech",
        ["Ghana STG — Acute Stroke"],
    ),
    (
        "Newborn is lethargic, not feeding well and has a temperature",
        ["Ghana STG — Neonatal Sepsis"],
    ),
    (
        "Wheezing patient struggling to breathe, known asthmatic",
        ["Ghana STG — Acute Asthma Exacerbation"],
    ),
    (
        "Burning on passing urine with increased frequency",
        ["Ghana STG — Urinary Tract Infection"],
    ),
    (
        "Severe abdominal pain in a sickle cell patient",
        ["Ghana STG — Sickle Cell Disease: Acute Painful Crisis"],
    ),
    (
        "Patient was bitten by a snake in the field",
        ["Ghana STG — Snake Bite"],
    ),
    (
        "Sudden swelling of the lips and difficulty breathing after an injection",
        ["Ghana STG — Anaphylaxis"],
    ),
    (
        "Stiff neck, photophobia and fever — what should I be thinking about?",
        ["Ghana STG — Acute Bacterial Meningitis"],
    ),
    (
        "Child is severely wasted with visible ribs and poor appetite",
        ["Ghana STG — Severe Acute Malnutrition"],
    ),
    (
        "Watery diarrhoea and vomiting for two days",
        ["Ghana STG — Acute Gastroenteritis"],
    ),
    (
        "Red, painful, swollen skin spreading up the leg",
        ["Ghana STG — Cellulitis"],
    ),
    (
        "Patient is tired with pale conjunctiva and a low haemoglobin",
        ["Ghana STG — Iron-Deficiency Anaemia"],
    ),
    (
        "Recurrent seizures — how is this managed long term?",
        ["Ghana STG — Epilepsy and Seizure Management"],
    ),
    (
        "Low mood, poor sleep and loss of interest for over a month",
        ["Ghana STG — Depression"],
    ),
    (
        "What should routine antenatal care cover?",
        ["Ghana STG — Antenatal Care"],
    ),
    (
        "Child with fever and a blotchy rash starting on the face",
        ["Ghana STG — Measles"],
    ),
    (
        "Patient swallowed a poisonous substance, what are the first steps?",
        ["Ghana STG — Acute Poisoning"],
    ),
]

# Questions with no answer in the knowledge base. Some are clinical but
# uncovered, some are deliberately off-topic — the pipeline should refuse both
# the same way, because "not in the knowledge base" is one category regardless
# of how plausible the question sounds.
OUT_OF_KB_QUERIES: list[str] = [
    "How do I reset a staff member's hospital email password?",
    "What's the best pizza topping?",
    "Explain quantum computing to me.",
    "Who is the current president of Ghana?",
    "What are the hospital's visiting hours?",
    "How do I submit an expense claim for conference travel?",
    "Write me a Python script to sort a list.",
    "What is the treatment protocol for decompression sickness after deep-sea diving?",
]
