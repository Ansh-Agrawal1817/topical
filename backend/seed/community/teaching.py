"""Community posts about teaching: shared units, and the threads they started.

Each post: author, title, body, when (days before the seed date), the linked
document's slug if any, a vote tally (up, down), and its comments as
(author, hours after the post, body).
"""

POSTS = [
    {
        "author": "mokafor", "days_ago": 96, "doc": "rates-of-reaction", "votes": (17, 0),
        "title": "Year 10 rates of reaction unit, with the timings that actually happen",
        "body": """Sharing the rates of reaction unit our department has been refining for a few years. Six lessons plus the thiosulfate required practical.

The thing I'd most like feedback on is the misconceptions section. Every year our summer exam analysis shows the same lost marks: "the particles collide more" instead of "more frequent collisions". I've started being genuinely boring about the wording from lesson one, and last year's results on that question went up, but it's one cohort so I don't trust it yet.

Also, if anyone has a better catalyst demo than liver in hydrogen peroxide I'm all ears. The Year 10s love it but the smell lingers into period 5.""",
        "comments": [
            ("fatima_z", 5, """This is brilliant, thank you. NQT here and I'm teaching this in three weeks. Quick question on the practical: do you have students use a light sensor at all, or is it always the drawn cross? Our department has data loggers sitting in a cupboard and I've never seen them used."""),
            ("mokafor", 7, """We tried the light sensors two years ago. Lovely data, but half the lesson went on getting them to talk to the laptops, and students learned less about the chemistry because the computer did the judging. I'd use them as a demo afterwards to show *why* the cross method has so much scatter. That comparison is actually a great discussion."""),
            ("lfischer", 20, """Not a chemist, but on the catalyst demo: we use catalase from yeast in physics when we do energy and power (don't ask). Dried yeast in warm water with hydrogen peroxide and a drop of washing-up liquid. Very foamy, smells of bread rather than butcher's shop."""),
            ("mokafor", 22, """Elephant's toothpaste with yeast! Of course. I've done it with potassium iodide as the catalyst for open evenings but never thought of it for the actual lesson. Stealing this."""),
            ("kmensah", 31, """The 1/time vs concentration part is where my students always get lost — they don't see why 1/time is a rate. What do you say in that five minutes of discussion?"""),
            ("mokafor", 34, """I ask: "if the cross disappears in 20 seconds, how many 'cross disappearances' per second is that?" Someone says 1/20. Then the same for 40 seconds. Once they see that faster reactions give bigger 1/t, it clicks for most of them. The ones it doesn't click for usually click when they see the graph come out straight."""),
            ("ogrant", 50, """Cross-curricular note: the tangent-drawing in lesson 5 is the same skill our A-level physicists struggle with on velocity–time graphs. If the maths department is willing, it's worth agreeing one way of teaching tangents across all three subjects. We did this last year and it saved us all repeating it."""),
        ],
    },
    {
        "author": "ogrant", "days_ago": 88, "votes": (21, 0),
        "title": "How do you get students to actually read written feedback?",
        "body": """Genuine question, not a rhetorical one. I spend somewhere between four and six hours a week writing comments on Year 12 coursework drafts. I've watched students get the work back, look at the mark, and put it in their bag. The comments might as well not exist.

Things I've tried:
- Withholding the mark until they've responded to the comments (works, but they write "ok will do" and nothing changes)
- Fewer comments (helped a bit)
- Verbal feedback instead (doesn't scale to 60 students)

What's actually worked for you? Particularly interested in anything that doesn't add to marking time.""",
        "comments": [
            ("aishabello", 2, """Whole-class feedback changed my life. I read all the essays, don't write on any of them, and make one sheet: three things lots of people did well, three common errors with an example of each, and a short task. Students then spend the first 20 minutes of the next lesson redrafting a paragraph using the sheet. Marking time dropped by more than half and the redrafts are better than anything my individual comments ever produced."""),
            ("ogrant", 4, """How do you handle the student who's made an error nobody else made? That's half my comments."""),
            ("aishabello", 6, """A coded list. I write a number in the margin, and the sheet has numbered individual issues at the bottom. Takes seconds per script. It's not as personal, but they read the sheet because they have to find their number."""),
            ("kmensah", 9, """We do something similar in maths with "find and fix". I put a dot next to the line where an error is but don't say what it is. They have to find it. It's much more work for them and much less for me, which feels like the right way round."""),
            ("fatima_z", 13, """Saving this whole thread. My mentor keeps telling me to "close the gap" with feedback and I've never been clear on what that means in practice. This is the first time it's made sense."""),
            ("lfischer", 25, """A warning from experience: whole-class feedback works much less well for practical write-ups, because the errors are so specific to each student's data. For those I still write individual comments, but only one per script, and it has to be a question rather than a correction. "What would happen to your gradient if…" gets a response; "gradient wrong" gets ignored."""),
            ("mokafor", 30, """+1 to questions. And give lesson time for responding. If it's homework, it doesn't happen. If it's the first ten minutes of the lesson with you walking round, it happens."""),
            ("sakura_ito", 44, """Music teacher here so different context, but recording a 60-second voice note per student has worked better for me than any written comment. They actually listen to it, partly because it's my voice and partly because it's novel. Takes about the same time as writing three sentences."""),
            ("ogrant", 52, """Lots to try here, thank you all. I'm going to do whole-class feedback with a coded list for the next round of drafts and report back. Aisha, if you're willing to share a template I'd be grateful."""),
            ("aishabello", 55, """Sent you a message with it. It's nothing fancy, a table and a box for the redraft task."""),
        ],
    },
    {
        "author": "kmensah", "days_ago": 74, "doc": "quadratics-completing-square", "votes": (14, 2),
        "title": "Completing the square first, formula second. Does anyone else teach it this way?",
        "body": """I've written up the sequence I use with SHS 2. It takes about a week longer than starting with the quadratic formula, and every year a colleague asks why I'm "wasting time" when the formula is on the formula sheet anyway.

My argument is that completing the square is the method that also gives you the turning point, the sketch and the inequalities, so it's not a detour. But I'm aware I might be the person with the hammer seeing nails everywhere. Curious what others do.""",
        "comments": [
            ("lfischer", 6, """Physics teacher, but I see the downstream effect: students who learned completing the square can rearrange equations in kinematics far more confidently. The formula-only students treat every quadratic as a black box. I'm on your side."""),
            ("ogrant", 11, """Devil's advocate: for a lower set with limited time before an exam, the formula gets marks on a predictable question type faster. I've seen colleagues make that choice deliberately, and I don't think it's wrong for that group."""),
            ("kmensah", 14, """That's fair, and I've done it myself with a Year 11 resit group. Though I'd say even then, a single lesson on why the formula works pays off — they make fewer sign errors when they know where the -b comes from."""),
            ("jlindqvist", 27, """From the university end: the students who arrive able to complete the square cope much better with integrals like $\\int \\frac{dx}{x^2 + 4x + 13}$, which is completing the square in disguise. The ones who only know the formula are stuck there for weeks."""),
            ("bencarter", 40, """Student perspective, I was taught formula first and only understood what a discriminant actually *was* in my first term of uni. The derivation in your lesson 4 would have saved me a lot of confusion."""),
            ("kmensah", 43, """Thank you all. Ben, that's exactly the student I'm writing this for."""),
        ],
    },
    {
        "author": "aishabello", "days_ago": 61, "doc": "things-fall-apart-unit", "votes": (12, 0),
        "title": "Things Fall Apart unit. What do you do about students who haven't read it?",
        "body": """Our unit assumes the novel was read over half-term. In reality about two thirds of the class have read it, a few have read the first 50 pages, and two or three have read a summary online.

I've built week one so it works either way: lots of reading aloud, and chapter-level tasks. But by week three, the ones who haven't read it are relying entirely on what's discussed in class, and their essays show it.

Do you set reading checks? Read aloud the whole thing? Accept that some won't and plan around it? I'd rather not turn it into quizzes, which I think kill the book.""",
        "comments": [
            ("isolberg", 3, """The library has the audiobook on our lending platform, and we've found students who won't read 200 pages will often listen to them on the bus. Might be worth recommending explicitly, framed as another way in rather than a shortcut."""),
            ("aishabello", 5, """I didn't know we had it. That's a really good idea, and less of a fight than a reading log."""),
            ("fatima_z", 18, """We had the same problem with Of Mice and Men in my placement school. The department read it aloud in class, every word, with students taking parts. It took longer but nobody fell behind, and the read-aloud discussion was some of the best I saw all year. Probably harder with a longer novel though."""),
            ("ogrant", 28, """Not English, but a thought from computing: the students who skip reading are often the ones who don't know how to read a long text strategically. Would a lesson on how to read a novel for an exam (skimming, tracking a theme, marking pages) help?"""),
            ("aishabello", 33, """We do a version of that in Year 9, but it's fair that it doesn't stick. I think a short refresher at the start of the unit, with this novel's structure as the example, is worth trying. The three-part structure actually makes it a good book to practise on."""),
        ],
    },
    {
        "author": "fatima_z", "days_ago": 29, "votes": (19, 0),
        "title": "NQT here. How do you plan a week without drowning?",
        "body": """First term as a newly qualified science teacher. 22 lessons a week across Years 7, 9, 10 and one Year 12 group I share. I'm planning until 11pm most nights and still walking into some lessons underprepared.

I know everyone says "it gets easier", and I believe them, but I'd love practical advice on what to cut, what to reuse, and what experienced teachers actually spend time on. Thanks in advance, this community has already been more helpful than my induction sessions.""",
        "comments": [
            ("mokafor", 1, """First: it does get easier, and the reason it gets easier is that you build up resources you can reuse. So every lesson you plan this year, save it somewhere you'll find it again, even the bad ones. Next year you're editing, not writing.

Second: you do not need a new resource for every lesson. A good question on the board, a demo, a well-chosen exam question and a conversation can be an excellent lesson."""),
            ("ogrant", 3, """Plan in sequences, not lessons. Sit down once a week, plan the whole week for one group at once (outcomes, activities, the one thing you'll check), and you'll find half the planning is already done because lessons build on each other."""),
            ("kmensah", 6, """Use your department's existing schemes, even if they're not how you'd do it. You can make them yours in year two. Year one is for survival and noticing what you'd change."""),
            ("lfischer", 9, """And protect one evening a week completely. I didn't in my first year and burned out by February. Nobody will tell you to stop working. You have to decide it yourself."""),
            ("aishabello", 12, """Marking: don't mark everything in depth. Decide in advance which pieces get detailed feedback (maybe one per half-term per class) and do quick checks on the rest. Your mentor should back you on this. If they don't, ask your head of department."""),
            ("fatima_z", 20, """This is all so helpful. The sequence-not-lesson idea in particular, I've been treating every lesson as a separate thing to invent. Going to try planning Year 10 as a whole week this Sunday."""),
            ("mokafor", 22, """Also feel free to take my rates of reaction unit wholesale when you get there. That's what it's for."""),
            ("samw", 47, """Not a teacher, but my partner was an NQT a few years ago. The thing that helped her most was a colleague who said "good enough is good enough" and meant it. Most of your lessons only need to be good enough."""),
        ],
    },
    {
        "author": "sakura_ito", "days_ago": 54, "doc": "voice-leading", "votes": (9, 0),
        "title": "Four-part harmony handout for Grade 6–8 theory students",
        "body": """I've put my voice-leading handout up. It's aimed at students who've been told "you've got parallel fifths" by an examiner and have no idea why that's a problem. The approach is to explain the *why* behind each rule, so they can see them as describing independent voices rather than as arbitrary prohibitions.

The worked example at the end includes the most common mistake I see (a final chord with no third), on purpose. Happy to hear if that's confusing rather than helpful.""",
        "comments": [
            ("samw", 4, """Hobby guitarist here, so feel free to tell me this is a different world. Rock music is full of parallel fifths. Every power chord moved up a fret is one. Why does that sound fine there and "wrong" in a chorale?"""),
            ("sakura_ito", 6, """Great question, and it's exactly the point of the handout. In a power chord you *want* the two notes to fuse into one thick sound, so parallel fifths are doing the job. In a chorale the aim is four separate melodies, and parallel fifths make two of them merge into one. Same sound, different goal. The "rule" only applies to the style that wants independent voices."""),
            ("samw", 7, """That actually makes total sense. Never had it explained that way."""),
            ("aishabello", 26, """I sing alto in a community choir and the bit about inner voices moving as little as possible explains so much about why alto parts are so boring to sing. Respectfully."""),
            ("sakura_ito", 28, """Ha! The altos are the glue. Boring to sing, impossible to do without."""),
        ],
    },
    {
        "author": "lfischer", "days_ago": 47, "doc": "special-relativity", "votes": (11, 0),
        "title": "Special relativity from two postulates (Year 12), LaTeX source included",
        "body": """Sharing my notes for the first four lessons of our relativity unit. Everything comes from the two postulates, with nothing harder than Pythagoras. I find students accept time dilation much more readily when they've derived it from the light clock themselves than when it's handed to them.

The simultaneity section is the one I'm least happy with. It's the hardest idea and I suspect it needs a diagram I haven't drawn yet.""",
        "comments": [
            ("jlindqvist", 8, """Nice notes. On simultaneity: a spacetime diagram with the two observers' lines of simultaneity drawn in usually does it. Once students see the tilted line of "now" for the moving observer, the train example stops feeling like a trick. You could draw it with TikZ in a proper LaTeX setup, though I'm not sure Topical renders TikZ."""),
            ("lfischer", 10, """It doesn't, I checked. I'll draw it by hand and include it as an image. Good idea though, the tilted line is exactly what's missing."""),
            ("bencarter", 21, """On problem 4 (the twins), the explanation I always get is "the travelling twin accelerates". But you can set it up so both twins accelerate. Is that answer actually wrong, or just incomplete?"""),
            ("lfischer", 24, """Incomplete, and you've found the reason it's a famous puzzle. What matters is the *path through spacetime*. The travelling twin changes inertial frame at the turnaround, so their worldline is bent, and the bent path between the same two events has less proper time. Acceleration is how you bend it, but the asymmetry is in the geometry, not in the acceleration itself. If both twins accelerate in the same way, they age the same."""),
            ("kmensah", 39, """The muon example is perfect for showing students that a formula can be checked against the real world. I might borrow it for an algebra lesson on substitution."""),
        ],
    },
    {
        "author": "isolberg", "days_ago": 35, "doc": "evaluating-sources", "votes": (13, 0),
        "title": "Our 'evaluating sources' workshop, rebuilt around lateral reading",
        "body": """We replaced our checklist-based source evaluation workshop with one built around lateral reading: leave the page to find out about the page. It's the habit professional fact-checkers use, and it's teachable in ninety minutes.

The full session plan is attached. The warm-up (two polished health websites, one of them funded by an interested industry) is the part that does the most work. Roughly half the room picks the wrong one before the lateral reading demo, and almost nobody does afterwards.""",
        "comments": [
            ("bencarter", 2, """I was in one of these sessions in October! The two websites thing genuinely got me, I picked the wrong one and was annoyed about it for a week. I've used "search the name not the topic" for every essay since."""),
            ("isolberg", 4, """That's lovely to hear, and the annoyance is a big part of why it sticks."""),
            ("aishabello", 15, """Would this work for Year 12? Our EPQ students need exactly this and most of them have never been shown how to check a source."""),
            ("isolberg", 18, """Yes, with simpler examples. The finding-the-original exercise works especially well at that age because news coverage of "new studies" is so often wrong in an obvious way once you read the abstract."""),
            ("ogrant", 30, """The point about not using political examples is wise. We tried a version of this in PSHE with a political topic and it became a shouting match within five minutes."""),
            ("grace_a", 41, """The click restraint thing is underrated. I've caught myself using the first Google result as a source more times than I'd like to admit."""),
        ],
    },
    {
        "author": "ogrant", "days_ago": 18, "votes": (8, 0),
        "title": "Sharing outlines between teachers in a department. How are you doing it?",
        "body": """Our department (four of us) is moving our schemes of work into Topical. The outline-first approach suits us, since we already think in units → lessons → activities.

What I haven't worked out is the best way to share. Right now one person owns each document and adds the others as co-authors. That works, but it means there's no "department copy" that survives if someone leaves. How are other departments handling this?""",
        "comments": [
            ("mokafor", 6, """We have a shared department account that owns the master copies, and everyone's a co-author. Not elegant, but it means nothing disappears when someone moves school. Personal adaptations live in each teacher's own copy."""),
            ("ogrant", 8, """A shared account is what I was trying to avoid, but you're probably right that it's the practical answer for now."""),
            ("priyar", 15, """Software person lurking: the branching in version history might fit this. Keep the department version on main, and have each teacher work on a branch, merging back the sections that worked. The section-level merge is basically made for "I changed lesson 3 but not the rest"."""),
            ("ogrant", 19, """Ooh, I hadn't thought of branches that way. That's very close to what we actually want. Will try it with the Year 12 scheme."""),
            ("kmensah", 33, """Following this. Our maths department has the same problem plus a second one: different teachers want to use the same unit with different timings."""),
        ],
    },
    {
        "author": "kmensah", "days_ago": 6, "votes": (7, 0),
        "title": "Mock exam season survival thread",
        "body": """It's that time. 140 papers to mark by Friday week. What gets you through? Snacks, systems, playlists, all welcome.""",
        "comments": [
            ("mokafor", 1, """Mark one question across all papers before moving to the next. Faster, fairer, and you stop needing to re-read the mark scheme."""),
            ("aishabello", 2, """Standardise with a colleague on five scripts first. Saves arguments later. And biscuits."""),
            ("fatima_z", 3, """First mock season. Reading this with great interest and some fear."""),
            ("lfischer", 5, """A timer. 25 minutes on, 5 off. Otherwise I look up and it's midnight and I've marked eleven papers."""),
            ("ogrant", 9, """Record the common errors as you go. By the end you have your whole-class feedback sheet written and you didn't even notice."""),
            ("kmensah", 11, """Ogrant, that's two birds with one stone. Doing it."""),
        ],
    },
]
