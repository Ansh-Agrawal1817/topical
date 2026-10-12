"""The demo community: who they are, and when they joined.

Every demo account's email ends in ``DEMO_DOMAIN`` (a reserved name that can
never receive mail), which is how ``seed.remove`` finds exactly what the seed
added and nothing else. None of them has a password, so none can be signed into.
"""

DEMO_DOMAIN = "demo.example"

#: (username, given name, family name, bio, joined — days before the seed date)
PEOPLE = [
    ("mokafor", "Maya", "Okafor",
     "Chemistry teacher in Leeds. 14 years of Year 10s and I still get excited about the iodine clock.", 205),
    ("therrera", "Tomás", "Herrera",
     "PhD student, computational biology. Mostly alignments, occasionally trees, always bootstrapping.", 198),
    ("priyar", "Priya", "Raman",
     "Backend engineer. I write things down so I stop re-learning them at 2am during an incident.", 190),
    ("jlindqvist", "Jonas", "Lindqvist",
     "Lecturer in analysis. LaTeX since 2004, still can't remember the tabular syntax.", 186),
    ("grace_a", "Grace", "Adeyemi", "Econ undergrad. Revising out loud.", 171),
    ("dbrooks", "Daniel", "Brooks",
     "Retired electrical engineer. Volunteer at a computing museum on Thursdays. Ask me about mercury delay lines.", 168),
    ("sakura_ito", "Sakura", "Ito",
     "Piano and theory teacher. Bach chorales are a personality trait.", 160),
    ("hrezaei", "Hamid", "Rezaei", "Fourth-year medical student. Renal is my nemesis and also my favourite.", 151),
    ("lfischer", "Lena", "Fischer",
     "Physics teacher (Gymnasium, Freiburg). Converting a decade of handwritten notes, slowly.", 147),
    ("mchen_data", "Marcus", "Chen", "Data scientist at a subscription company. Bayesian when nobody's looking.", 139),
    ("aishabello", "Aisha", "Bello", "English teacher, KS4/KS5. Reading lists, schemes of work, too many sticky notes.", 133),
    ("ogrant", "Oliver", "Grant", "Head of Computing at a comprehensive in Bristol.", 126),
    ("npetrova", "Nadia", "Petrova", "Linguist. Phonology, fieldwork, and arguing about schwa.", 118),
    ("ravi-iyer", "Ravi", "Iyer", "Structural engineer. Writes the explanation he wished he'd had as a graduate.", 109),
    ("chloem", "Chloé", "Martin", "Climate science MSc. Carbon, mostly.", 97),
    ("samw", "Sam", "Whitfield", "", 92),
    ("elifkaya", "Elif", "Kaya", "Product designer. Typography nerd. I notice your widows.", 84),
    ("kmensah", "Kwame", "Mensah", "Maths teacher in Accra. Completing the square evangelist.", 71),
    ("isolberg", "Ingrid", "Solberg", "Subject librarian. I run the 'is this source any good' workshops.", 63),
    ("bencarter", "Ben", "Carter", "First year, natural sciences.", 41),
    ("fatima_z", "Fatima", "Zahra", "Secondary science teacher, newly qualified. Stealing everyone's good ideas.", 33),
    ("wkowalski", "Wojciech", "Kowalski", "SRE. Postmortems are a genre.", 22),
]
