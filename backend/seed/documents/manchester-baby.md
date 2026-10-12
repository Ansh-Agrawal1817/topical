# The Manchester Baby, 1948

On 21 June 1948 a machine in a converted room at the University of Manchester ran a program of 17 instructions for 52 minutes and found the highest proper factor of $2^{18}$. The answer, 131,072, was not news to anyone. What was new was *how* it was found: the program and its data sat together in an electronic memory, and the machine fetched its own instructions from that memory as it ran. That is the stored-program idea, and the Small-Scale Experimental Machine, everyone's "Baby", was the first computer to do it.

I volunteer on the replica at the Science and Industry Museum, and these are the notes I give new volunteers before their first Thursday.

## The problem it was built to solve

By 1946 several groups knew *what* a stored-program computer should be. The hard part was memory. A machine that holds its program in memory needs a store that is fast enough to keep up with the arithmetic, large enough to hold a useful program, and cheap enough to build. The mercury delay lines used elsewhere stored bits as sound pulses travelling through a tube of mercury, which worked but was awkward: you had to wait for the bit you wanted to come round again.

Freddie Williams and Tom Kilburn had a different idea. A cathode-ray tube, like the one in a radar display, leaves a small charged spot on its screen wherever the beam hits. The charge fades within a fraction of a second, but it can be read back and rewritten before it does. A dot could be a 1, a dash could be a 0. That is the Williams–Kilburn tube.

The Baby was built to answer one question: does the tube work as a computer memory, reliably, while a real program runs? Everything else about the machine was kept as simple as possible so that it would not get in the way of that test.

## What it could do

The Baby was deliberately minimal.

| Feature | The Baby |
|---|---|
| Word length | 32 bits |
| Main store | 32 words, on one Williams–Kilburn tube |
| Instructions | 7 |
| Speed | about 1,100 instructions per second |
| Input | switches, one bit at a time |
| Output | the pattern of dots on a display tube |

Seven instructions is not a typo. There was no addition, only subtraction and negation; to add $a$ and $b$ you computed $a - (-b)$. There was no multiplication or division at all, which is why the first program found factors by repeated subtraction.

## The first program

Kilburn's program searched for the highest factor of $N = 2^{18}$ by trying every candidate from $N - 1$ downwards, and testing each one by subtracting it from $N$ repeatedly until the remainder was zero or negative. It is, by any modern standard, a terrible algorithm. That was the point: it kept the memory busy, accessing it millions of times, for the best part of an hour. If the tube could survive that without dropping a bit, it could survive anything a real program would do.

It ran correctly. Williams later said that the moment the correct answer appeared on the display was one of the most exciting of his life, which is quite something from a man who had spent the war building radar.

## Why it matters, and why it doesn't

It is easy to overclaim. The Baby was not the first electronic computer: Colossus at Bletchley Park and ENIAC in Pennsylvania came earlier. Neither of them stored its program in memory, though. Colossus was configured with switches and plugs, and ENIAC was programmed by rewiring, which could take days.

It is also easy to underclaim. The Baby itself did no useful work, and it was dismantled within a year. But it proved the memory, and the memory made everything after it possible. The Manchester Mark 1 followed in 1949, and the Ferranti Mark 1, the world's first commercially available general-purpose computer, was delivered in 1951. Williams–Kilburn tubes were licensed to IBM for the 701.

## The replica

The machine in the museum was built by a team of volunteers led by Chris Burton and switched on in 1998, for the fiftieth anniversary. Very little of the original survived, so the team worked from photographs, notebooks, a handful of original components, and interviews with people who had built the first one. Several of the photographs had to be enlarged until individual solder joints could be traced.

When visitors ask what it does, the honest answer is that it does what the original did: it runs tiny programs very slowly, with lights. What it *shows* is how little you need. Thirty-two words of memory, seven instructions, and one good idea about where to keep the program.

## Things volunteers get asked a lot

- **"Is that a screen?"** It is the monitor tube, showing the contents of the store. The memory itself is in another tube you can't see directly.
- **"Could it play a game?"** People have written games for the replica since, including a version of Noughts and Crosses, but it takes some ingenuity with 32 words.
- **"Why is it called the Baby?"** It was a small-scale experimental machine, built to test an idea before the full-size one. The nickname stuck because it was the small version of something bigger.
