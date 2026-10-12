"""Community posts: history, humanities, questions about writing, and the app itself."""

POSTS = [
    {
        "author": "dbrooks", "days_ago": 101, "doc": "manchester-baby", "votes": (18, 0),
        "title": "The Manchester Baby: notes I give new volunteers at the replica",
        "body": """I volunteer on the replica of the Small-Scale Experimental Machine at the Science and Industry Museum in Manchester. These are the notes I give new volunteers before their first shift: what the Baby was built to prove, why seven instructions were enough, and the questions visitors ask most.

If you're ever in Manchester on a Thursday, come and say hello. I'll show you the Williams tube.""",
        "comments": [
            ("ogrant", 8, """I use the Baby every year when we teach the fetch–execute cycle. "Seven instructions, one of them is subtract, there's no add" gets the room's attention better than anything in the textbook. Didn't know the replica was built from photographs of solder joints, that's wonderful."""),
            ("dbrooks", 10, """The photograph work was extraordinary. Some of the original builders were still alive in the 90s and came in to check the replica against their memories. One of them pointed at a component and said "that's in the wrong place", and he was right."""),
            ("bencarter", 26, """How did they program it, if input was switches one bit at a time? Was every program entered by hand every time?"""),
            ("dbrooks", 29, """Yes, bit by bit on a row of switches, one word at a time. The first program was 17 instructions, so not too bad. Later Manchester machines added paper tape, which came from the teleprinter world. Alan Turing wrote the programming manual for the Ferranti Mark 1, and by most accounts it was very hard to read."""),
            ("samw", 47, """My grandfather worked at Ferranti in the 50s, on the commercial side. He used to say the engineers all talked about "the tube" like it was a temperamental pet. Lovely to read the story properly."""),
            ("dbrooks", 49, """That's exactly how people describe them. Williams tubes needed constant adjustment, and each one behaved slightly differently. Thank you for sharing that."""),
            ("elifkaya", 70, """Great read. The table of specifications says more about how far we've come than any essay could."""),
        ],
    },
    {
        "author": "grace_a", "days_ago": 52, "doc": "anchoring-notes", "votes": (8, 0),
        "title": "ECON 214 anchoring notes. Is my policy section wrong?",
        "body": """Revision notes on anchoring and adjustment: the classic studies, the two explanations from lecture 7, real-world evidence, and where the evidence is weaker.

The policy and nudges section is the bit I'm least sure about. In particular, I don't know if it's right to say defaults are "partly anchoring". Would love a sanity check from anyone who's done behavioural econ more seriously than a second-year module.""",
        "comments": [
            ("mchen_data", 5, """You're right to be cautious. Default effects are usually explained by inertia (effort to change), implied endorsement (people assume the default is recommended) and loss aversion relative to the default. Anchoring might play a small part in where people set a contribution rate *after* opting to change, but I wouldn't lead with it. Your instinct to separate them in the exam is good."""),
            ("grace_a", 7, """That's really helpful, especially "implied endorsement", which I'd missed completely."""),
            ("isolberg", 16, """For the replication point: the Many Labs project papers are the ones your tutor will want to see cited. Happy to help you find them if the library search is being difficult, it often is with those."""),
            ("grace_a", 18, """Yes please, I couldn't find the first one at all. I'll pop into the library this week."""),
            ("jlindqvist", 35, """The judges-and-dice study still astonishes me every time someone mentions it."""),
        ],
    },
    {
        "author": "jlindqvist", "days_ago": 79, "votes": (6, 0),
        "title": "LaTeX \\newcommand across the whole document?",
        "body": """I've moved my Analysis II notes into a LaTeX document here. I define a few macros at the top, things like `\\newcommand{\\R}{\\mathbb{R}}` and `\\newcommand{\\norm}[1]{\\lVert #1 \\rVert}`. They work in the read view and in the PDF export.

Two questions:
1. Do macros defined in one section apply in later sections? (They seem to, but I want to be sure I'm not relying on an accident.)
2. Is there any way to share a set of macros between documents, or do I paste them into each one?""",
        "comments": [
            ("lfischer", 4, """1: yes, in my experience they're collected from the whole document, so position doesn't matter much. I keep mine at the very top anyway, out of habit and so other people can find them.

2: I paste them, I'm afraid. I keep a "preamble" snippet in a text file."""),
            ("jlindqvist", 6, """Thanks Lena. Pasting it is then. A shared preamble would be a nice feature for anyone with a course's worth of documents."""),
            ("elifkaya", 22, """+1 for shared preambles. Or more generally, document templates: same macros, same structure, same page style."""),
        ],
    },
    {
        "author": "elifkaya", "days_ago": 31, "doc": "typesetting-for-screens", "votes": (14, 0),
        "title": "A checklist for typesetting long documents for the screen",
        "body": """Wrote down the typesetting decisions that make long documents comfortable to read on a screen, roughly in order of impact: measure, line height, size, typeface, hierarchy, the small details, and dark mode. Each comes with the reasoning so you can tell when to break it.

Not a rule book. Most of this is centuries old; the screen just made it easy to forget.""",
        "comments": [
            ("jlindqvist", 5, """You don't mention justified text much. For long mathematical documents I've always justified, because that's what printed books do. Is that wrong on screen?"""),
            ("elifkaya", 7, """Not wrong, but it needs hyphenation to work. Browsers justify line by line with no lookahead, so without hyphenation you get big uneven gaps, especially in narrow columns. With `hyphens: auto` and a decent measure, justified text can look very good. Left-aligned is the safer default if you can't control those."""),
            ("aishabello", 18, """The "more space above a heading than below" point is something I've never seen explained and now can't unsee. Half my worksheets get it wrong."""),
            ("sakura_ito", 29, """Dark mode section is spot on. Pure white on black gives me a headache after twenty minutes."""),
            ("ogrant", 44, """Sharing this with our department. We produce a lot of long documents for students and most of them are 11pt Calibri across a full A4 width."""),
            ("elifkaya", 46, """The full-width Calibri document is the natural habitat of the 140-character line. You're doing good work."""),
        ],
    },
    {
        "author": "npetrova", "days_ago": 38, "doc": "phonemes-allophones", "votes": (9, 0),
        "title": "The minimal pairs exercise that finally worked with my second-years",
        "body": """Every year I struggle to get students to *hear* allophones in their own language. This year I started the seminar with the hand-in-front-of-your-mouth test for aspiration (top vs stop), and it worked better than any amount of IPA on the board. Notes from the seminar are attached, including the Spanish [d]/[ð] exercise, which always produces a good argument.""",
        "comments": [
            ("elifkaya", 8, """Turkish speaker here. /v/ and /w/ are not separate phonemes in Turkish, and it took me years of living in London to stop saying "wery" for "very" (or rather, to stop mixing them up in both directions). Reading your exercise 1 was oddly emotional."""),
            ("npetrova", 11, """Thank you for sharing that, it's exactly the experience the exercise is trying to make visible. It's not a hearing problem; your phonology was doing its job, which is to ignore differences that don't matter in your language."""),
            ("bencarter", 24, """Did exercise 3. I'm from Swindon and "latter" and "ladder" are identical for me, which my flatmate (from Yorkshire) found hilarious."""),
            ("npetrova", 26, """Perfect data! That's flapping. Your flatmate probably has a glottal stop there instead, which is a different rule for the same phoneme."""),
            ("sakura_ito", 50, """Music teacher, completely out of my depth, but this explains why some of my students can't hear the difference between two pitches that sound obviously different to me. Same thing, categories learned early."""),
        ],
    },
    {
        "author": "bencarter", "days_ago": 25, "votes": (12, 3),
        "title": "Is it cheating to use AI to draft my lab report introduction?",
        "body": """Genuine question, not trying to start a fight. My department's policy says AI tools are allowed "for brainstorming and language support" but not for "generating assessed content". The introduction of a lab report is mostly background I'd be summarising from the textbook anyway.

If I get AI to draft the background and then rewrite it heavily, check every claim and add references, is that "language support" or "generating content"? Asking before I hand anything in.""",
        "comments": [
            ("isolberg", 2, """Ask your module convenor, in writing, and keep the reply. Policies are being written faster than they're being interpreted, and the honest answer to your question varies between departments. Asking is never held against you."""),
            ("therrera", 5, """From someone who marks first-year lab reports: the introduction isn't marked as "background". It's marked on whether you've chosen the background that matters for *this* experiment and explained why. That's the bit a draft from a model is worst at, and it's the bit you'd be learning to do. So I'd say the risk isn't just the rules."""),
            ("jlindqvist", 9, """Agree with Tomás. And whatever you decide, keep the drafts. If anyone ever asks how you wrote it, a history of versions is the most convincing evidence you can have."""),
            ("grace_a", 16, """Our econ department added a declaration form where you say what you used AI for. Honestly it made me use it less, because I didn't want to have to explain it."""),
            ("ogrant", 22, """From the school side: the students who use these tools well are the ones who can already write without them. I'd draft the intro yourself first, then use a tool to point out what's unclear, if your policy allows it. Same tool, completely different learning."""),
            ("bencarter", 30, """This is really useful, thanks all. I'm going to email the convenor and write the draft myself. Tomás's point about "background that matters for this experiment" is the thing I hadn't understood about what we're being marked on."""),
        ],
    },
    {
        "author": "samw", "days_ago": 13, "votes": (3, 0),
        "title": "Exporting to PDF: margins look off on A4?",
        "body": """Exported a document to PDF to print for a woodworking club handout. On A4 the left margin looks noticeably bigger than the right, and the text block seems narrow for the page. Is that intended, or have I done something odd? US Letter looks fine, as far as I can tell from the preview.""",
        "comments": [
            ("elifkaya", 3, """Probably intended, at least the narrow text block: long-form layouts often keep a comfortable line length rather than filling the page, so on a wider page you get more margin. If the left margin is bigger than the right, check whether you've got a binding margin or a "mirror margins" style option on. That's designed for double-sided printing, where the inner margin is wider."""),
            ("samw", 6, """That was it, I'd picked the book-style option. Switched it off and it's even now. Thank you!"""),
            ("elifkaya", 7, """No problem. For a one-sided handout, plain margins are the right choice."""),
        ],
    },
    {
        "author": "therrera", "days_ago": 9, "votes": (10, 0),
        "title": "What are you writing this month?",
        "body": """Monthly-ish thread. I'll start: finishing the methods chapter of my thesis, which is mostly a very long apology for my choice of substitution model.""",
        "comments": [
            ("mokafor", 2, """A Year 11 electrolysis revision booklet, and a strongly worded email to the exam board about a question with two correct answers."""),
            ("priyar", 3, """Runbooks. Glamorous."""),
            ("jlindqvist", 4, """Problem sheets for Analysis II, and solutions I promise myself I'll finish before the students need them this time."""),
            ("chloem", 6, """Literature review on soil carbon measurement. I have learned that nobody measures it the same way twice."""),
            ("bencarter", 8, """A lab report introduction. Written by me, after the thread last week."""),
            ("sakura_ito", 9, """A set of sight-singing exercises for my adult beginners."""),
            ("wkowalski", 12, """Another postmortem. Different cache, same story."""),
            ("hrezaei", 20, """Notes on acid–base disorders. Send help."""),
            ("dbrooks", 30, """An illustrated guide to mercury delay lines for school groups. It's harder than it sounds to explain why you'd store data in a tube of mercury."""),
        ],
    },
    {
        "author": "priyar", "days_ago": 15, "votes": (11, 1),
        "title": "Feature request: comments on specific paragraphs",
        "body": """When a colleague reviews one of my documents, they currently message me with "in the section on snapshots, the third paragraph...". It would be great to be able to attach a comment to a passage directly, the way you can in most document editors, and resolve it when it's addressed.

Anyone else want this? Or is there a workflow I'm missing?""",
        "comments": [
            ("ogrant", 4, """Yes please. Our department review process is currently a shared spreadsheet of "line references", which breaks as soon as anyone edits the document."""),
            ("wkowalski", 7, """The AI collaborators sort of do this for automated review, suggestions anchored to the exact text. Seems like the same mechanism could carry human comments."""),
            ("aishabello", 11, """Would be really useful for students too, if they could comment on a shared reading guide."""),
            ("jlindqvist", 19, """Mild objection: comments in documents tend to accumulate and never get resolved. If it's built, I'd want resolving to be easy and resolved comments to disappear by default."""),
            ("priyar", 21, """Agreed. Resolve-and-hide by default, with a way to see the history."""),
        ],
    },
]
